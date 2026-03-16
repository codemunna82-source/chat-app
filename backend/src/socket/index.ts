import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

export const initSocket = async (server: HttpServer) => {
  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
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
      
      socket.join(userData._id);
      
      // Add socket to user's set of active sockets
      if (!onlineUsers.has(userData._id)) {
        onlineUsers.set(userData._id, new Set());
      }
      onlineUsers.get(userData._id)?.add(socket.id);
      
      socket.emit('connected');
      // Broadcast entire array of online user IDs
      io.emit('online users', Array.from(onlineUsers.keys()));
      console.log(`User ${userData._id} connected to personal room (Tab ID: ${socket.id})`);
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
        socket.in(user._id).emit('message received', newMessageReceived);
      });
    });

    // WebRTC Signaling
    socket.on('call user', (data) => {
      const targetRoom = data.userToCall;
      const socketsInRoom = io.sockets.adapter.rooms.get(targetRoom);
      console.log(`[CALL] Caller ${data.from} calling ${targetRoom}`);
      console.log(`[CALL] Sockets in target room: ${socketsInRoom ? Array.from(socketsInRoom).join(', ') : 'NONE (room empty!)'}`);
      console.log(`[CALL] All rooms:`, Array.from(io.sockets.adapter.rooms.keys()).filter(r => !r.startsWith('/')));
      
      io.to(targetRoom).emit('call user', { 
        signal: data.signalData, 
        from: data.from, 
        name: data.name,
        avatar: data.avatar,
        type: data.type
      });
      console.log(`[CALL] Event emitted to room ${targetRoom}`);
    });

    socket.on('answer call', (data) => {
      io.to(data.to).emit('call accepted', data.signal);
    });
    
    socket.on('end call', (data) => {
      io.to(data.to).emit('call ended');
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
