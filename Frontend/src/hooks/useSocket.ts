/**
 * hooks/useSocket.ts
 *
 * Singleton Socket.IO client hook.
 * All pages share ONE connection so we never open multiple sockets.
 *
 * Usage:
 *   const socket = useSocket();
 *   useEffect(() => {
 *     if (!socket) return;
 *     socket.on('vehicle:new', handler);
 *     return () => { socket.off('vehicle:new', handler); };
 *   }, [socket]);
 */
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Module-level singleton — shared across all hook consumers
let socketInstance: Socket | null = null;

function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      autoConnect: true,
    });

    socketInstance.on('connect', () => {
      console.log('[Socket] ✅ Connected to server:', socketInstance?.id);
    });
    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket] ⚠️  Disconnected:', reason);
    });
    socketInstance.on('connect_error', (err) => {
      console.warn('[Socket] ❌ Connection error:', err.message);
    });
  }
  return socketInstance;
}

export function useSocket(): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);
    // No cleanup — singleton stays alive for the app's lifetime
  }, []);

  return socket;
}
