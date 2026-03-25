/**
 * vehicleApi.ts — Central API client
 * - JWT auto-attached via request interceptor
 * - 401 auto-logout: only triggers on genuine auth failures, NOT on
 *   network errors or non-auth endpoints (prevents spurious logouts)
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// Attach JWT to every outgoing request
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 — only clear session for non-login endpoints.
// A network timeout or server error (5xx) must NOT trigger a logout.
apiClient.interceptors.response.use(
  response => response,
  error => {
    const isAuthEndpoint = error.config?.url?.includes('/api/auth/login');
    const is401 = error.response?.status === 401;

    if (is401 && !isAuthEndpoint) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalVehicles?: number;
  yellowSticker: { entered: number; exited: number; inside: number };
  greenSticker: { entered: number; exited: number; inside: number };
  totalInside: number;
}

export interface InsideVehicle {
  vehicleNumber: string;
  category: string;
  vehicleType: 'Four-Wheeler' | 'Unknown';
  lastEventTime: string;
  lastGate?: string;
  ownerName?: string;
}

export interface VehicleEvent {
  id: string;
  vehicleNumber: string;
  /** Four-Wheeler or Unknown. Two-wheelers are filtered by the backend. */
  vehicleType: 'Four-Wheeler' | 'Unknown';
  /** KC (Gate 1, yellow) or SEZ (Gate 2, green) */
  area: 'KC' | 'SEZ';
  stickerColor: 'yellow' | 'green';
  direction: 'IN' | 'OUT';
  gateName: string;
  cameraName?: string;
  dateTime: string;
  ownerName?: string;
}

export interface VehicleEventsFilters {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  category?: 'SEZ' | 'KC';
  direction?: 'IN' | 'OUT';
  gateName?: string;
  vehicleNumber?: string;
}

export interface CountsRow {
  date: string;
  category: string;
  direction: string;
  gate_name: string;
  count: number;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await apiClient.get('/api/vehicles/stats');
  if (!data.success) throw new Error(data.message || 'Failed to fetch stats');
  return data.data;
}

export async function getInsideVehicles(limit = 100): Promise<InsideVehicle[]> {
  const { data } = await apiClient.get('/api/vehicles/inside', { params: { limit } });
  if (!data.success) throw new Error(data.message || 'Failed to fetch inside vehicles');
  return data.data;
}

export async function getVehicleEvents(filters: VehicleEventsFilters = {}): Promise<VehicleEvent[]> {
  const { data } = await apiClient.get('/api/vehicles/events', { params: filters });
  if (!data.success) throw new Error(data.message || 'Failed to fetch events');
  return data.data;
}

export async function getVehicleCounts(startDate: string, endDate: string): Promise<CountsRow[]> {
  const { data } = await apiClient.get('/api/vehicles/counts', {
    params: { startDate, endDate },
  });
  if (!data.success) throw new Error(data.message || 'Failed to fetch counts');
  return data.data;
}