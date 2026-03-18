import { query, transaction } from '../config/db';
import type { HikCentralVehicleEvent } from '../integrations/hikcentral/types';
import { ANPR_CAMERAS } from '../config/anprCameras';

/**
 * Map HikCentral tag color to database category
 * GREEN → SEZ, YELLOW → KC
 */
export function mapTagColorToCategory(tagColor: string): 'SEZ' | 'KC' {
  return tagColor === 'GREEN' ? 'SEZ' : 'KC';
}

/**
 * Map database category to frontend sticker color
 * SEZ → green, KC → yellow
 */
export function mapCategoryToStickerColor(category: string): 'green' | 'yellow' {
  return category === 'SEZ' ? 'green' : 'yellow';
}

/**
 * Process a single vehicle event (transaction-safe)
 * This function:
 * 1. UPSERTs into vehicles table
 * 2. INSERTs into vehicle_events (immutable log)
 * 3. INSERTs or UPDATEs vehicle_state (current occupancy)
 * 4. Prevents duplicate IN/OUT entries
 */
export async function processVehicleEvent(
  event: HikCentralVehicleEvent,
  gateName: string = 'Unknown Gate'
): Promise<
  | ((
      | {
          vehicleNumber: string;
          ownerName: string | null;
          category: 'SEZ' | 'KC';
          createdAt: string;
          cameraIndexCode: string | null;
          cameraName: string | null;
          gate: string | null;
          direction: 'ENTRY' | 'EXIT' | null;
        }
      | Record<string, never>
    ) & { eventTime?: string; eventType?: 'IN' | 'OUT' })
  | null
> {
  const category = mapTagColorToCategory(event.tagColor);
  const cameraMeta = event.cameraIndexCode ? ANPR_CAMERAS[String(event.cameraIndexCode)] : undefined;
  const movementDirection: 'IN' | 'OUT' =
    cameraMeta?.direction === 'ENTRY' ? 'IN' : cameraMeta?.direction === 'EXIT' ? 'OUT' : event.eventType;
  const eventTime = new Date(event.eventTime);

  return await transaction(async (client) => {
    // 1. UPSERT vehicle information
    const upsertVehicle = await client.query(
      `INSERT INTO vehicles (
         vehicle_number,
         owner_name,
         category,
         camera_index_code,
         camera_name,
         gate,
         direction,
         created_at
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         COALESCE((SELECT created_at FROM vehicles WHERE vehicle_number = $1::varchar), CURRENT_TIMESTAMP)
       )
       ON CONFLICT (vehicle_number) 
       DO UPDATE SET 
         owner_name = EXCLUDED.owner_name,
         category = EXCLUDED.category,
         camera_index_code = EXCLUDED.camera_index_code,
         camera_name = EXCLUDED.camera_name,
         gate = EXCLUDED.gate,
         direction = EXCLUDED.direction
       RETURNING vehicle_number, owner_name, category, created_at, camera_index_code, camera_name, gate, direction`,
      [
        event.plateNo,
        event.ownerName ?? null,
        category,
        (cameraMeta ? String(event.cameraIndexCode) : event.cameraIndexCode ? String(event.cameraIndexCode) : null) ??
          null,
        (cameraMeta?.name ?? (event.cameraName ? String(event.cameraName) : null)) ?? null,
        (cameraMeta?.gate ?? (gateName !== 'Unknown Gate' ? gateName : null)) ?? null,
        (cameraMeta?.direction ?? null) as 'ENTRY' | 'EXIT' | null,
      ]
    );

    // 2. INSERT into vehicle_events (immutable log) with DB-level dedupe.
    // Requires unique index on (vehicle_number, direction, event_time, gate_name).
    const eventInsert = await client.query(
      `INSERT INTO vehicle_events (vehicle_number, category, direction, event_time, gate_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (vehicle_number, direction, event_time, gate_name)
       DO NOTHING`,
      [
        event.plateNo,
        category,
        movementDirection,
        eventTime,
        cameraMeta?.gate ?? gateName,
      ]
    );

    // If this exact event was already recorded, avoid re-applying state transitions.
    if (eventInsert.rowCount === 0) {
      return null;
    }

    // 3. Check current state to prevent invalid transitions
    const stateResult = await client.query(
      'SELECT is_inside FROM vehicle_state WHERE vehicle_number = $1',
      [event.plateNo]
    );

    const currentState = stateResult.rows[0];
    const isCurrentlyInside = currentState?.is_inside ?? false;

    // Prevent duplicate IN if already inside
    if (movementDirection === 'IN' && isCurrentlyInside) {
      console.log(`⚠️  Vehicle ${event.plateNo} already inside, ignoring duplicate IN event`);
      return null;
    }

    // Prevent OUT if vehicle is not inside
    if (movementDirection === 'OUT' && !isCurrentlyInside) {
      console.log(`⚠️  Vehicle ${event.plateNo} not inside, ignoring invalid OUT event`);
      return null;
    }

    // 4. INSERT or UPDATE vehicle_state
    if (movementDirection === 'IN') {
      await client.query(
        `INSERT INTO vehicle_state (vehicle_number, category, is_inside, last_event_time)
         VALUES ($1, $2, TRUE, $3)
         ON CONFLICT (vehicle_number)
         DO UPDATE SET
           category = EXCLUDED.category,
           is_inside = TRUE,
           last_event_time = EXCLUDED.last_event_time`,
        [event.plateNo, category, eventTime]
      );
    } else if (movementDirection === 'OUT') {
      await client.query(
        `UPDATE vehicle_state
         SET is_inside = FALSE,
             last_event_time = $1,
             category = $2
         WHERE vehicle_number = $3`,
        [eventTime, category, event.plateNo]
      );
    }

    const row = upsertVehicle.rows?.[0];
    return row
      ? {
          vehicleNumber: row.vehicle_number,
          ownerName: row.owner_name,
          category: row.category,
          createdAt: new Date(row.created_at).toISOString(),
          cameraIndexCode: row.camera_index_code,
          cameraName: row.camera_name,
          gate: row.gate,
          direction: row.direction,
          eventTime: event.eventTime,
          eventType: movementDirection,
        }
      : null;
  });
}

/**
 * Get current dashboard statistics
 */
export async function getDashboardStats() {
  // Get total vehicle count
  const totalResult = await query(
    'SELECT COUNT(*) as count FROM vehicles'
  );
  const totalVehicles = parseInt(totalResult.rows[0]?.count || '0', 10);

  // Get category-wise inside counts
  const insideCounts = await query(
    `SELECT category, COUNT(*) as count
     FROM vehicle_state
     WHERE is_inside = TRUE
     GROUP BY category`
  );

  // Get today's entered counts by category
  const enteredToday = await query(
    `SELECT category, COUNT(*) as count
     FROM vehicle_events
     WHERE direction = 'IN'
       AND event_time::date = CURRENT_DATE
     GROUP BY category`
  );

  // Get today's exited counts by category
  const exitedToday = await query(
    `SELECT category, COUNT(*) as count
     FROM vehicle_events
     WHERE direction = 'OUT'
       AND event_time::date = CURRENT_DATE
     GROUP BY category`
  );

  // Transform to frontend format
  const insideMap = new Map(insideCounts.rows.map((r: any) => [r.category, parseInt(r.count)]));
  const enteredMap = new Map(enteredToday.rows.map((r: any) => [r.category, parseInt(r.count)]));
  const exitedMap = new Map(exitedToday.rows.map((r: any) => [r.category, parseInt(r.count)]));

  const yellowInside = insideMap.get('KC') || 0;
  const greenInside = insideMap.get('SEZ') || 0;
  const yellowEntered = enteredMap.get('KC') || 0;
  const greenEntered = enteredMap.get('SEZ') || 0;
  const yellowExited = exitedMap.get('KC') || 0;
  const greenExited = exitedMap.get('SEZ') || 0;

  return {
    totalVehicles,
    yellowSticker: {
      entered: yellowEntered,
      exited: yellowExited,
      inside: yellowInside,
    },
    greenSticker: {
      entered: greenEntered,
      exited: greenExited,
      inside: greenInside,
    },
    totalInside: yellowInside + greenInside,
  };
}

/**
 * Get currently inside vehicles
 */
export async function getCurrentlyInsideVehicles(limit: number = 100) {
  const result = await query(
    `SELECT 
       vs.vehicle_number,
       vs.category,
       vs.last_event_time,
       v.owner_name
     FROM vehicle_state vs
     LEFT JOIN vehicles v ON vs.vehicle_number = v.vehicle_number
     WHERE vs.is_inside = TRUE
     ORDER BY vs.last_event_time DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row: any) => ({
    vehicleNumber: row.vehicle_number,
    category: row.category,
    lastEventTime: row.last_event_time,
    ownerName: row.owner_name,
  }));
}

/**
 * Get vehicle events (historical data)
 */
export async function getVehicleEvents(filters: {
  startDate?: Date;
  endDate?: Date;
  category?: 'SEZ' | 'KC';
  direction?: 'IN' | 'OUT';
  gateName?: string;
  vehicleNumber?: string;
  limit?: number;
  offset?: number;
}) {
  const {
    startDate,
    endDate,
    category,
    direction,
    gateName,
    vehicleNumber,
    limit = 100,
    offset = 0,
  } = filters;

  let sql = `
    SELECT 
      ve.id,
      ve.vehicle_number,
      ve.category,
      ve.direction,
      ve.event_time,
      ve.gate_name,
      v.owner_name
    FROM vehicle_events ve
    LEFT JOIN vehicles v ON ve.vehicle_number = v.vehicle_number
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramIndex = 1;

  if (startDate) {
    sql += ` AND ve.event_time >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    sql += ` AND ve.event_time < $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }

  if (category) {
    sql += ` AND ve.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  if (direction) {
    sql += ` AND ve.direction = $${paramIndex}`;
    params.push(direction);
    paramIndex++;
  }

  if (gateName && gateName !== 'all') {
    sql += ` AND LOWER(ve.gate_name) LIKE $${paramIndex}`;
    params.push(`%${gateName.toLowerCase()}%`);
    paramIndex++;
  }

  if (vehicleNumber) {
    sql += ` AND ve.vehicle_number ILIKE $${paramIndex}`;
    params.push(`%${vehicleNumber}%`);
    paramIndex++;
  }

  sql += ` ORDER BY ve.event_time DESC, ve.id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await query(sql, params);

  return result.rows.map((row: any) => ({
    id: row.id.toString(),
    vehicleNumber: row.vehicle_number,
    stickerColor: mapCategoryToStickerColor(row.category),
    direction: row.direction,
    gateName: row.gate_name || 'Unknown Gate',
    dateTime: new Date(row.event_time).toISOString().replace('T', ' ').substring(0, 19),
    ownerName: row.owner_name,
  }));
}

/**
 * Get all vehicle events for export (no pagination)
 */
export async function getVehicleEventsForExport(filters: {
  startDate?: Date;
  endDate?: Date;
  category?: 'SEZ' | 'KC';
  direction?: 'IN' | 'OUT';
  gateName?: string;
  vehicleNumber?: string;
}) {
  const {
    startDate,
    endDate,
    category,
    direction,
    gateName,
    vehicleNumber,
  } = filters;

  let sql = `
    SELECT 
      ve.vehicle_number,
      ve.category,
      ve.direction,
      ve.event_time,
      ve.gate_name,
      v.owner_name
    FROM vehicle_events ve
    LEFT JOIN vehicles v ON ve.vehicle_number = v.vehicle_number
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramIndex = 1;

  if (startDate) {
    sql += ` AND ve.event_time >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    sql += ` AND ve.event_time < $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }

  if (category) {
    sql += ` AND ve.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  if (direction) {
    sql += ` AND ve.direction = $${paramIndex}`;
    params.push(direction);
    paramIndex++;
  }

  if (gateName && gateName !== 'all') {
    sql += ` AND LOWER(ve.gate_name) LIKE $${paramIndex}`;
    params.push(`%${gateName.toLowerCase()}%`);
    paramIndex++;
  }

  if (vehicleNumber) {
    sql += ` AND ve.vehicle_number ILIKE $${paramIndex}`;
    params.push(`%${vehicleNumber}%`);
    paramIndex++;
  }

  sql += ` ORDER BY ve.event_time DESC, ve.id DESC`;

  const result = await query(sql, params);

  return result.rows.map((row: any) => ({
    vehicleNumber: row.vehicle_number,
    category: row.category, // SEZ or KC
    stickerColor: mapCategoryToStickerColor(row.category),
    direction: row.direction,
    gateName: row.gate_name || 'Unknown Gate',
    dateTime: new Date(row.event_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), // Local format for CSV
    ownerName: row.owner_name || 'N/A',
  }));
}

/**
 * Get vehicle count statistics for a date range
 */
export async function getVehicleCountsByDateRange(startDate: Date, endDate: Date) {
  const result = await query(
    `SELECT 
       DATE(event_time) as date,
       category,
       direction,
       COUNT(*) as count
     FROM vehicle_events
     WHERE event_time >= $1 AND event_time < $2
     GROUP BY DATE(event_time), category, direction
     ORDER BY date, category, direction`,
    [startDate, endDate]
  );

  return result.rows;
}

