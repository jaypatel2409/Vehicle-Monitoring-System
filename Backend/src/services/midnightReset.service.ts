// Backend/src/services/midnightReset.service.ts
//
// Runs a cron job that fires at exactly 00:00:00 IST every day.
// It does two things:
//  1. Resets vehicle_state.entries_today and exits_today to 0 for all vehicles.
//  2. Reads the current daily totals from daily_counts and saves them to
//     daily_snapshot (a new table — see the migration below) so the
//     Daily Counts page can display historical per-day totals.
//
// IMPORTANT: Add this service to server.ts:
//   import { startMidnightReset } from "./services/midnightReset.service";
//   startMidnightReset();

import cron from "node-cron";
import { query } from "../config/db";
import { logger } from "../utils/logger";

/**
 * Midnight IST in cron = "0 0 18 * * *" UTC (IST = UTC+5:30).
 * We use the "Asia/Kolkata" timezone option in node-cron so we can
 * just write "0 0 * * *" and node-cron handles the offset.
 */
export function startMidnightReset(): void {
    // Fires at 00:00 IST every day
    cron.schedule(
        "0 0 * * *",
        async () => {
            logger.info("[MidnightReset] Starting midnight IST reset...");
            try {
                await snapshotAndReset();
                logger.info("[MidnightReset] Reset completed successfully.");
            } catch (err) {
                logger.errorWithCause("[MidnightReset] Reset failed", err);
            }
        },
        {
            timezone: "Asia/Kolkata",
        }
    );

    logger.info("[MidnightReset] Cron job scheduled — resets at 00:00 IST daily.");
}

/**
 * Takes a snapshot of today's daily_counts into daily_snapshot,
 * then resets vehicle_state counters to 0.
 *
 * This function is also exported so it can be called manually
 * (e.g. from an admin endpoint or seed script).
 */
export async function snapshotAndReset(): Promise<void> {
    // 1. Ensure the snapshot table exists (idempotent).
    await query(`
    CREATE TABLE IF NOT EXISTS daily_snapshot (
      id            BIGSERIAL PRIMARY KEY,
      snapshot_date DATE        NOT NULL,
      category      VARCHAR(3)  NOT NULL,
      direction     VARCHAR(3)  NOT NULL,
      gate_name     VARCHAR(50) NOT NULL,
      total_count   INTEGER     NOT NULL DEFAULT 0,
      snapped_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (snapshot_date, category, direction, gate_name)
    );
    CREATE INDEX IF NOT EXISTS idx_snapshot_date ON daily_snapshot (snapshot_date DESC);
  `);

    // 2. Get today's date in IST for the snapshot
    const istDateResult = await query(
        `SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE AS today`
    );
    const today: string = istDateResult.rows[0].today;

    // 3. Upsert today's totals from daily_counts into daily_snapshot
    await query(
        `
    INSERT INTO daily_snapshot (snapshot_date, category, direction, gate_name, total_count)
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
      snapped_at  = NOW()
    `,
        [today]
    );

    // 4. Reset vehicle_state counters
    await query(
        `UPDATE vehicle_state SET entries_today = 0, exits_today = 0`
    );

    logger.info(`[MidnightReset] Snapshot saved for ${today}, vehicle_state counters reset.`);
}