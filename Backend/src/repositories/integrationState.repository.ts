import { query } from '../config/db';
import { logger } from '../utils/logger';

export interface IntegrationStateRow<TValue = unknown> {
  key: string;
  value: TValue;
  updatedAt: Date;
}

export async function ensureIntegrationStateTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS integration_state (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Ensures DB-level dedupe for vehicle events, so repeated polling doesn't insert duplicates.
 * This assumes events are uniquely identified by (vehicle_number, direction, event_time, gate_name).
 */
export async function ensureVehicleEventsDedupeIndex(): Promise<void> {
  try {
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_vehicle_events_dedupe
      ON vehicle_events (vehicle_number, direction, event_time, gate_name)
    `);
  } catch (err) {
    logger.warn('Could not ensure vehicle event dedupe index (will continue)', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getIntegrationState<TValue>(key: string): Promise<IntegrationStateRow<TValue> | null> {
  const result = await query(
    `SELECT key, value, updated_at FROM integration_state WHERE key = $1`,
    [key]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;
  return {
    key: row.key,
    value: row.value as TValue,
    updatedAt: row.updated_at,
  };
}

export async function setIntegrationState<TValue>(key: string, value: TValue): Promise<void> {
  await query(
    `
      INSERT INTO integration_state (key, value, updated_at)
      VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `,
    [key, JSON.stringify(value)]
  );
}

