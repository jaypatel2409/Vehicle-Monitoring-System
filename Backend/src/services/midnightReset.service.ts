// Backend/src/services/midnightReset.service.ts
//
// Schedules a daily job at 00:00 IST to:
//  1. Save today's totals from daily_counts → daily_snapshot table
//  2. Reset vehicle_state.entries_today and exits_today to 0
//
// HOW TO ADD TO server.ts:
//   import { startMidnightReset } from './services/midnightReset.service';
//   // Add this line right after pollingService.start(io):
//   startMidnightReset();
//
// INSTALL:
//   cd Backend && npm install node-cron && npm install --save-dev @types/node-cron

import cron from 'node-cron';
import { query } from '../config/db';

const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS daily_snapshot (
    id            BIGSERIAL    PRIMARY KEY,
    snapshot_date DATE         NOT NULL,
    category      VARCHAR(3)   NOT NULL,
    direction     VARCHAR(10)  NOT NULL,
    gate_name     VARCHAR(50)  NOT NULL,
    total_count   INTEGER      NOT NULL DEFAULT 0,
    snapped_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (snapshot_date, category, direction, gate_name)
  );
  CREATE INDEX IF NOT EXISTS idx_snapshot_date ON daily_snapshot (snapshot_date DESC);
`;

/**
 * Takes a snapshot of the current day's counts and resets vehicle_state counters.
 * Exported so it can also be called from an admin endpoint or test.
 */
export async function snapshotAndReset(): Promise<void> {
    // Ensure the snapshot table exists
    await query(ENSURE_TABLE_SQL);

    // Get today's date in IST (the date that is ending at midnight)
    const { rows } = await query(
        `SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE AS today`
    );
    const today: string = rows[0].today; // e.g. "2026-03-25"

    // Copy today's daily_counts totals into daily_snapshot
    await query(
        `INSERT INTO daily_snapshot (snapshot_date, category, direction, gate_name, total_count)
     SELECT
       $1::DATE,
       category,
       direction,
       gate_name,
       COALESCE(SUM(total_count), 0)
     FROM daily_counts
     WHERE count_date = $1::DATE
     GROUP BY category, direction, gate_name
     ON CONFLICT (snapshot_date, category, direction, gate_name)
     DO UPDATE SET
       total_count = EXCLUDED.total_count,
       snapped_at  = NOW()`,
        [today]
    );

    // Also snapshot the "inside" counts per category at midnight
    await query(
        `INSERT INTO daily_snapshot (snapshot_date, category, direction, gate_name, total_count)
     SELECT
       $1::DATE,
       vs.category,
       'INSIDE',
       COALESCE(vs.last_gate, 'Unknown Gate'),
       COUNT(*)
     FROM vehicle_state vs
     WHERE vs.is_inside = TRUE
     GROUP BY vs.category, vs.last_gate
     ON CONFLICT (snapshot_date, category, direction, gate_name)
     DO UPDATE SET
       total_count = EXCLUDED.total_count,
       snapped_at  = NOW()`,
        [today]
    );

    // Reset today's running counters on vehicle_state AND set is_inside = FALSE
    await query(`UPDATE vehicle_state SET entries_today = 0, exits_today = 0, is_inside = FALSE`);

    console.log(`[MidnightReset] ✅ Snapshot saved for ${today}, vehicle_state counters reset to 0, all vehicles marked outside.`);
}

/**
 * Registers the node-cron job.
 * The cron expression "0 0 * * *" with timezone "Asia/Kolkata" fires at
 * exactly 00:00:00 IST every day.
 */
export function startMidnightReset(): void {
    cron.schedule(
        '0 0 * * *',
        async () => {
            console.log('[MidnightReset] Running midnight IST reset...');
            try {
                await snapshotAndReset();
            } catch (err) {
                console.error('[MidnightReset] ❌ Reset failed:', err);
            }
        },
        { timezone: 'Asia/Kolkata' }
    );

    console.log('[MidnightReset] ✅ Cron job registered — fires at 00:00 IST daily.');
}