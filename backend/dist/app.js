"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const mongoose_1 = __importDefault(require("mongoose"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const chat_routes_1 = __importDefault(require("./routes/chat.routes"));
const message_routes_1 = __importDefault(require("./routes/message.routes"));
const status_routes_1 = __importDefault(require("./routes/status.routes"));
const call_routes_1 = __importDefault(require("./routes/call.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const rateLimit_middleware_1 = require("./middlewares/rateLimit.middleware");
dotenv_1.default.config();
const app = (0, express_1.default)();
// Allow multiple comma-separated origins from env e.g. CLIENT_URL="https://app.com,https://admin.app.com"
// Support both CLIENT_URL and legacy CLIENT_URI to avoid misnamed envs in hosting dashboards.
const rawClientUrls = process.env.CLIENT_URL || process.env.CLIENT_URI || 'http://localhost:3000';
const LOCAL_APP_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
];
const normalizeOrigin = (o) => o.replace(/\/$/, '');
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
function isPrivateNetworkOrigin(origin) {
    try {
        const { hostname, protocol } = new URL(origin);
        if (protocol !== 'http:' && protocol !== 'https:')
            return false;
        if (hostname === 'localhost' || hostname === '127.0.0.1')
            return true;
        if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname))
            return true;
        if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname))
            return true;
        if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname))
            return true;
        return false;
    }
    catch (_a) {
        return false;
    }
}
const splitEnvList = (value, fallback) => (value || fallback || '')
    .split(/[;,]/)
    .map(entry => entry.trim())
    .filter(Boolean);
const cdnSources = splitEnvList(process.env.CDN_URL);
const socketSources = splitEnvList(process.env.SOCKET_URL, 'http://localhost:5000');
const apiSources = splitEnvList(process.env.API_URL, 'http://localhost:5000');
// CORS must run before rate limit (so OPTIONS preflight is not throttled) and before Helmet
// so API responses always get CORS headers applied as expected.
app.use((0, cors_1.default)({
    credentials: true,
    optionsSuccessStatus: 204,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    origin: isProduction
        ? (origin, callback) => {
            if (!origin)
                return callback(null, true);
            const o = normalizeOrigin(origin);
            if (allowAnyOrigin || allowedOrigins.includes(o) || isPrivateNetworkOrigin(o)) {
                return callback(null, true);
            }
            console.warn('[CORS] Blocked origin (add to CLIENT_URL on server):', o);
            return callback(null, false);
        }
        : true,
}));
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            'img-src': ["'self'", 'data:', 'blob:', ...allowedOrigins, ...cdnSources],
            'media-src': ["'self'", 'data:', 'blob:', ...allowedOrigins, ...cdnSources],
            'connect-src': ["'self'", ...allowedOrigins, ...socketSources, ...apiSources],
        },
    },
}));
app.use((0, compression_1.default)());
app.use(rateLimit_middleware_1.rateLimiter);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Serve uploaded files statically
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../../uploads')));
// If the HTTP server is up before Mongo finishes connecting, return JSON instead of hanging / timing out oddly.
app.use((req, res, next) => {
    if (req.path === '/health')
        return next();
    if (!req.path.startsWith('/api'))
        return next();
    if (mongoose_1.default.connection.readyState === 1)
        return next();
    res.status(503).json({
        message: 'Database is not ready yet. Wait a few seconds and retry. If this never clears, set MONGODB_URI=in-memory in backend/.env for local dev or fix your MongoDB URI / network.',
    });
});
// Routes
app.use('/api/users', user_routes_1.default);
app.use('/api/chat', chat_routes_1.default);
app.use('/api/message', message_routes_1.default);
app.use('/api/status', status_routes_1.default);
app.use('/api/call', call_routes_1.default);
app.use('/api/upload', upload_routes_1.default);
// Basic health check route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Server is running' });
});
exports.default = app;
