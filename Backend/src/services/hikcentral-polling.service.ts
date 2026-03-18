/**
 * hikcentral-polling.service.ts
 *
 * This is the top-level entry point that starts/stops the HikCentral vehicle polling loop.
 * Actual polling logic lives in services/hikcentral/vehicle.service.ts.
 *
 * Usage in server.ts:
 *   import pollingService from './services/hikcentral-polling.service';
 *   pollingService.start(io);
 */

import { Server as SocketIOServer } from 'socket.io';
import hikCentralConfig from '../config/hikcentral';
import { logger } from '../utils/logger';
import { startPolling, stopPolling } from './hikcentral/vehicle.service';

class HikCentralPollingService {
  private isRunning = false;

  /**
   * Start polling HikCentral for vehicle crossing events.
   * Polling interval is configured via HIKCENTRAL_POLL_INTERVAL_SECONDS in .env (default: 10s).
   */
  start(io: SocketIOServer): void {
    if (this.isRunning) {
      logger.warn('[PollingService] Already running — ignoring duplicate start()');
      return;
    }

    if (hikCentralConfig.useMock) {
      logger.info('[PollingService] Mock mode enabled — polling disabled');
      return;
    }

    this.isRunning = true;

    logger.info('[PollingService] Starting HikCentral vehicle event poller', {
      intervalMs: hikCentralConfig.pollIntervalMs,
      baseUrl: hikCentralConfig.baseUrl,
      vehicleEventsPath: hikCentralConfig.vehicleEventsPath,
    });

    startPolling(io, hikCentralConfig.pollIntervalMs);
  }

  /**
   * Stop the polling loop. Called during graceful server shutdown.
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    stopPolling();
    logger.info('[PollingService] Stopped');
  }
}

// Singleton
const pollingServiceInstance = new HikCentralPollingService();

export function getPollingService(): HikCentralPollingService {
  return pollingServiceInstance;
}

export default pollingServiceInstance;
