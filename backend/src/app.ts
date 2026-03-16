import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';

import userRoutes from './routes/user.routes';
import chatRoutes from './routes/chat.routes';
import messageRoutes from './routes/message.routes';
import statusRoutes from './routes/status.routes';
import callRoutes from './routes/call.routes';
import uploadRoutes from './routes/upload.routes';
import { rateLimiter } from './middlewares/rateLimit.middleware';

dotenv.config();

const app: Application = express();

// Allow multiple comma-separated origins e.g. "https://app.com,https://admin.app.com"
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "img-src": ["'self'", "data:", "blob:", process.env.CDN_URL || process.env.CLIENT_URL || "http://localhost:5000"],
      "media-src": ["'self'", "data:", "blob:", process.env.CDN_URL || process.env.CLIENT_URL || "http://localhost:5000"],
      "connect-src": ["'self'", process.env.CLIENT_URL || "http://localhost:3000", process.env.SOCKET_URL || "http://localhost:5000", process.env.API_URL || "http://localhost:5000"],
    }
  }
}));
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin or server-to-server requests with no Origin header
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(rateLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

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
