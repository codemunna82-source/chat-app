"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
let memoryServer = null;
/**
 * Local dev: set `MONGODB_URI=in-memory` (or leave it unset in non-production) to use
 * mongodb-memory-server when you cannot reach Atlas (DNS/firewall timeouts).
 * Production must set a real `MONGODB_URI`.
 */
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        let uri = (_a = process.env.MONGODB_URI) === null || _a === void 0 ? void 0 : _a.trim();
        const isProd = process.env.NODE_ENV === 'production';
        const wantMemory = !uri ||
            /^in-?memory$/i.test(uri) ||
            /^memory$/i.test(uri);
        if (wantMemory) {
            if (isProd) {
                throw new Error('MONGODB_URI must be set to a real MongoDB URI in production (in-memory is disabled).');
            }
            const { MongoMemoryServer } = yield Promise.resolve().then(() => __importStar(require('mongodb-memory-server')));
            memoryServer = yield MongoMemoryServer.create();
            uri = memoryServer.getUri();
            // eslint-disable-next-line no-console
            console.warn('[db] Using ephemeral in-memory MongoDB. Data is lost when the server stops. For persistence set MONGODB_URI to Atlas or mongodb://127.0.0.1:27017/yourdb');
        }
        if (!uri) {
            throw new Error('MONGODB_URI is not defined');
        }
        yield mongoose_1.default.connect(uri, {
            serverSelectionTimeoutMS: 20000,
            socketTimeoutMS: 45000,
            // Helps some Windows / ISP setups where IPv6 DNS for SRV fails
            family: 4,
        });
        // eslint-disable-next-line no-console
        console.log('MongoDB connected successfully');
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('MongoDB connection error:', error);
        if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.error('[db] Local fix: set MONGODB_URI=in-memory in backend/.env (see .env.example), or run MongoDB locally and use mongodb://127.0.0.1:27017/chat-app');
        }
        process.exit(1);
    }
});
exports.default = connectDB;
