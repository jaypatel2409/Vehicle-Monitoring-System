/**
 * Vehicle API - fetches data from backend REST endpoints
 * GET /api/vehicles/stats, /inside, /events
 */

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export interface DashboardStats {
  totalVehicles?: number;
  yellowSticker: {
    entered: number;
    exited: number;
    inside: number;
  };
  greenSticker: {
    entered: number;
    exited: number;
    inside: number;
  };
  totalInside: number;
}

export interface InsideVehicle {
  vehicleNumber: string;
  category: string;
  lastEventTime: string;
  ownerName?: string;
}

export interface VehicleEvent {
  id: string;
  vehicleNumber: string;
  stickerColor: 'yellow' | 'green';
  direction: 'IN' | 'OUT';
  gateName: string;
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
}

/**
 * Get dashboard statistics (total vehicles, inside counts, entered/exited today)
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await axios.get(`${API_BASE}/api/vehicles/stats`, {
    headers: getAuthHeaders(),
  });
  if (!data.success) throw new Error(data.message || 'Failed to fetch stats');
  return data.data;
}

/**
 * Get vehicles currently inside
 */
export async function getInsideVehicles(limit = 100): Promise<InsideVehicle[]> {
  const { data } = await axios.get(`${API_BASE}/api/vehicles/inside`, {
    params: { limit },
    headers: getAuthHeaders(),
  });
  if (!data.success) throw new Error(data.message || 'Failed to fetch inside vehicles');
  return data.data;
}

/**
 * Get vehicle entry/exit events
 */
export async function getVehicleEvents(filters: VehicleEventsFilters = {}): Promise<VehicleEvent[]> {
  const { data } = await axios.get(`${API_BASE}/api/vehicles/events`, {
    params: filters,
    headers: getAuthHeaders(),
  });
  if (!data.success) throw new Error(data.message || 'Failed to fetch vehicle events');
  return data.data;
}
