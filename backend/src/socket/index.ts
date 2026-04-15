import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

export const initSocket = async (server: HttpServer) => {
  const rawClientUrls = process.env.CLIENT_URL || process.env.CLIENT_URI || 'http://localhost:3000';
  const allowedOrigins = rawClientUrls
    .split(/[;,]/)
    .map(origin => origin.trim())
    .filter(Boolean);
  const allowAnyOrigin = allowedOrigins.includes('*');

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowAnyOrigin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Scale architecture: Attach Redis Adapter for horizontal distributed nodes if Redis URL exists
  if (process.env.REDIS_URL) {
      try {
          const pubClient = createClient({ url: process.env.REDIS_URL });
          const subClient = pubClient.duplicate();

          await Promise.all([pubClient.connect(), subClient.connect()]);

          io.adapter(createAdapter(pubClient, subClient));
          console.log("Redis Pub/Sub Adapter Attached to Socket.io for Horizontal Scaling");
      } catch (err) {
          console.error("Failed to connect to Redis Adapter, falling back to local memory:", err);
      }
  }

  // Track online users mapping: userId -> Set<socketId>
  const onlineUsers = new Map<string, Set<string>>();

  io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join user's personal room for direct events
    socket.on('setup', (userData) => {
      if (!userData || !userData._id) return;

      const userId = String(userData._id);
      socket.join(userId);

      // Add socket to user's set of active sockets
      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId)?.add(socket.id);

      socket.emit('connected');
      // Broadcast entire array of online user IDs
      io.emit('online users', Array.from(onlineUsers.keys()));
      console.log(`User ${userId} connected to personal room (Tab ID: ${socket.id})`);
    });

    // Handle joining a specific chat
    socket.on('join chat', (room) => {
      socket.join(room);
      console.log(`User joined room: ${room}`);
    });

    // Handle typing indicators
    socket.on('typing', (room) => socket.in(room).emit('typing'));
    socket.on('stop typing', (room) => socket.in(room).emit('stop typing'));

    // Handle new messages
    socket.on('new message', (newMessageReceived) => {
      const chat = newMessageReceived.chat;

      if (!chat.users) return console.log('chat.users not defined');

      chat.users.forEach((user: any) => {
        if (user._id === newMessageReceived.sender._id) return;
        socket.in(String(user._id)).emit('message received', newMessageReceived);
      });
    });

    // WebRTC Signaling
    socket.on('call user', (data) => {
      const targetRoom = data?.userToCall != null ? String(data.userToCall) : '';
      if (!targetRoom) return;

      const socketsInRoom = io.sockets.adapter.rooms.get(targetRoom);
      console.log(`[CALL] Caller ${data.from} calling ${targetRoom}`);
      console.log(`[CALL] Sockets in target room: ${socketsInRoom ? Array.from(socketsInRoom).join(', ') : 'NONE (room empty!)'}`);
      console.log(`[CALL] All rooms:`, Array.from(io.sockets.adapter.rooms.keys()).filter(r => !r.startsWith('/')));

      io.to(targetRoom).emit('call user', {
        signal: data.signalData,
        from: data.from != null ? String(data.from) : data.from,
        name: data.name,
        avatar: data.avatar,
        type: data.type,
      });
      console.log(`[CALL] Event emitted to room ${targetRoom}`);
    });

    socket.on('answer call', (data) => {
      if (data?.to == null) return;
      io.to(String(data.to)).emit('call accepted', data.signal);
    });

    /** WebRTC trickle ICE (video/audio calls only; does not affect chat). */
    socket.on('call ice-candidate', (data: { to?: string; from?: string; candidate?: unknown }) => {
      if (data?.to == null || data?.from == null || data.candidate == null) return;
      io.to(String(data.to)).emit('call ice-candidate', {
        from: String(data.from),
        candidate: data.candidate,
      });
    });

    socket.on('end call', (data) => {
      if (data?.to == null) return;
      io.to(String(data.to)).emit('call ended');
    });

    socket.on('disconnect', () => {
      // Find which user owned this socket
      let disconnectedUserId: string | null = null;
      
      for (const [userId, socketIds] of onlineUsers.entries()) {
        if (socketIds.has(socket.id)) {
          disconnectedUserId = userId;
          socketIds.delete(socket.id);
          
          // If the user has no more open sockets (closed all tabs)
          if (socketIds.size === 0) {
            onlineUsers.delete(userId);
          }
          break;
        }
      }

      if (disconnectedUserId) {
        // Emit updated keys (which are userIds) only if state actually changed
        io.emit('online users', Array.from(onlineUsers.keys()));
      }
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  return io;
};
