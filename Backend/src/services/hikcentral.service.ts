import hikCentralConfig from '../config/hikcentral';
import { ANPR_CAMERA_INDEX_CODES, ANPR_CAMERAS } from '../config/anprCameras';
import { hikCentralClient } from '../integrations/hikcentral/client';
import { HikCentralPaged, HikCentralVehicleEvent } from '../integrations/hikcentral/types';
import { logger } from '../utils/logger';

export type HikCentralEvent = HikCentralVehicleEvent;

export interface FetchVehicleEventsPageParams {
  pageNo: number;
  pageSize: number;
  /**
   * Optional time window for event queries.
   * When provided, HikCentral will be asked for events in [startTime, endTime].
   */
  startTime?: string;
  endTime?: string;
}

export interface HikCentralService {
  fetchEventsPage(params: FetchVehicleEventsPageParams): Promise<HikCentralVehicleEvent[]>;
}

function normalizeVehiclePassing(raw: Record<string, unknown>): HikCentralVehicleEvent | null {
  const plateNo = (raw.plateNo ?? raw.plate_no ?? raw.vehicleNumber ?? raw.vehicle_number) as string;
  const eventTime = (raw.eventTime ??
    raw.event_time ??
    raw.passTime ??
    raw.pass_time ??
    (raw as any).crossTime ??
    (raw as any).cross_time ??
    (raw as any).captureTime ??
    (raw as any).capture_time ??
    raw.dateTime ??
    raw.time) as string;

  const cameraIndexCode = (raw.cameraIndexCode ??
    raw.cameraIndexcode ??
    raw.camera_index_code ??
    raw.indexCode ??
    raw.cameraCode) as string | undefined;

  if (!plateNo || !eventTime || !cameraIndexCode) return null;

  const cameraMeta = ANPR_CAMERAS[cameraIndexCode];
  if (!cameraMeta) return null;

  const tagColor = (raw.tagColor ?? raw.tag_color ?? raw.category ?? raw.stickerColor ?? 'GREEN') as string;
  const ownerName = (raw.ownerName ?? raw.owner_name ?? raw.owner) as string | undefined;
  const cameraName = (raw.cameraName ?? (raw as any).camera_name) as string | undefined;
  const vehicleType = (raw as any).vehicleType ?? (raw as any).vehicle_type;
  const imageUrl = (raw as any).vehiclePicUri ?? (raw as any).vehicle_pic_uri;

  return {
    plateNo: String(plateNo),
    eventType: cameraMeta.direction === 'ENTRY' ? 'IN' : 'OUT',
    eventTime: String(eventTime),
    tagColor: String(tagColor).toUpperCase() === 'YELLOW' ? 'YELLOW' : 'GREEN',
    ownerName: ownerName ? String(ownerName) : undefined,
    gateName: cameraMeta.gate,
    cameraIndexCode,
    cameraName: cameraMeta.name || (cameraName ? String(cameraName) : undefined),
    vehicleType,
    imageUrl,
    // keep raw for debugging/forward-compat if needed
    raw,
  };
}

class RealHikCentralService implements HikCentralService {
  async fetchEventsPage(params: FetchVehicleEventsPageParams): Promise<HikCentralVehicleEvent[]> {
    if (hikCentralConfig.useMock) {
      throw new Error('HikCentral mock mode is enabled; real integration is disabled by configuration.');
    }

    const apiPath = hikCentralConfig.vehicleEventsPath;
    const method = 'POST' as const;

    // HikCentral Parking Management "crossRecords" API uses paging + required time window.
    const body: {
      pageNo: number;
      pageSize: number;
      startTime?: string;
      endTime?: string;
    } = {
      pageNo: params.pageNo,
      pageSize: params.pageSize,
    };

    if (params.startTime) {
      body.startTime = params.startTime;
    }
    if (params.endTime) {
      body.endTime = params.endTime;
    }

    logger.info('Calling HikCentral vehicle events API', {
      apiPath,
      pageNo: params.pageNo,
      pageSize: params.pageSize,
      ...(params.startTime ? { startTime: params.startTime } : {}),
      ...(params.endTime ? { endTime: params.endTime } : {}),
    });

    try {
      const pageData = await hikCentralClient.requestJson<HikCentralPaged<Record<string, unknown>>, typeof body>({
        method,
        apiPath,
        body,
      });

      const rawList = pageData?.list ?? pageData?.rows ?? [];

      const events = rawList
        .map((r) => (r && typeof r === 'object' ? normalizeVehiclePassing(r as Record<string, unknown>) : null))
        .filter((e): e is HikCentralVehicleEvent => Boolean(e));

      if (!events || events.length === 0) {
        logger.warn('HikCentral returned zero vehicle events', {
          apiPath,
          pageNo: params.pageNo,
          pageSize: params.pageSize,
        });
      } else {
        logger.info('HikCentral vehicle events received', {
          count: events.length,
          apiPath,
        });
      }

      return events;
    } catch (err) {
      logger.errorWithCause('HikCentral fetchEventsPage failed', err, {
        apiPath,
        pageNo: params.pageNo,
        pageSize: params.pageSize,
        ...(params.startTime ? { startTime: params.startTime } : {}),
        ...(params.endTime ? { endTime: params.endTime } : {}),
      });
      throw err;
    }
  }
}

/**
 * Simple connectivity test for HikCentral Artemis API.
 * This verifies authentication, endpoint path, and basic connectivity.
 */
export async function testHikCentralConnection(): Promise<void> {
  if (hikCentralConfig.useMock) {
    logger.info('Skipping HikCentral API connection test (mock mode enabled)');
    return;
  }

  const apiPath = hikCentralConfig.vehicleEventsPath;
  const method = 'POST' as const;
  const now = Date.now();
  const body = {
    pageNo: 1,
    pageSize: 1,
    startTime: new Date(now - 5 * 60 * 1000).toISOString(),
    endTime: new Date(now).toISOString(),
  };

  try {
    logger.info('Testing HikCentral API connection', { apiPath });
    await hikCentralClient.requestJson<unknown, typeof body>({
      method,
      apiPath,
      body,
    });
    logger.info('HikCentral API connection successful', { apiPath });
  } catch (err) {
    logger.errorWithCause('HikCentral API connection test failed', err, { apiPath });
  }
}

export default new RealHikCentralService();