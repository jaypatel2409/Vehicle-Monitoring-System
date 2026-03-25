import { query, transaction } from '../config/db';
import type { HikCentralVehicleEvent } from '../integrations/hikcentral/types';
import { ANPR_CAMERAS } from '../config/anprCameras';

/**
 * Convert a DB timestamp (stored as UTC/TIMESTAMPTZ) to an ISO 8601 string
 * with the explicit IST offset (+05:30).
 *
 * Example output: "2026-03-25T09:18:44+05:30"
 *
 * Why this matters:
 *   - PostgreSQL stores event_time as TIMESTAMPTZ (UTC internally).
 *   - The HikCentral API sends times like "2026-03-25T09:18:44+05:30".
 *   - Using toISOString() would return "2026-03-25T03:48:44.000Z" (UTC),
 *     which when parsed by the browser without a timezone is treated as UTC
 *     or local time — causing a 5h30m display error on the frontend.
 *   - Returning the string with +05:30 embedded means new Date(...) on the
 *     frontend always produces the correct absolute moment, and Intl formatting
 *     with timeZone:'Asia/Kolkata' shows the correct local time.
 */
function toIST8601(dbTimestamp: Date | string): string {
  const d = new Date(dbTimestamp);
  // IST = UTC + 5:30
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const istMs = d.getTime() + IST_OFFSET_MS;
  const ist = new Date(istMs);

  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const YYYY = ist.getUTCFullYear();
  const MM = pad(ist.getUTCMonth() + 1);
  const DD = pad(ist.getUTCDate());
  const HH = pad(ist.getUTCHours());
  const mm = pad(ist.getUTCMinutes());
  const ss = pad(ist.getUTCSeconds());

  return `${YYYY}-${MM}-${DD}T${HH}:${mm}:${ss}+05:30`;
}

/**
 * Map gate name to category.
 * GATE 2 → SEZ (green sticker)
 * GATE 1 (or anything else) → KC (yellow sticker)
 *
 * This is the single source of truth for category assignment.
 * The tagColor from HikCentral API is NOT used for category decisions.
 */
export function mapGateToCategory(gate: string | null | undefined): 'SEZ' | 'KC' {
  if (gate && gate.toUpperCase().replace(/\s+/g, '').includes('GATE2')) return 'SEZ';
  return 'KC';
}

/**
 * Map database category to frontend sticker color.
 * SEZ → green, KC → yellow
 */
export function mapCategoryToStickerColor(category: string): 'green' | 'yellow' {
  return category === 'SEZ' ? 'green' : 'yellow';
}

/**
 * Map database category to area label.
 * SEZ → 'SEZ', KC → 'KC'
 */
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

  // Gate determines category
  const resolvedGate = cameraMeta?.gate ?? (gateName !== 'Unknown Gate' ? gateName : null) ?? null;
  const category = mapGateToCategory(resolvedGate);

  // Vehicle type from event (set by normalizeRecord)
  const vehicleType = String((event as any).vehicleType ?? 'Unknown');

  // ENTRY → IN, EXIT → OUT
  const movementDirection: 'IN' | 'OUT' =
    cameraMeta?.direction === 'ENTRY' ? 'IN'
      : cameraMeta?.direction === 'EXIT' ? 'OUT'
        : event.eventType;

  const eventTime = new Date(event.eventTime);
  const resolvedCameraIndexCode = event.cameraIndexCode ? String(event.cameraIndexCode) : null;
  const resolvedCameraName =
    (cameraMeta?.name ?? (event.cameraName ? String(event.cameraName) : null)) ?? null;

  return await transaction(async (client) => {
    // ── 1. UPSERT vehicles ────────────────────────────────────────────────────
    const upsertVehicle = await client.query(
      `INSERT INTO vehicles (
         vehicle_number,
         owner_name,
         category,
         vehicle_type,
         camera_index_code,
         camera_name,
         gate,
         direction,
         created_at
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

    // ── 2. INSERT into vehicle_events (dedup via unique index) ────────────────
    const eventInsert = await client.query(
      `INSERT INTO vehicle_events (
         vehicle_number,
         category,
         vehicle_type,
         direction,
         gate_name,
         camera_index_code,
         camera_name,
         event_time
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (vehicle_number, direction, event_time, gate_name)
       DO NOTHING`,
      [
        event.plateNo,
        category,
        vehicleType,
        movementDirection,
        cameraMeta?.gate ?? gateName,
        resolvedCameraIndexCode,
        resolvedCameraName,
        eventTime,
      ]
    );

    // Exact duplicate — stop here
    if (eventInsert.rowCount === 0) return null;

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
    `SELECT category, COUNT(*) AS count
     FROM vehicle_state
     WHERE is_inside = TRUE
     GROUP BY category`
  );

  const enteredToday = await query(
    `SELECT category, SUM(total_count) AS count
     FROM daily_counts
     WHERE count_date = CURRENT_DATE AND direction = 'IN'
     GROUP BY category`
  );

  const exitedToday = await query(
    `SELECT category, SUM(total_count) AS count
     FROM daily_counts
     WHERE count_date = CURRENT_DATE AND direction = 'OUT'
     GROUP BY category`
  );

  const insideMap = new Map<string, number>(
    insideCounts.rows.map((r: any) => [r.category, parseInt(r.count, 10)])
  );
  const enteredMap = new Map<string, number>(
    enteredToday.rows.map((r: any) => [r.category, parseInt(r.count, 10)])
  );
  const exitedMap = new Map<string, number>(
    exitedToday.rows.map((r: any) => [r.category, parseInt(r.count, 10)])
  );

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
    `SELECT
       vs.vehicle_number,
       vs.category,
       vs.last_event_time,
       vs.last_gate,
       v.owner_name,
       v.vehicle_type
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
    lastEventTime: row.last_event_time,
    lastGate: row.last_gate,
    ownerName: row.owner_name,
  }));
}

/**
 * Get vehicle events (historical, paginated).
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
      ve.id,
      ve.vehicle_number,
      ve.category,
      ve.vehicle_type,
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
    // Return the timestamp as a full ISO 8601 string with the +05:30 IST offset.
    // Previously this used toISOString() which strips the offset and returns UTC,
    // causing the frontend to display times 5h30m behind the correct IST value.
    dateTime: toIST8601(row.event_time),
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
    SELECT
      ve.vehicle_number,
      ve.category,
      ve.vehicle_type,
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

  if (startDate) { sql += ` AND ve.event_time >= $${p++}`; params.push(startDate); }
  if (endDate) { sql += ` AND ve.event_time < $${p++}`; params.push(endDate); }
  if (category) { sql += ` AND ve.category = $${p++}`; params.push(category); }
  if (direction) { sql += ` AND ve.direction = $${p++}`; params.push(direction); }
  if (gateName && gateName !== 'all') {
    sql += ` AND LOWER(ve.gate_name) LIKE $${p++}`;
    params.push(`%${gateName.toLowerCase()}%`);
  }
  if (vehicleNumber) { sql += ` AND ve.vehicle_number ILIKE $${p++}`; params.push(`%${vehicleNumber}%`); }

  sql += ` ORDER BY ve.event_time DESC, ve.id DESC LIMIT 10000`; // hard cap

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
    `SELECT
       count_date  AS date,
       category,
       direction,
       gate_name,
       total_count AS count
     FROM daily_counts
     WHERE count_date >= $1 AND count_date < $2
     ORDER BY count_date, category, direction`,
    [startDate, endDate]
  );
  return result.rows;
}