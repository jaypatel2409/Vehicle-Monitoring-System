// Backend/src/controllers/dailyCounts.controller.ts
// Serves GET /api/vehicles/daily-snapshot
// Returns rows from the daily_snapshot table (populated by midnightReset.service.ts).

import { Request, Response } from 'express';
import { query } from '../config/db';

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

export const getDailySnapshot = async (req: Request, res: Response): Promise<void> => {
    try {
        // Ensure table exists on first call (idempotent)
        await query(ENSURE_TABLE_SQL);

        const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

        const params: string[] = [];
        const conditions: string[] = [];

        if (startDate) {
            params.push(startDate);
            conditions.push(`snapshot_date >= $${params.length}::DATE`);
        }
        if (endDate) {
            params.push(endDate);
            conditions.push(`snapshot_date <= $${params.length}::DATE`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await query(
            `SELECT
         snapshot_date,
         category,
         direction,
         gate_name,
         total_count,
         snapped_at
       FROM daily_snapshot
       ${where}
       ORDER BY snapshot_date DESC, category, direction`,
            params
        );

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error: any) {
        console.error('getDailySnapshot error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch daily snapshot data',
            error: error.message,
        });
    }
};