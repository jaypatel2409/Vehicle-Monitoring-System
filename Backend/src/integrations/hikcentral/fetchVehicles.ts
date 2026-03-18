/**
 * @deprecated
 * This file is kept for backward compatibility only.
 * All vehicle event fetching is handled by the hikCentralService (hikcentral.service.ts)
 * and the polling service (hikcentral-polling.service.ts / services/hikcentral/vehicle.service.ts).
 *
 * Do NOT use this file for new development.
 *
 * Old path `/artemis/api/vehicle/v1/events` has been replaced with
 * `/api/pms/v1/crossRecords/page` (HikCentral 2.x Parking Management API).
 */

export async function fetchVehicleEvents(): Promise<{ processed: number; received: number }> {
  console.warn(
    '[fetchVehicles] DEPRECATED: This function is no longer in use. ' +
    'Use services/hikcentral/vehicle.service.ts → fetchCrossRecords() instead.'
  );
  return { processed: 0, received: 0 };
}
