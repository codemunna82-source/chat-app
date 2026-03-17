"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = void 0;
const socket_io_1 = require("socket.io");
const redis_1 = require("redis");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const initSocket = (server) => __awaiter(void 0, void 0, void 0, function* () {
    const rawClientUrls = process.env.CLIENT_URL || process.env.CLIENT_URI || 'http://localhost:3000';
    const allowedOrigins = rawClientUrls
        .split(/[;,]/)
        .map(origin => origin.trim())
        .filter(Boolean);
    const allowAnyOrigin = allowedOrigins.includes('*');
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: (origin, callback) => {
                if (!origin)
                    return callback(null, true);
                if (allowAnyOrigin || allowedOrigins.includes(origin))
                    return callback(null, true);
                return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
            },
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });
    // Scale architecture: Attach Redis Adapter for horizontal distributed nodes if Redis URL exists
    if (process.env.REDIS_URL) {
        try {
            const pubClient = (0, redis_1.createClient)({ url: process.env.REDIS_URL });
            const subClient = pubClient.duplicate();
            yield Promise.all([pubClient.connect(), subClient.connect()]);
            io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
            console.log("Redis Pub/Sub Adapter Attached to Socket.io for Horizontal Scaling");
        }
        catch (err) {
            console.error("Failed to connect to Redis Adapter, falling back to local memory:", err);
        }
    }
    // Track online users mapping: userId -> Set<socketId>
    const onlineUsers = new Map();
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);
        // Join user's personal room for direct events
        socket.on('setup', (userData) => {
            var _a;
            if (!userData || !userData._id)
                return;
            socket.join(userData._id);
            // Add socket to user's set of active sockets
            if (!onlineUsers.has(userData._id)) {
                onlineUsers.set(userData._id, new Set());
            }
            (_a = onlineUsers.get(userData._id)) === null || _a === void 0 ? void 0 : _a.add(socket.id);
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
            if (!chat.users)
                return console.log('chat.users not defined');
            chat.users.forEach((user) => {
                if (user._id === newMessageReceived.sender._id)
                    return;
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
            let disconnectedUserId = null;
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
});
exports.initSocket = initSocket;
