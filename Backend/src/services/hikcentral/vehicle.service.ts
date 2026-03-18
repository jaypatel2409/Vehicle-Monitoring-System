/**
 * services/hikcentral/vehicle.service.ts
 *
 * Fetches vehicle crossing records from HikCentral Artemis
 * POST /api/pms/v1/crossRecords/page
 *
 * Provides:
 *  - fetchCrossRecords()      — single paginated fetch
 *  - startPolling(io, ms)     — recurring poll every N ms with exponential backoff
 *  - stopPolling()            — clears the interval
 */

import { Server as SocketIOServer } from 'socket.io';
import hikCentralConfig from '../../config/hikcentral';
import { ANPR_CAMERAS } from '../../config/anprCameras';
import { artemisClient } from './client';
import { logger } from '../../utils/logger';
import { processVehicleEvent } from '../vehicle.service';

// ── Normalized vehicle crossing record ────────────────────────────────────────

/**
 * Normalized format returned to the dashboard / socket clients.
 */
export interface VehicleCrossRecord {
    plateNo: string;
    vehicleType: string;
    cameraName: string;
    /** 'IN' for entry cameras, 'OUT' for exit cameras */
    direction: 'IN' | 'OUT';
    passTime: string;   // ISO timestamp
    imageUrl: string;
}

// ── API request / response shapes ─────────────────────────────────────────────

interface CrossRecordsBody {
    pageNo: number;
    pageSize: number;
    startTime?: string;
    endTime?: string;
    /** Optional: filter by a specific camera */
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

// ── Normalizer ────────────────────────────────────────────────────────────────

function normalizeRecord(raw: CrossRecordRaw): VehicleCrossRecord | null {
    // plateNo — try all common field names used by HikCentral crossRecords API
    const plateNo = String(
        raw.plateNo ?? raw.plate_no ?? raw.vehicleNumber ?? raw.vehicle_number ?? '',
    ).trim();

    // passTime — crossRecords API returns `passTime` (ISO or epoch string)
    const passTime = String(
        raw.passTime ?? raw.pass_time ?? raw.crossTime ?? raw.cross_time ??
        raw.eventTime ?? raw.event_time ?? raw.captureTime ?? raw.capture_time ?? '',
    ).trim();

    const cameraIndexCode = String(
        raw.cameraIndexCode ?? raw.cameraIndexcode ?? raw.camera_index_code ?? '',
    ).trim();

    if (!plateNo || !passTime || !cameraIndexCode) {
        return null;
    }

    // Look up camera metadata from our ANPR_CAMERAS registry
    const cameraMeta = ANPR_CAMERAS[cameraIndexCode];
    if (!cameraMeta) {
        // Unknown camera — skip silently. Add it to anprCameras.ts if needed.
        return null;
    }

    const vehicleType = String(
        raw.vehicleType ?? raw.vehicle_type ?? raw.vehicleKind ?? 'Unknown',
    );

    const imageUrl = String(
        raw.vehiclePicUri ?? raw.vehicle_pic_uri ?? raw.plateImageUri ?? raw.imageUrl ?? '',
    );

    return {
        plateNo,
        vehicleType,
        cameraName: cameraMeta.name,
        direction: cameraMeta.direction === 'ENTRY' ? 'IN' : 'OUT',
        passTime,
        imageUrl,
    };
}

// ── fetchCrossRecords ─────────────────────────────────────────────────────────

export interface FetchCrossRecordsParams {
    pageNo?: number;
    pageSize?: number;
    startTime?: string;
    endTime?: string;
    /** Optional — filter by a specific camera index code */
    cameraIndexCode?: string;
}

/**
 * Fetch one page of vehicle crossing records from HikCentral Artemis.
 * Returns normalized VehicleCrossRecord[].
 */
export async function fetchCrossRecords(
    params: FetchCrossRecordsParams = {},
): Promise<VehicleCrossRecord[]> {
    const apiPath = hikCentralConfig.vehicleEventsPath; // /api/pms/v1/crossRecords/page

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

    // Check HikCentral application-level code
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

/**
 * Start recurring polling of HikCentral for vehicle crossing records.
 * Uses a sliding time-window to avoid duplicate records.
 * Implements exponential backoff (1s…60s) when HikCentral is unreachable.
 *
 * @param io          Socket.IO server instance to emit events to connected clients.
 * @param intervalMs  Polling interval in ms (default: from config, typically 10_000).
 */
export function startPolling(io: SocketIOServer, intervalMs?: number): void {
    if (pollingActive) {
        logger.warn('[VehicleService] Polling already active — ignoring duplicate startPolling() call');
        return;
    }

    const interval = intervalMs ?? hikCentralConfig.pollIntervalMs;
    pollingActive = true;

    logger.info('[VehicleService] Starting HikCentral cross-records polling', { intervalMs: interval });

    // Poll immediately on start, then schedule repeating interval
    runPoll(io);
    pollingTimer = setInterval(() => runPoll(io), interval);
}

/**
 * Stop the polling loop.
 */
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

    const startTime = new Date(windowStartMs).toISOString();
    const endTime = new Date(windowEndMs).toISOString();

    let pageNo = 1;
    const pageSize = hikCentralConfig.pageSize;
    const maxPages = hikCentralConfig.maxPagesPerPoll;
    let totalProcessed = 0;

    try {
        while (pageNo <= maxPages) {
            const records = await fetchCrossRecords({ pageNo, pageSize, startTime, endTime });

            if (records.length === 0) break;

            for (const record of records) {
                try {
                    // Persist to DB via existing vehicle service
                    const hikEvent = {
                        plateNo: record.plateNo,
                        eventType: record.direction,
                        eventTime: record.passTime,
                        tagColor: 'GREEN' as string,
                        gateName: ANPR_CAMERAS[
                            Object.keys(ANPR_CAMERAS).find(
                                (k) => ANPR_CAMERAS[k].name === record.cameraName,
                            ) ?? ''
                        ]?.gate ?? 'Unknown Gate',
                        cameraName: record.cameraName,
                        vehicleType: record.vehicleType,
                        imageUrl: record.imageUrl,
                    };

                    const saved = await processVehicleEvent(hikEvent as any, hikEvent.gateName);

                    if (saved) {
                        totalProcessed++;
                        // Emit the new vehicle to all connected dashboard clients
                        io.emit('vehicle:new', saved);
                    }

                    // Also emit raw normalized record for live feed widgets
                    io.emit('vehicle:event', {
                        plateNo: record.plateNo,
                        vehicleType: record.vehicleType,
                        cameraName: record.cameraName,
                        direction: record.direction,
                        passTime: record.passTime,
                        imageUrl: record.imageUrl,
                    } satisfies VehicleCrossRecord);
                } catch (innerErr) {
                    logger.error('[VehicleService] Failed to process record (skipping)', {
                        plateNo: record.plateNo,
                        error: (innerErr as Error)?.message,
                    });
                }
            }

            if (records.length < pageSize) break;
            pageNo++;
        }

        // Successful poll — reset failure counter and advance window
        lastWindowEndMs = windowEndMs;
        consecutiveFailures = 0;

        logger.info('[VehicleService] Poll complete', { totalProcessed, startTime, endTime });

        if (totalProcessed > 0) {
            io.emit('dashboard:stats-request');
        }
    } catch (err: any) {
        consecutiveFailures++;
        // Exponential backoff: 1s, 2s, 4s, 8s … capped at 60s
        const backoffMs = Math.min(60_000, 1_000 * Math.pow(2, Math.min(6, consecutiveFailures - 1)));
        cooldownUntilMs = Date.now() + backoffMs;

        logger.error('[VehicleService] Poll failed — entering backoff', {
            consecutiveFailures,
            backoffMs,
            error: err?.message,
            code: err?.code,
        });
    }
}
