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
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const chat_routes_1 = __importDefault(require("./routes/chat.routes"));
const message_routes_1 = __importDefault(require("./routes/message.routes"));
const status_routes_1 = __importDefault(require("./routes/status.routes"));
const call_routes_1 = __importDefault(require("./routes/call.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const rateLimit_middleware_1 = require("./middlewares/rateLimit.middleware");
dotenv_1.default.config();
const app = (0, express_1.default)();
// Middleware
app.use((0, helmet_1.default)({
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
app.use((0, compression_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(rateLimit_middleware_1.rateLimiter);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Serve uploaded files statically
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../../uploads')));
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
