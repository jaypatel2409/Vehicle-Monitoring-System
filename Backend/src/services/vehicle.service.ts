import { query, transaction } from '../config/db';
import type { HikCentralVehicleEvent } from '../integrations/hikcentral/types';
import { ANPR_CAMERAS } from '../config/anprCameras';

/**
 * Map gate name to category.
 * GATE 2 → SEZ (green sticker)
 * GATE 1 (or anything else) → KC (yellow sticker)
 */
export function mapGateToCategory(gate: string | null | undefined): 'SEZ' | 'KC' {
  if (gate && gate.toUpperCase().replace(/\s+/g, '').includes('GATE2')) return 'SEZ';
  return 'KC';
}

export function mapCategoryToStickerColor(category: string): 'green' | 'yellow' {
  return category === 'SEZ' ? 'green' : 'yellow';
}

export function mapCategoryToArea(category: string): 'SEZ' | 'KC' {
  return category === 'SEZ' ? 'SEZ' : 'KC';
}

/** Subset returned to callers after a successfully processed event. */
export interface ProcessedVehicleEvent {
  vehicleNumber: string;
  ownerName: string | null;
  category: 'SEZ' | 'KC';
  vehicleType: string;
  createdAt: string;
  cameraIndexCode: string | null;
  cameraName: string | null;
  gate: string | null;
  direction: string | null;
  eventTime: string;
  eventType: 'IN' | 'OUT';
}

/**
 * Process a single vehicle event (transaction-safe).
 * Category is determined by gate (GATE 2 = SEZ, GATE 1 = KC), not tagColor.
 */
export async function processVehicleEvent(
  event: HikCentralVehicleEvent,
  gateName: string = 'Unknown Gate'
): Promise<ProcessedVehicleEvent | null> {
  const cameraMeta = event.cameraIndexCode ? ANPR_CAMERAS[String(event.cameraIndexCode)] : undefined;

  const resolvedGate = cameraMeta?.gate ?? (gateName !== 'Unknown Gate' ? gateName : null) ?? null;
  const category = mapGateToCategory(resolvedGate);
  const vehicleType = String((event as any).vehicleType ?? 'Unknown');

  const movementDirection: 'IN' | 'OUT' =
    cameraMeta?.direction === 'ENTRY' ? 'IN'
      : cameraMeta?.direction === 'EXIT' ? 'OUT'
        : event.eventType;

  const eventTime = new Date(event.eventTime);
  const resolvedCameraIndexCode = event.cameraIndexCode ? String(event.cameraIndexCode) : null;
  const resolvedCameraName =
    (cameraMeta?.name ?? (event.cameraName ? String(event.cameraName) : null)) ?? null;

  return await transaction(async (client) => {
    const upsertVehicle = await client.query(
      `INSERT INTO vehicles (
         vehicle_number, owner_name, category, vehicle_type,
         camera_index_code, camera_name, gate, direction, created_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         COALESCE(
           (SELECT created_at FROM vehicles WHERE vehicle_number = $1::varchar),
           CURRENT_TIMESTAMP
         )
       )
       ON CONFLICT (vehicle_number)
       DO UPDATE SET
         owner_name        = EXCLUDED.owner_name,
         category          = EXCLUDED.category,
         vehicle_type      = EXCLUDED.vehicle_type,
         camera_index_code = EXCLUDED.camera_index_code,
         camera_name       = EXCLUDED.camera_name,
         gate              = EXCLUDED.gate,
         direction         = EXCLUDED.direction
       RETURNING vehicle_number, owner_name, category, vehicle_type, created_at,
                 camera_index_code, camera_name, gate, direction`,
      [
        event.plateNo,
        event.ownerName ?? null,
        category,
        vehicleType,
        resolvedCameraIndexCode,
        resolvedCameraName,
        resolvedGate,
        cameraMeta?.direction ?? null,
      ]
    );

    const eventInsert = await client.query(
      `INSERT INTO vehicle_events (
         vehicle_number, category, vehicle_type, direction,
         gate_name, camera_index_code, camera_name, event_time
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (vehicle_number, direction, event_time, gate_name)
       DO NOTHING`,
      [
        event.plateNo, category, vehicleType, movementDirection,
        cameraMeta?.gate ?? gateName,
        resolvedCameraIndexCode, resolvedCameraName, eventTime,
      ]
    );

    if (eventInsert.rowCount === 0) return null;

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

    if (movementDirection === 'IN') {
      await client.query(
        `INSERT INTO vehicle_state (
           vehicle_number, category, is_inside, last_event_time, last_gate,
           entries_today, exits_today
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
         SET is_inside = FALSE, last_event_time = $1, last_gate = $2,
             category = $3, exits_today = exits_today + 1
         WHERE vehicle_number = $4`,
        [eventTime, resolvedGate, category, event.plateNo]
      );
    }

    const row = upsertVehicle.rows?.[0];
    if (!row) return null;

    return {
      vehicleNumber: row.vehicle_number,
      ownerName: row.owner_name,
      category: row.category,
      vehicleType: row.vehicle_type ?? 'Unknown',
      createdAt: new Date(row.created_at).toISOString(),
      cameraIndexCode: row.camera_index_code,
      cameraName: row.camera_name,
      gate: row.gate,
      direction: row.direction,
      eventTime: event.eventTime,
      eventType: movementDirection,
    };
  });
}

/**
 * Get current dashboard statistics.
 */
export async function getDashboardStats() {
  const totalResult = await query('SELECT COUNT(*) AS count FROM vehicles');
  const totalVehicles = parseInt(totalResult.rows[0]?.count || '0', 10);

  const insideCounts = await query(
    `SELECT category, COUNT(*) AS count FROM vehicle_state WHERE is_inside = TRUE GROUP BY category`
  );
  const enteredToday = await query(
    `SELECT category, SUM(total_count) AS count FROM daily_counts
     WHERE count_date = CURRENT_DATE AND direction = 'IN' GROUP BY category`
  );
  const exitedToday = await query(
    `SELECT category, SUM(total_count) AS count FROM daily_counts
     WHERE count_date = CURRENT_DATE AND direction = 'OUT' GROUP BY category`
  );

  const insideMap = new Map<string, number>(insideCounts.rows.map((r: any) => [r.category, parseInt(r.count, 10)]));
  const enteredMap = new Map<string, number>(enteredToday.rows.map((r: any) => [r.category, parseInt(r.count, 10)]));
  const exitedMap = new Map<string, number>(exitedToday.rows.map((r: any) => [r.category, parseInt(r.count, 10)]));

  return {
    totalVehicles,
    yellowSticker: {
      entered: enteredMap.get('KC') || 0,
      exited: exitedMap.get('KC') || 0,
      inside: insideMap.get('KC') || 0,
    },
    greenSticker: {
      entered: enteredMap.get('SEZ') || 0,
      exited: exitedMap.get('SEZ') || 0,
      inside: insideMap.get('SEZ') || 0,
    },
    totalInside: (insideMap.get('KC') || 0) + (insideMap.get('SEZ') || 0),
  };
}

/**
 * Get currently inside vehicles.
 */
export async function getCurrentlyInsideVehicles(limit: number = 100) {
  const result = await query(
    `SELECT vs.vehicle_number, vs.category, vs.last_event_time, vs.last_gate,
            v.owner_name, v.vehicle_type
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
    vehicleType: row.vehicle_type ?? 'Unknown',
    lastEventTime: row.last_event_time,   // raw TIMESTAMPTZ — frontend formats it
    lastGate: row.last_gate,
    ownerName: row.owner_name,
  }));
}

/**
 * Get vehicle events (historical, paginated).
 * dateTime is returned as a full ISO 8601 string (UTC) so the frontend
 * can reliably convert it to any timezone.
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
    startDate, endDate, category, direction,
    gateName, vehicleNumber, limit = 100, offset = 0,
  } = filters;

  let sql = `
    SELECT
      ve.id, ve.vehicle_number, ve.category, ve.vehicle_type,
      ve.direction, ve.event_time, ve.gate_name, ve.camera_name,
      ve.camera_index_code, v.owner_name
    FROM vehicle_events ve
    LEFT JOIN vehicles v ON ve.vehicle_number = v.vehicle_number
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let p = 1;

  if (startDate) { sql += ` AND ve.event_time >= $${p++}`; params.push(startDate); }
  if (endDate) { sql += ` AND ve.event_time < $${p++}`; params.push(endDate); }
  if (category) { sql += ` AND ve.category = $${p++}`; params.push(category); }
  if (direction) { sql += ` AND ve.direction = $${p++}`; params.push(direction); }
  if (gateName && gateName !== 'all') {
    sql += ` AND LOWER(ve.gate_name) LIKE $${p++}`;
    params.push(`%${gateName.toLowerCase()}%`);
  }
  if (vehicleNumber) { sql += ` AND ve.vehicle_number ILIKE $${p++}`; params.push(`%${vehicleNumber}%`); }

  sql += ` ORDER BY ve.event_time DESC, ve.id DESC LIMIT $${p++} OFFSET $${p++}`;
  params.push(limit, offset);

  const result = await query(sql, params);

  return result.rows.map((row: any) => ({
    id: row.id.toString(),
    vehicleNumber: row.vehicle_number,
    vehicleType: row.vehicle_type ?? 'Unknown',
    area: mapCategoryToArea(row.category),
    stickerColor: mapCategoryToStickerColor(row.category),
    direction: row.direction,
    gateName: row.gate_name || 'Unknown Gate',
    cameraName: row.camera_name ?? null,
    cameraIndexCode: row.camera_index_code ?? null,
    // Full ISO string (UTC) — frontend toIST() converts this correctly
    dateTime: new Date(row.event_time).toISOString(),
    ownerName: row.owner_name,
  }));
}

/**
 * Get all vehicle events for export (no pagination).
 */
export async function getVehicleEventsForExport(filters: {
  startDate?: Date;
  endDate?: Date;
  category?: 'SEZ' | 'KC';
  direction?: 'IN' | 'OUT';
  gateName?: string;
  vehicleNumber?: string;
}) {
  const { startDate, endDate, category, direction, gateName, vehicleNumber } = filters;

  let sql = `
    SELECT ve.vehicle_number, ve.category, ve.vehicle_type, ve.direction,
           ve.event_time, ve.gate_name, ve.camera_name, ve.camera_index_code, v.owner_name
    FROM vehicle_events ve
    LEFT JOIN vehicles v ON ve.vehicle_number = v.vehicle_number
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let p = 1;

  if (startDate) { sql += ` AND ve.event_time >= $${p++}`; params.push(startDate); }
  if (endDate) { sql += ` AND ve.event_time < $${p++}`; params.push(endDate); }
  if (category) { sql += ` AND ve.category = $${p++}`; params.push(category); }
  if (direction) { sql += ` AND ve.direction = $${p++}`; params.push(direction); }
  if (gateName && gateName !== 'all') {
    sql += ` AND LOWER(ve.gate_name) LIKE $${p++}`;
    params.push(`%${gateName.toLowerCase()}%`);
  }
  if (vehicleNumber) { sql += ` AND ve.vehicle_number ILIKE $${p++}`; params.push(`%${vehicleNumber}%`); }

  sql += ` ORDER BY ve.event_time DESC, ve.id DESC LIMIT 10000`;

  const result = await query(sql, params);

  return result.rows.map((row: any) => ({
    vehicleNumber: row.vehicle_number,
    category: row.category,
    vehicleType: row.vehicle_type ?? 'Unknown',
    area: mapCategoryToArea(row.category),
    stickerColor: mapCategoryToStickerColor(row.category),
    direction: row.direction,
    gateName: row.gate_name || 'Unknown Gate',
    cameraName: row.camera_name ?? null,
    cameraIndexCode: row.camera_index_code ?? null,
    dateTime: new Date(row.event_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    ownerName: row.owner_name || 'N/A',
  }));
}

/**
 * Get vehicle count statistics for a date range (from daily_counts).
 */
export async function getVehicleCountsByDateRange(startDate: Date, endDate: Date) {
  const result = await query(
    `SELECT count_date AS date, category, direction, gate_name, total_count AS count
     FROM daily_counts
     WHERE count_date >= $1 AND count_date < $2
     ORDER BY count_date, category, direction`,
    [startDate, endDate]
  );
  return result.rows;
}

/**
 * Reset today's entry/exit counts in vehicle_state.
 * Called by the midnight cron job. Daily totals are preserved in daily_counts
 * (which is maintained by the DB trigger on vehicle_events — never touched here).
 */
export async function resetDailyCounts(): Promise<void> {
  // Reset today's entry/exit counters
  await query(`UPDATE vehicle_state SET entries_today = 0, exits_today = 0`);

  // Mark all vehicles as no longer inside.
  // Rationale: at the start of a new day (midnight IST) no vehicle should be
  // counted as "currently inside" — the campus is considered empty. Any vehicle
  // that genuinely drives in after midnight will generate a fresh IN event which
  // sets is_inside = TRUE again via processVehicleEvent().
  await query(`UPDATE vehicle_state SET is_inside = FALSE`);

  console.log('✅ Midnight IST reset: entries_today, exits_today cleared and is_inside set to FALSE for all vehicles');
}

/**
 * Get aggregated daily counts for the Daily Summary page.
 * Returns one row per (date, category, direction) combination.
 */
export async function getDailySummary(startDate: Date, endDate: Date) {
  const result = await query(
    `SELECT
       count_date  AS date,
       category,
       direction,
       gate_name,
       SUM(total_count) AS count
     FROM daily_counts
     WHERE count_date >= $1 AND count_date <= $2
     GROUP BY count_date, category, direction, gate_name
     ORDER BY count_date DESC, category, direction`,
    [startDate, endDate]
  );
  return result.rows;
}