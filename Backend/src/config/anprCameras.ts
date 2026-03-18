export type AnprDirection = 'ENTRY' | 'EXIT';

export interface AnprCameraMeta {
  name: string;
  direction: AnprDirection;
  gate: 'GATE 1' | 'GATE 2' | string;
}

/**
 * Map HikCentral `cameraIndexCode` -> gate/direction metadata.
 *
 * Replace CAMERA_CODE_* with your real `cameraIndexCode` values from HikCentral.
 */
/**
 * ⚠️  ACTION REQUIRED — Replace placeholder keys with real cameraIndexCode values.
 *
 * How to find cameraIndexCode in HikCentral:
 *   1. Log in to the HikCentral web UI.
 *   2. Go to Resource Management → Camera.
 *   3. Click on each ANPR camera.
 *   4. Copy the "Index Code" value shown in the details pane.
 *   5. Replace CAMERA_CODE_1, CAMERA_CODE_2, etc. with those values below.
 *
 * Example (replace with your real codes):
 *   '3c4b2a1d-xxxx-xxxx-xxxx-xxxxxxxxxxxx': { name: 'GATE 1 IN ANPR', ... }
 *
 * Without correct codes, HikCentral events will be silently dropped
 * because normalizeRecord() cannot match the cameraIndexCode to a gate.
 */
export const ANPR_CAMERAS: Record<string, AnprCameraMeta> = {
  // ── Replace these keys with real cameraIndexCode values from HikCentral ──
  CAMERA_CODE_1: { name: 'GATE 1 IN ANPR', direction: 'ENTRY', gate: 'GATE 1' },
  CAMERA_CODE_2: { name: 'GATE 1 OUT ANPR', direction: 'EXIT', gate: 'GATE 1' },
  CAMERA_CODE_3: { name: 'GATE 2 IN ANPR', direction: 'ENTRY', gate: 'GATE 2' },
  CAMERA_CODE_4: { name: 'GATE 2 OUT ANPR', direction: 'EXIT', gate: 'GATE 2' },
};

export const ANPR_CAMERA_INDEX_CODES = Object.keys(ANPR_CAMERAS);

