import { Server as SocketIOServer } from 'socket.io';
import { getDashboardStats } from '../services/vehicle.service';

/**
 * Broadcast the latest dashboard stats to ALL connected clients.
 * Called both by the periodic interval and directly by the polling service
 * after it has finished saving new vehicle events.
 */
export async function broadcastStatsNow(io: SocketIOServer): Promise<void> {
  try {
    const stats = await getDashboardStats();
    io.emit('dashboard:stats', stats);
  } catch (error) {
    console.error('Error broadcasting stats:', error);
  }
}

/**
 * Initialize vehicle monitoring socket events.
 */
export function initializeVehicleSocket(io: SocketIOServer): void {
  // Broadcast stats periodically — 15 s is enough to keep dashboards fresh
  // without hammering the DB with unnecessary COUNT queries.
  setInterval(() => broadcastStatsNow(io), 15_000);

  io.on('connection', async (socket) => {
    console.log(`🔌 Vehicle monitoring client connected: ${socket.id}`);

    // Send initial stats on connection
    try {
      const stats = await getDashboardStats();
      socket.emit('dashboard:stats', stats);
    } catch (error) {
      console.error('Error sending initial stats:', error);
    }

    // Handle client-side requests for a stats refresh
    socket.on('dashboard:request-stats', async () => {
      try {
        const stats = await getDashboardStats();
        socket.emit('dashboard:stats', stats);
      } catch (error) {
        console.error('Error sending requested stats:', error);
        socket.emit('dashboard:error', { message: 'Failed to fetch stats' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Vehicle monitoring client disconnected: ${socket.id}`);
    });
  });
}
