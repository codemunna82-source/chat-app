"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = void 0;
// Lightweight in-memory rate limiter to avoid adding extra dependencies.
// For production at scale, replace with Redis-based limiter (e.g., rate-limiter-flexible).
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 120; // per IP per window
const hits = new Map();
const rateLimiter = (req, res, next) => {
    // Do not count CORS preflight toward the limit (429 on OPTIONS breaks browser requests).
    if (req.method === 'OPTIONS') {
        return next();
    }
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const timestamps = hits.get(ip) || [];
    // Drop old timestamps
    while (timestamps.length && now - timestamps[0] > WINDOW_MS) {
        timestamps.shift();
    }
    if (timestamps.length >= MAX_REQUESTS) {
        res.status(429).json({ message: 'Too many requests, please slow down.' });
        return;
    }
    timestamps.push(now);
    hits.set(ip, timestamps);
    next();
};
exports.rateLimiter = rateLimiter;
