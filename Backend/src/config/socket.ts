import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

export interface SocketConfig {
  cors: {
    origin: string | string[];
    methods: string[];
    credentials: boolean;
  };
}

export const socketConfig: SocketConfig = {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
    methods: ['GET', 'POST'],
    credentials: true,
  },
};

export const initializeSocket = (httpServer: HTTPServer): SocketIOServer => {
  const io = new SocketIOServer(httpServer, {
    cors: socketConfig.cors,
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

