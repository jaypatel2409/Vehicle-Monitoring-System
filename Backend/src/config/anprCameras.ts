export type AnprDirection = 'ENTRY' | 'EXIT';

export interface AnprCameraMeta {
  name: string;
  direction: AnprDirection;
  gate: 'GATE 1' | 'GATE 2' | string;
}

export const ANPR_CAMERAS: Record<string, AnprCameraMeta> = {
  '42': { name: 'GATE 1 IN ANPR',  direction: 'ENTRY', gate: 'GATE 1' },
  '43': { name: 'GATE 1 OUT ANPR', direction: 'EXIT',  gate: 'GATE 1' },
  '44': { name: 'GATE 2 IN ANPR',  direction: 'ENTRY', gate: 'GATE 2' },
  '45': { name: 'GATE 2 OUT ANPR', direction: 'EXIT',  gate: 'GATE 2' },
};

export const ANPR_CAMERA_INDEX_CODES = Object.keys(ANPR_CAMERAS);
