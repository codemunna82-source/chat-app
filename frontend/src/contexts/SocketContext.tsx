'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/useAuthStore';

interface SocketContextData {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: string[];
}

const SocketContext = createContext<SocketContextData>({
  socket: null,
  isConnected: false,
  onlineUsers: [],
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      setOnlineUsers([]);
      return;
    }

    const socketUrl = (() => {
      if (process.env.NEXT_PUBLIC_SOCKET_URL) return process.env.NEXT_PUBLIC_SOCKET_URL;
      if (typeof window !== 'undefined') return window.location.origin;
      if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
      if (process.env.RENDER_EXTERNAL_URL) return `https://${process.env.RENDER_EXTERNAL_URL}`;
      return 'http://localhost:5000';
    })();
    console.log('Connecting to socket at:', socketUrl);
    
    const socketInstance = io(socketUrl, {
      withCredentials: true,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      // Setup user personal room FIRST
      socketInstance.emit('setup', user);
    });

    // Only expose socket to the app AFTER backend confirms setup is done
    socketInstance.on('connected', () => {
      console.log('Socket setup confirmed, user joined personal room');
      setIsConnected(true);
      setSocket(socketInstance);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
      setOnlineUsers([]);
    });

    // Handle reconnect -- re-setup the user's personal room
    socketInstance.on('reconnect', () => {
      console.log('Socket reconnected, re-emitting setup');
      socketInstance.emit('setup', user);
    });

    socketInstance.on('online users', (users: string[]) => {
      setOnlineUsers(Array.isArray(users) ? users : []);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};
