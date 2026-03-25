process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import http from 'http';
import app from './app';
import { initializeSocket } from './config/socket';
import { initializeVehicleSocket } from './sockets/vehicle.socket';
import { getPollingService } from './services/hikcentral-polling.service';
import { testConnection } from './config/db';
import hikCentralConfig from './config/hikcentral';
import { ensureIntegrationStateTable, ensureVehicleEventsDedupeIndex } from './repositories/integrationState.repository';
import { testHikCentralConnection } from './services/hikcentral.service';
import { startMidnightReset } from './services/midnightReset.service'; // ← NEW
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3001;

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocket(httpServer);

// Initialize vehicle monitoring socket events
initializeVehicleSocket(io);

// Start HikCentral polling service (will be started after DB connection test)
let pollingService: ReturnType<typeof getPollingService> | null = null;

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('\n🛑 Shutting down gracefully...');

  if (pollingService) {
    pollingService.stop();
  }

  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Forcing shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Test database connection and start server
(async () => {
  // Test database connection first
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('❌ Cannot start server without database connection');
    console.error('Please check your .env file and ensure PostgreSQL is running');
    process.exit(1);
  }

  // Ensure required tables/indexes exist for integrations
  try {
    await ensureIntegrationStateTable();
    await ensureVehicleEventsDedupeIndex();
  } catch (err: any) {
    console.error('⚠️  Failed to ensure integration schema (continuing):', err?.message || err);
  }

  // Test HikCentral / Artemis connectivity once on startup (non-fatal on failure)
  try {
    await testHikCentralConnection();
  } catch {
    // Errors are already logged inside testHikCentralConnection; continue startup.
  }

  // Start HikCentral polling service
  pollingService = getPollingService();
  pollingService.start(io);

  // ── NEW: Register midnight IST reset cron job ──────────────────────────────
  startMidnightReset(io);
  // ──────────────────────────────────────────────────────────────────────────

  // Start HTTP server
  httpServer.listen(PORT, () => {
    console.log(`
🚀 Vehicle Monitoring Backend Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Server running on port ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
🔌 Socket.IO enabled
🔄 HikCentral polling: ${hikCentralConfig.useMock ? 'Mock Mode' : 'Real API'}
🕛 Midnight reset: enabled (00:00 IST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  }).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Please stop the process using this port or change the PORT in .env`);
      console.error(`💡 To find and kill the process: netstat -ano | findstr :${PORT}`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });
})();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown();
});