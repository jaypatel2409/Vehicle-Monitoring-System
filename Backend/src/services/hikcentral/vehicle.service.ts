/**
 * services/hikcentral/vehicle.service.ts
 *
 * Fetches vehicle crossing records from HikCentral Artemis
 * POST /api/pms/v1/crossRecords/page
 *
 * Vehicle type handling:
 *   vehicleType=1001 → Four-Wheeler (kept)
 *   vehicleType=7    → Two-Wheeler  (filtered out — system is four-wheelers only)
 *   anything else    → Unknown      (kept, flagged)
 *
 * Category is determined by GATE, not tagColor:
 *   GATE 1 → KC  (yellow sticker)
 *   GATE 2 → SEZ (green sticker)
 */

import { Server as SocketIOServer } from 'socket.io';
import hikCentralConfig from '../../config/hikcentral';
import { ANPR_CAMERAS, ANPR_CAMERA_INDEX_CODES } from '../../config/anprCameras';
import { artemisClient } from './client';
import { logger } from '../../utils/logger';
import { processVehicleEvent } from '../vehicle.service';

// ── Vehicle type resolution ───────────────────────────────────────────────────

export type VehicleTypeLabel = 'Four-Wheeler' | 'Unknown';

/**
 * Resolve vehicleType code from HikCentral API response.
 * Returns null for two-wheelers (these records must be rejected).
 */
function resolveVehicleType(raw: CrossRecordRaw): VehicleTypeLabel | null {
  const code = String(raw.vehicleType ?? raw.vehicle_type ?? raw.type ?? '').trim();
  if (code === '7') return null;           // Two-wheeler — discard
  if (code === '1001') return 'Four-Wheeler';
  return 'Unknown';                        // Unrecognised code — keep but mark Unknown
}

// ── Normalized vehicle crossing record ────────────────────────────────────────

export interface VehicleCrossRecord {
  plateNo: string;
  /** Four-Wheeler, Unknown. Two-wheelers are filtered before this type is used. */
  vehicleType: VehicleTypeLabel;
  cameraName: string;
  /** 'IN' for entry cameras, 'OUT' for exit cameras */
  direction: 'IN' | 'OUT';
  passTime: string;   // ISO timestamp
  imageUrl: string;
  /**
   * Gate-derived colour (overrides tagColor from API):
   *   GATE 1 → YELLOW (KC)
   *   GATE 2 → GREEN  (SEZ)
   */
  tagColor: string;
}

// ── API request / response shapes ─────────────────────────────────────────────

interface CrossRecordsBody {
  pageNo: number;
  pageSize: number;
  startTime?: string;
  endTime?: string;
  cameraIndexCode?: string;
}

interface CrossRecordRaw {
  [key: string]: unknown;
}

interface ArtemisPagedResponse<T> {
  code: string | number;
  msg?: string;
  message?: string;
  data?: {
    total?: number;
    pageNo?: number;
    pageSize?: number;
    list?: T[];
    rows?: T[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toHikCentralTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(date.getTime() + istOffset);
  return (
    `${ist.getUTCFullYear()}-` +
    `${pad(ist.getUTCMonth() + 1)}-` +
    `${pad(ist.getUTCDate())}T` +
    `${pad(ist.getUTCHours())}:` +
    `${pad(ist.getUTCMinutes())}:` +
    `${pad(ist.getUTCSeconds())}+05:30`
  );
}

// ── Normalizer ────────────────────────────────────────────────────────────────

function normalizeRecord(raw: CrossRecordRaw): VehicleCrossRecord | null {
  const plateNo = String(
    raw.plateNo ?? raw.plate_no ?? raw.vehicleNumber ?? '',
  ).trim();

  const passTime = String(
    raw.crossTime ??
    raw.passTime ??
    raw.eventTime ??
    '',
  ).trim();

  const cameraIndexCode = String(
    raw.cameraIndexCode ?? raw.camera_index_code ?? '',
  ).trim();

  // Basic validation
  if (!plateNo || plateNo.length < 4 || plateNo === 'Unknown') return null;
  if (!passTime || isNaN(Date.parse(passTime))) return null;
  if (!cameraIndexCode) return null;

  const cameraMeta = ANPR_CAMERAS[cameraIndexCode];
  if (!cameraMeta) return null;

  // Resolve vehicle type — reject two-wheelers (code 7)
  const vehicleType = resolveVehicleType(raw);
  if (vehicleType === null) {
    logger.info('[VehicleService] Rejecting two-wheeler', { plateNo, cameraIndexCode });
    return null;
  }

  const imageUrl = String(raw.vehiclePicUri ?? raw.vehicle_pic_uri ?? '');

  // Category/colour is determined by the gate, NOT the API tagColor
  const tagColor = cameraMeta.defaultCategory === 'SEZ' ? 'GREEN' : 'YELLOW';

  return {
    plateNo,
    vehicleType,
    cameraName: cameraMeta.name,
    direction: cameraMeta.direction === 'ENTRY' ? 'IN' : 'OUT',
    passTime,
    imageUrl,
    tagColor,
  };
}

// ── fetchCrossRecords ─────────────────────────────────────────────────────────

export interface FetchCrossRecordsParams {
  pageNo?: number;
  pageSize?: number;
  startTime?: string;
  endTime?: string;
  cameraIndexCode?: string;
}

export async function fetchCrossRecords(
  params: FetchCrossRecordsParams = {},
): Promise<VehicleCrossRecord[]> {
  const apiPath = hikCentralConfig.vehicleEventsPath;

  const body: CrossRecordsBody = {
    pageNo: params.pageNo ?? 1,
    pageSize: params.pageSize ?? hikCentralConfig.pageSize,
  };

  if (params.startTime) body.startTime = params.startTime;
  if (params.endTime) body.endTime = params.endTime;
  if (params.cameraIndexCode) body.cameraIndexCode = params.cameraIndexCode;

  const bodyString = JSON.stringify(body);

  logger.info('[VehicleService] fetchCrossRecords', {
    apiPath,
    pageNo: body.pageNo,
    pageSize: body.pageSize,
    startTime: body.startTime,
    endTime: body.endTime,
  });

  const response = await artemisClient.request<ArtemisPagedResponse<CrossRecordRaw>>({
    method: 'POST',
    url: apiPath,
    data: bodyString,
  });

  const payload = response.data;

  const code = payload?.code;
  if (code !== undefined && code !== 0 && code !== '0' && code !== 200 && code !== '200') {
    const msg = payload?.msg ?? payload?.message ?? 'Unknown error';
    logger.error('[VehicleService] HikCentral returned error code', { code, msg, apiPath });
    throw new Error(`HikCentral API error — code=${code}: ${msg}`);
  }

  const rawList: CrossRecordRaw[] =
    payload?.data?.list ??
    payload?.data?.rows ??
    (Array.isArray((payload as any)?.list) ? (payload as any).list : []);

  const records = rawList
    .filter((r): r is CrossRecordRaw => r != null && typeof r === 'object')
    .map(normalizeRecord)
    .filter((r): r is VehicleCrossRecord => r !== null);

  logger.info('[VehicleService] fetchCrossRecords result', {
    rawCount: rawList.length,
    normalizedCount: records.length,
    apiPath,
  });

  return records;
}

// ── Polling ───────────────────────────────────────────────────────────────────

let pollingTimer: NodeJS.Timeout | null = null;
let pollingActive = false;
let consecutiveFailures = 0;
let cooldownUntilMs = 0;
let lastWindowEndMs: number | null = null;

export function startPolling(io: SocketIOServer, intervalMs?: number): void {
  if (pollingActive) {
    logger.warn('[VehicleService] Polling already active — ignoring duplicate startPolling() call');
    return;
  }

  const interval = intervalMs ?? hikCentralConfig.pollIntervalMs;
  pollingActive = true;

  logger.info('[VehicleService] Starting HikCentral cross-records polling', { intervalMs: interval });

  runPoll(io);
  pollingTimer = setInterval(() => runPoll(io), interval);
}

export function stopPolling(): void {
  pollingActive = false;
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  logger.info('[VehicleService] Polling stopped');
}

async function runPoll(io: SocketIOServer): Promise<void> {
  if (!pollingActive) return;

  const now = Date.now();
  if (now < cooldownUntilMs) {
    logger.warn('[VehicleService] In backoff cooldown, skipping poll', {
      remainingMs: cooldownUntilMs - now,
    });
    return;
  }

  const windowEndMs = Date.now();
  const windowStartMs =
    lastWindowEndMs !== null
      ? lastWindowEndMs
      : windowEndMs - hikCentralConfig.initialLookbackMs;

  const startTime = toHikCentralTime(new Date(windowStartMs));
  const endTime = toHikCentralTime(new Date(windowEndMs));

  const pageSize = hikCentralConfig.pageSize;
  const maxPages = hikCentralConfig.maxPagesPerPoll;
  let totalProcessed = 0;

  try {
    for (const cameraIndexCode of ANPR_CAMERA_INDEX_CODES) {
      const cameraMeta = ANPR_CAMERAS[cameraIndexCode];

      logger.info('[VehicleService] Polling camera', {
        cameraIndexCode,
        name: cameraMeta.name,
        startTime,
        endTime,
      });

      let pageNo = 1;

      while (pageNo <= maxPages) {
        const records = await fetchCrossRecords({
          pageNo,
          pageSize,
          startTime,
          endTime,
          cameraIndexCode,
        });

        if (records.length === 0) break;

        for (const record of records) {
          try {
            const hikEvent = {
              plateNo: record.plateNo,
              eventType: record.direction,
              eventTime: record.passTime,
              tagColor: record.tagColor,   // gate-derived colour
              vehicleType: record.vehicleType,
              gateName: cameraMeta.gate,
              cameraName: record.cameraName,
              cameraIndexCode,
            };

            const saved = await processVehicleEvent(hikEvent as any, cameraMeta.gate);

            if (saved) {
              totalProcessed++;
              io.emit('vehicle:new', saved);
            }

            io.emit('vehicle:event', {
              plateNo: record.plateNo,
              cameraName: record.cameraName,
              direction: record.direction,
              passTime: record.passTime,
            } satisfies Partial<VehicleCrossRecord>);

          } catch (innerErr) {
            logger.error('[VehicleService] Failed to process record', {
              plateNo: record.plateNo,
              error: (innerErr as Error)?.message,
            });
          }
        }

        if (records.length < pageSize) break;
        pageNo++;
      }
    }

    lastWindowEndMs = windowEndMs;
    consecutiveFailures = 0;

    logger.info('[VehicleService] Poll complete', { totalProcessed, startTime, endTime });

    if (totalProcessed > 0) {
      io.emit('dashboard:stats-request');
    }

  } catch (err: any) {
    consecutiveFailures++;
    const backoffMs = Math.min(
      60_000,
      1_000 * Math.pow(2, Math.min(6, consecutiveFailures - 1))
    );
    cooldownUntilMs = Date.now() + backoffMs;

    logger.error('[VehicleService] Poll failed — entering backoff', {
      consecutiveFailures,
      backoffMs,
      error: err?.message,
    });
  }
}