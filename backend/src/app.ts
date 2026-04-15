import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import mongoose from 'mongoose';

import userRoutes from './routes/user.routes';
import chatRoutes from './routes/chat.routes';
import messageRoutes from './routes/message.routes';
import statusRoutes from './routes/status.routes';
import callRoutes from './routes/call.routes';
import uploadRoutes from './routes/upload.routes';
import { rateLimiter } from './middlewares/rateLimit.middleware';

dotenv.config();

const app: Application = express();

// Allow multiple comma-separated origins from env e.g. CLIENT_URL="https://app.com,https://admin.app.com"
// Support both CLIENT_URL and legacy CLIENT_URI to avoid misnamed envs in hosting dashboards.
const rawClientUrls = process.env.CLIENT_URL || process.env.CLIENT_URI || 'http://localhost:3000';
const LOCAL_APP_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];
const normalizeOrigin = (o: string) => o.replace(/\/$/, '');

const allowedOrigins = [
  ...new Set([
    ...LOCAL_APP_ORIGINS,
    ...rawClientUrls
      .split(/[;,]/) // accept comma or semicolon separators
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]),
].map(normalizeOrigin);

const allowAnyOrigin = allowedOrigins.includes('*');
const isProduction = process.env.NODE_ENV === 'production';

/** Allow dev UIs on private networks (e.g. http://192.168.x.x:3000) to hit a hosted API without listing every IP in CLIENT_URL. */
function isPrivateNetworkOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

const splitEnvList = (value: string | undefined, fallback?: string) =>
  (value || fallback || '')
    .split(/[;,]/)
    .map(entry => entry.trim())
    .filter(Boolean);

const cdnSources = splitEnvList(process.env.CDN_URL);
const socketSources = splitEnvList(process.env.SOCKET_URL, 'http://localhost:5000');
const apiSources = splitEnvList(process.env.API_URL, 'http://localhost:5000');

// CORS must run before rate limit (so OPTIONS preflight is not throttled) and before Helmet
// so API responses always get CORS headers applied as expected.
app.use(
  cors({
    credentials: true,
    optionsSuccessStatus: 204,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    origin: isProduction
      ? (origin, callback) => {
          if (!origin) return callback(null, true);
          const o = normalizeOrigin(origin);
          if (allowAnyOrigin || allowedOrigins.includes(o) || isPrivateNetworkOrigin(o)) {
            return callback(null, true);
          }
          console.warn('[CORS] Blocked origin (add to CLIENT_URL on server):', o);
          return callback(null, false);
        }
      : true,
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'blob:', ...allowedOrigins, ...cdnSources],
        'media-src': ["'self'", 'data:', 'blob:', ...allowedOrigins, ...cdnSources],
        'connect-src': ["'self'", ...allowedOrigins, ...socketSources, ...apiSources],
      },
    },
  })
);
app.use(compression());
app.use(rateLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// If the HTTP server is up before Mongo finishes connecting, return JSON instead of hanging / timing out oddly.
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (!req.path.startsWith('/api')) return next();
  if (mongoose.connection.readyState === 1) return next();
  res.status(503).json({
    message:
      'Database is not ready yet. Wait a few seconds and retry. If this never clears, set MONGODB_URI=in-memory in backend/.env for local dev or fix your MongoDB URI / network.',
  });
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/message', messageRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/call', callRoutes);
app.use('/api/upload', uploadRoutes);

// Basic health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

export default app;
