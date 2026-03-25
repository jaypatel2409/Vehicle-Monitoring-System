// Backend/src/services/midnightReset.service.ts
//
// Schedules a daily job at 00:00 IST to:
//  1. Save today's totals from daily_counts → daily_snapshot table
//  2. Reset vehicle_state: entries_today = 0, exits_today = 0, is_inside = FALSE
//  3. Emit dashboard:reset via Socket.IO so all frontend clients refetch
//
// All DB operations run in a single transaction so the reset is atomic.

import cron from 'node-cron';
import { Server as SocketIOServer } from 'socket.io';
import { pool } from '../config/db';

const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS daily_snapshot (
    id            BIGSERIAL    PRIMARY KEY,
    snapshot_date DATE         NOT NULL,
    category      VARCHAR(3)   NOT NULL,
    direction     VARCHAR(3)   NOT NULL,
    gate_name     VARCHAR(50)  NOT NULL,
    total_count   INTEGER      NOT NULL DEFAULT 0,
    snapped_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (snapshot_date, category, direction, gate_name)
  );
  CREATE INDEX IF NOT EXISTS idx_snapshot_date ON daily_snapshot (snapshot_date DESC);
`;

/**
 * Atomically snapshots the current day's counts and performs a full reset.
 *
 * Steps (all inside one transaction):
 *  1. Ensure daily_snapshot table exists
 *  2. Get today's IST date
 *  3. Upsert today's daily_counts totals → daily_snapshot
 *  4. Reset vehicle_state:
 *       entries_today = 0
 *       exits_today   = 0
 *       is_inside     = FALSE  ← KEY FIX: clears KC/SEZ/Total Inside counts
 *  5. (Outside transaction) Emit dashboard:reset via Socket.IO
 *
 * Exported so it can be called from an admin endpoint or a test.
 */
export async function snapshotAndReset(io?: SocketIOServer): Promise<void> {
    const client = await pool.connect();

    try {
        // Ensure snapshot table exists (DDL outside transaction is fine)
        await client.query(ENSURE_TABLE_SQL);

        await client.query('BEGIN');

        // ── Step 1: Get today's IST date ───────────────────────────────────────
        const { rows: dateRows } = await client.query(
            `SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE AS today`
        );
        const today: string = dateRows[0].today; // e.g. "2026-03-25"
        console.log(`[MidnightReset] 🕛 Resetting for IST date: ${today}`);

        // ── Step 2: Snapshot today's daily_counts → daily_snapshot ────────────
        const snapResult = await client.query(
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
        console.log(`[MidnightReset] ✅ Snapshot saved (${snapResult.rowCount} rows) for ${today}`);

        // ── Step 3: Reset vehicle_state ────────────────────────────────────────
        //   entries_today / exits_today → 0 (resets today's IN/OUT counters)
        //   is_inside → FALSE            (resets KC/SEZ/Total Inside counts)
        const resetResult = await client.query(
            `UPDATE vehicle_state
             SET
               entries_today = 0,
               exits_today   = 0,
               is_inside     = FALSE`
        );
        console.log(`[MidnightReset] ✅ vehicle_state reset (${resetResult.rowCount} rows) — is_inside cleared`);

        await client.query('COMMIT');
        console.log(`[MidnightReset] ✅ Transaction committed successfully`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[MidnightReset] ❌ Transaction rolled back due to error:', err);
        throw err;
    } finally {
        client.release();
    }

    // ── Step 4: Broadcast reset event to all connected frontend clients ────────
    // Done outside the DB transaction so a socket error won't roll back the reset.
    if (io) {
        try {
            io.emit('dashboard:reset', {
                timestamp: new Date().toISOString(),
                message: 'Daily midnight reset complete — please refetch data',
            });
            console.log('[MidnightReset] 📡 dashboard:reset broadcast sent to all clients');
        } catch (socketErr) {
            console.error('[MidnightReset] ⚠️  Failed to emit dashboard:reset (non-fatal):', socketErr);
        }
    }
}

/**
 * Registers the node-cron job.
 * The cron expression "0 0 * * *" with timezone "Asia/Kolkata" fires at
 * exactly 00:00:00 IST every day.
 *
 * @param io - Socket.IO server instance for broadcasting reset events.
 */
export function startMidnightReset(io?: SocketIOServer): void {
    cron.schedule(
        '0 0 * * *',
        async () => {
            console.log('[MidnightReset] 🕛 Midnight IST — starting daily reset...');
            try {
                await snapshotAndReset(io);
            } catch (err) {
                console.error('[MidnightReset] ❌ Reset failed:', err);
            }
        },
        { timezone: 'Asia/Kolkata' }
    );

    console.log('[MidnightReset] ✅ Cron job registered — fires at 00:00 IST daily.');
}