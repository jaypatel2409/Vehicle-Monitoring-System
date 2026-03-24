/**
 * vehicleApi.ts — Central API client
 * - JWT auto-attached via request interceptor
 * - 401 auto-logout: clears storage and redirects to /login
 * - All API functions in one place
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

// On 401 — clear session and redirect to login
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
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
  lastEventTime: string;
  lastGate?: string;
  ownerName?: string;
}

export interface VehicleEvent {
  id: string;
  vehicleNumber: string;
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