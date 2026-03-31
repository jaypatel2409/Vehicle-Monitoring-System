export interface VehicleActivity {
  id: string;
  vehicleNumber: string;
  /** Four-Wheeler or Unknown. Two-wheelers are filtered by the backend. */
  vehicleType: 'Four-Wheeler' | 'Unknown';
  /** Vehicle owner name from the API */
  ownerName?: string | null;
  /** KC = Gate 1 / yellow sticker. SEZ = Gate 2 / green sticker. */
  area: 'KC' | 'SEZ';
  stickerColor: 'yellow' | 'green';
  direction: 'IN' | 'OUT';
  gateName: string;
  /** Pre-formatted IST string, e.g. "25 Mar 2026, 09:18:44 am" */
  dateTime: string;
}

export interface DashboardStats {
  yellowSticker: { entered: number; exited: number; inside: number };
  greenSticker: { entered: number; exited: number; inside: number };
  totalInside: number;
}

// ── Options used by filter dropdowns ─────────────────────────────────────────

export const gateOptions = [
  { value: 'all', label: 'All Gates' },
  { value: 'gate 1', label: 'Gate 1' },
  { value: 'gate 2', label: 'Gate 2' },
];

export const stickerOptions = [
  { value: 'all', label: 'All Areas' },
  { value: 'yellow', label: 'KC (Yellow)' },
  { value: 'green', label: 'SEZ (Green)' },
];

// ── Minimal mock data (only used as fallback / dev placeholder) ───────────────

export const mockDashboardStats: DashboardStats = {
  yellowSticker: { entered: 0, exited: 0, inside: 0 },
  greenSticker: { entered: 0, exited: 0, inside: 0 },
  totalInside: 0,
};

export const mockVehicleActivities: VehicleActivity[] = [];