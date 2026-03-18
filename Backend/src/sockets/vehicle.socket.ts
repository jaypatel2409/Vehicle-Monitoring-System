import { Server as SocketIOServer } from 'socket.io';
import { getDashboardStats } from '../services/vehicle.service';

/**
 * Initialize vehicle monitoring socket events
 */
export function initializeVehicleSocket(io: SocketIOServer): void {
  // Emit dashboard stats to all connected clients
  const broadcastStats = async () => {
    try {
      const stats = await getDashboardStats();
      io.emit('dashboard:stats', stats);
    } catch (error) {
      console.error('Error broadcasting stats:', error);
    }
  };

  // Broadcast stats periodically (every 5 seconds)
  setInterval(broadcastStats, 5000);

  // Also broadcast on connection
  io.on('connection', async (socket) => {
    console.log(`🔌 Vehicle monitoring client connected: ${socket.id}`);

    // Send initial stats on connection
    try {
      const stats = await getDashboardStats();
      socket.emit('dashboard:stats', stats);
    } catch (error) {
      console.error('Error sending initial stats:', error);
    }

    // Handle client requests for stats
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

