export type HikCentralApiCode = number | string;

export interface HikCentralApiResponse<TData> {
  code: HikCentralApiCode;
  msg?: string;
  message?: string;
  data?: TData;
}

export interface HikCentralPaged<TItem> {
  pageNo?: number;
  pageSize?: number;
  total?: number;
  totalPage?: number;
  list?: TItem[];
  rows?: TItem[];
}

/**
 * Minimal vehicle event fields used by this project.
 * Keep this aligned with your HikCentral OpenAPI response payload.
 */
export interface HikCentralVehicleEvent {
  plateNo: string;
  eventType: 'IN' | 'OUT';
  eventTime: string; // ISO timestamp string from HikCentral
  tagColor: string;
  ownerName?: string;
  gateName?: string;
  cameraIndexCode?: string;
  cameraName?: string;

  // Allow forward compatibility with additional HikCentral fields without breaking parsing.
  [key: string]: unknown;
}

export function isHikCentralSuccessCode(code: HikCentralApiCode): boolean {
  return code === 0 || code === '0' || code === 200 || code === '200';
}

export function extractPagedList<T>(data: unknown): T[] | null {
  if (Array.isArray(data)) return data as T[];
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (Array.isArray(d.data)) return d.data as T[];
  if (Array.isArray(d.list)) return d.list as T[];
  if (Array.isArray(d.rows)) return d.rows as T[];

  return null;
}

