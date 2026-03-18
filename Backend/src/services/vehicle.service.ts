import { query, transaction } from '../config/db';
import type { HikCentralVehicleEvent } from '../integrations/hikcentral/types';
import { ANPR_CAMERAS } from '../config/anprCameras';

/**
 * Map HikCentral tag color to database category
 * GREEN → SEZ, YELLOW (or any other) → KC
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

/** Subset returned to callers after a successfully processed event. */
export interface ProcessedVehicleEvent {
  vehicleNumber: string;
  ownerName: string | null;
  category: 'SEZ' | 'KC';
  createdAt: string; // ISO timestamp
  cameraIndexCode: string | null;
  cameraName: string | null;
  gate: string | null;
  direction: string | null;
  eventTime: string;
  eventType: 'IN' | 'OUT';
}

/**
 * Process a single vehicle event (transaction-safe).
 * 1. UPSERTs into vehicles table (preserves first-seen created_at).
 * 2. INSERTs into vehicle_events (immutable log, DB-level dedup via unique index).
 * 3. Checks vehicle_state for invalid transitions.
 * 4. UPSERTs/UPDATEs vehicle_state including last_gate and entry/exit counters.
 * Returns null if the event was a duplicate or invalid transition.
 */
export async function processVehicleEvent(
  event: HikCentralVehicleEvent,
  gateName: string = 'Unknown Gate'
): Promise<ProcessedVehicleEvent | null> {
  const category = mapTagColorToCategory(event.tagColor);
  const cameraMeta = event.cameraIndexCode ? ANPR_CAMERAS[String(event.cameraIndexCode)] : undefined;

  // ENTRY → IN, EXIT → OUT; fall back to event.eventType
  const movementDirection: 'IN' | 'OUT' =
    cameraMeta?.direction === 'ENTRY'
      ? 'IN'
      : cameraMeta?.direction === 'EXIT'
      ? 'OUT'
      : event.eventType;

  const eventTime = new Date(event.eventTime);

  const resolvedGate = cameraMeta?.gate ?? (gateName !== 'Unknown Gate' ? gateName : null) ?? null;
  const resolvedCameraIndexCode = event.cameraIndexCode ? String(event.cameraIndexCode) : null;
  const resolvedCameraName =
    (cameraMeta?.name ?? (event.cameraName ? String(event.cameraName) : null)) ?? null;

  return await transaction(async (client) => {
    // ── 1. UPSERT vehicles (preserve first-seen created_at via COALESCE) ──────
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
         $1, $2, $3, $4, $5, $6, $7,
         COALESCE(
           (SELECT created_at FROM vehicles WHERE vehicle_number = $1::varchar),
           CURRENT_TIMESTAMP
         )
       )
       ON CONFLICT (vehicle_number)
       DO UPDATE SET
         owner_name        = EXCLUDED.owner_name,
         category          = EXCLUDED.category,
         camera_index_code = EXCLUDED.camera_index_code,
         camera_name       = EXCLUDED.camera_name,
         gate              = EXCLUDED.gate,
         direction         = EXCLUDED.direction
       RETURNING vehicle_number, owner_name, category, created_at,
                 camera_index_code, camera_name, gate, direction`,
      [
        event.plateNo,
        event.ownerName ?? null,
        category,
        resolvedCameraIndexCode,
        resolvedCameraName,
        resolvedGate,
        cameraMeta?.direction ?? null, // raw ENTRY/EXIT stored in vehicles.direction
      ]
    );

    // ── 2. INSERT into vehicle_events (dedup via unique index) ────────────────
    const eventInsert = await client.query(
      `INSERT INTO vehicle_events (
         vehicle_number,
         category,
         direction,
         gate_name,
         camera_index_code,
         camera_name,
         event_time
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (vehicle_number, direction, event_time, gate_name)
       DO NOTHING`,
      [
        event.plateNo,
        category,
        movementDirection,
        cameraMeta?.gate ?? gateName,
        resolvedCameraIndexCode,
        resolvedCameraName,
        eventTime,
      ]
    );

    // Exact duplicate — stop here without touching state
    if (eventInsert.rowCount === 0) {
      return null;
    }

    // ── 3. Check current state to prevent invalid transitions ─────────────────
    const stateResult = await client.query(
      'SELECT is_inside FROM vehicle_state WHERE vehicle_number = $1',
      [event.plateNo]
    );

    const isCurrentlyInside = stateResult.rows[0]?.is_inside ?? false;

    if (movementDirection === 'IN' && isCurrentlyInside) {
      console.log(`⚠️  Vehicle ${event.plateNo} already inside — ignoring duplicate IN`);
      return null;
    }

    if (movementDirection === 'OUT' && !isCurrentlyInside) {
      console.log(`⚠️  Vehicle ${event.plateNo} not inside — ignoring invalid OUT`);
      return null;
    }

    // ── 4. Update vehicle_state ───────────────────────────────────────────────
    if (movementDirection === 'IN') {
      await client.query(
        `INSERT INTO vehicle_state (
           vehicle_number,
           category,
           is_inside,
           last_event_time,
           last_gate,
           entries_today,
           exits_today
         )
         VALUES ($1, $2, TRUE, $3, $4, 1, 0)
         ON CONFLICT (vehicle_number)
         DO UPDATE SET
           category        = EXCLUDED.category,
           is_inside       = TRUE,
           last_event_time = EXCLUDED.last_event_time,
           last_gate       = EXCLUDED.last_gate,
           entries_today   = vehicle_state.entries_today + 1`,
        [event.plateNo, category, eventTime, resolvedGate]
      );
    } else {
      await client.query(
        `UPDATE vehicle_state
         SET
           is_inside       = FALSE,
           last_event_time = $1,
           last_gate       = $2,
           category        = $3,
           exits_today     = exits_today + 1
         WHERE vehicle_number = $4`,
        [eventTime, resolvedGate, category, event.plateNo]
      );
    }

    // ── 5. Return processed event data ────────────────────────────────────────
    const row = upsertVehicle.rows?.[0];
    if (!row) return null;

    return {
      vehicleNumber:   row.vehicle_number,
      ownerName:       row.owner_name,
      category:        row.category,
      createdAt:       new Date(row.created_at).toISOString(),
      cameraIndexCode: row.camera_index_code,
      cameraName:      row.camera_name,
      gate:            row.gate,
      direction:       row.direction,
      eventTime:       event.eventTime,
      eventType:       movementDirection,
    };
  });
}

/**
 * Get current dashboard statistics.
 * - Inside counts come from vehicle_state (live).
 * - Entry/exit counts come from daily_counts (trigger-maintained, fast).
 */
export async function getDashboardStats() {
  // Total distinct vehicles ever recorded
  const totalResult = await query('SELECT COUNT(*) AS count FROM vehicles');
  const totalVehicles = parseInt(totalResult.rows[0]?.count || '0', 10);

  // Currently inside — from vehicle_state (no full table scan needed here)
  const insideCounts = await query(
    `SELECT category, COUNT(*) AS count
     FROM vehicle_state
     WHERE is_inside = TRUE
     GROUP BY category`
  );

  // Today's entries — read from pre-aggregated daily_counts (trigger-maintained)
  const enteredToday = await query(
    `SELECT category, SUM(total_count) AS count
     FROM daily_counts
     WHERE count_date = CURRENT_DATE
       AND direction = 'IN'
     GROUP BY category`
  );

  // Today's exits — same table
  const exitedToday = await query(
    `SELECT category, SUM(total_count) AS count
     FROM daily_counts
     WHERE count_date = CURRENT_DATE
       AND direction = 'OUT'
     GROUP BY category`
  );

  const insideMap  = new Map<string, number>(
    insideCounts.rows.map((r: { category: string; count: string }) => [r.category, parseInt(r.count, 10)])
  );
  const enteredMap = new Map<string, number>(
    enteredToday.rows.map((r: { category: string; count: string }) => [r.category, parseInt(r.count, 10)])
  );
  const exitedMap  = new Map<string, number>(
    exitedToday.rows.map((r: { category: string; count: string })  => [r.category, parseInt(r.count, 10)])
  );

  const yellowInside  = insideMap.get('KC')   || 0;
  const greenInside   = insideMap.get('SEZ')  || 0;
  const yellowEntered = enteredMap.get('KC')  || 0;
  const greenEntered  = enteredMap.get('SEZ') || 0;
  const yellowExited  = exitedMap.get('KC')   || 0;
  const greenExited   = exitedMap.get('SEZ')  || 0;

  return {
    totalVehicles,
    yellowSticker: { entered: yellowEntered, exited: yellowExited, inside: yellowInside },
    greenSticker:  { entered: greenEntered,  exited: greenExited,  inside: greenInside  },
    totalInside:   yellowInside + greenInside,
  };
}

/**
 * Get currently inside vehicles (with last_gate from vehicle_state).
 */
export async function getCurrentlyInsideVehicles(limit: number = 100) {
  const result = await query(
    `SELECT
       vs.vehicle_number,
       vs.category,
       vs.last_event_time,
       vs.last_gate,
       v.owner_name
     FROM vehicle_state vs
     LEFT JOIN vehicles v ON vs.vehicle_number = v.vehicle_number
     WHERE vs.is_inside = TRUE
     ORDER BY vs.last_event_time DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row: any) => ({
    vehicleNumber:  row.vehicle_number,
    category:       row.category,
    lastEventTime:  row.last_event_time,
    lastGate:       row.last_gate,
    ownerName:      row.owner_name,
  }));
}

/**
 * Get vehicle events (historical, paginated) including camera info.
 */
export async function getVehicleEvents(filters: {
  startDate?:    Date;
  endDate?:      Date;
  category?:    'SEZ' | 'KC';
  direction?:   'IN' | 'OUT';
  gateName?:     string;
  vehicleNumber?: string;
  limit?:        number;
  offset?:       number;
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
      ve.camera_name,
      ve.camera_index_code,
      v.owner_name
    FROM vehicle_events ve
    LEFT JOIN vehicles v ON ve.vehicle_number = v.vehicle_number
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let p = 1;

  if (startDate)     { sql += ` AND ve.event_time >= $${p++}`;               params.push(startDate); }
  if (endDate)       { sql += ` AND ve.event_time < $${p++}`;                params.push(endDate); }
  if (category)      { sql += ` AND ve.category = $${p++}`;                  params.push(category); }
  if (direction)     { sql += ` AND ve.direction = $${p++}`;                  params.push(direction); }
  if (gateName && gateName !== 'all') {
    sql += ` AND LOWER(ve.gate_name) LIKE $${p++}`;
    params.push(`%${gateName.toLowerCase()}%`);
  }
  if (vehicleNumber) { sql += ` AND ve.vehicle_number ILIKE $${p++}`;        params.push(`%${vehicleNumber}%`); }

  sql += ` ORDER BY ve.event_time DESC, ve.id DESC LIMIT $${p++} OFFSET $${p++}`;
  params.push(limit, offset);

  const result = await query(sql, params);

  return result.rows.map((row: any) => ({
    id:              row.id.toString(),
    vehicleNumber:   row.vehicle_number,
    stickerColor:    mapCategoryToStickerColor(row.category),
    direction:       row.direction,
    gateName:        row.gate_name || 'Unknown Gate',
    cameraName:      row.camera_name ?? null,
    cameraIndexCode: row.camera_index_code ?? null,
    dateTime:        new Date(row.event_time).toISOString().replace('T', ' ').substring(0, 19),
    ownerName:       row.owner_name,
  }));
}

/**
 * Get all vehicle events for export (no pagination), including camera info.
 */
export async function getVehicleEventsForExport(filters: {
  startDate?:     Date;
  endDate?:       Date;
  category?:     'SEZ' | 'KC';
  direction?:    'IN' | 'OUT';
  gateName?:      string;
  vehicleNumber?: string;
}) {
  const { startDate, endDate, category, direction, gateName, vehicleNumber } = filters;

  let sql = `
    SELECT
      ve.vehicle_number,
      ve.category,
      ve.direction,
      ve.event_time,
      ve.gate_name,
      ve.camera_name,
      ve.camera_index_code,
      v.owner_name
    FROM vehicle_events ve
    LEFT JOIN vehicles v ON ve.vehicle_number = v.vehicle_number
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let p = 1;

  if (startDate)     { sql += ` AND ve.event_time >= $${p++}`;               params.push(startDate); }
  if (endDate)       { sql += ` AND ve.event_time < $${p++}`;                params.push(endDate); }
  if (category)      { sql += ` AND ve.category = $${p++}`;                  params.push(category); }
  if (direction)     { sql += ` AND ve.direction = $${p++}`;                  params.push(direction); }
  if (gateName && gateName !== 'all') {
    sql += ` AND LOWER(ve.gate_name) LIKE $${p++}`;
    params.push(`%${gateName.toLowerCase()}%`);
  }
  if (vehicleNumber) { sql += ` AND ve.vehicle_number ILIKE $${p++}`;        params.push(`%${vehicleNumber}%`); }

  sql += ` ORDER BY ve.event_time DESC, ve.id DESC`;

  const result = await query(sql, params);

  return result.rows.map((row: any) => ({
    vehicleNumber:   row.vehicle_number,
    category:        row.category,
    stickerColor:    mapCategoryToStickerColor(row.category),
    direction:       row.direction,
    gateName:        row.gate_name || 'Unknown Gate',
    cameraName:      row.camera_name ?? null,
    cameraIndexCode: row.camera_index_code ?? null,
    dateTime:        new Date(row.event_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    ownerName:       row.owner_name || 'N/A',
  }));
}

/**
 * Get vehicle count statistics for a date range.
 * Reads from the trigger-maintained daily_counts table for performance.
 */
export async function getVehicleCountsByDateRange(startDate: Date, endDate: Date) {
  const result = await query(
    `SELECT
       count_date  AS date,
       category,
       direction,
       gate_name,
       total_count AS count
     FROM daily_counts
     WHERE count_date >= $1
       AND count_date <  $2
     ORDER BY count_date, category, direction`,
    [startDate, endDate]
  );

  return result.rows;
}
