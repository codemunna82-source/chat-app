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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const app_1 = __importDefault(require("../app"));
const registerUser = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield (0, supertest_1.default)(app_1.default).post('/api/users').send(payload);
    (0, vitest_1.expect)(res.status).toBe(201);
    (0, vitest_1.expect)(res.body).toHaveProperty('token');
    return res.body;
});
(0, vitest_1.describe)('Auth + Users', () => {
    (0, vitest_1.it)('registers and logs in a user', () => __awaiter(void 0, void 0, void 0, function* () {
        const email = 'alice@example.com';
        const password = 'Password123!';
        const registerRes = yield (0, supertest_1.default)(app_1.default).post('/api/users').send({
            name: 'Alice',
            email,
            password,
        });
        (0, vitest_1.expect)(registerRes.status).toBe(201);
        (0, vitest_1.expect)(registerRes.body).toHaveProperty('token');
        const loginRes = yield (0, supertest_1.default)(app_1.default).post('/api/users/login').send({
            email,
            password,
        });
        (0, vitest_1.expect)(loginRes.status).toBe(200);
        (0, vitest_1.expect)(loginRes.body).toHaveProperty('token');
    }));
    (0, vitest_1.it)('returns users list excluding the requester', () => __awaiter(void 0, void 0, void 0, function* () {
        const alice = yield registerUser({
            name: 'Alice',
            email: 'alice2@example.com',
            password: 'Password123!'
        });
        yield registerUser({
            name: 'Bob',
            email: 'bob2@example.com',
            password: 'Password123!'
        });
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/users')
            .set('Authorization', `Bearer ${alice.token}`);
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(res.body)).toBe(true);
        const ids = res.body.map((u) => u._id);
        (0, vitest_1.expect)(ids).not.toContain(alice._id);
    }));
});
(0, vitest_1.describe)('Chats + Messages + Calls', () => {
    (0, vitest_1.it)('creates a chat, sends a message, reacts, deletes, and logs a call', () => __awaiter(void 0, void 0, void 0, function* () {
        const alice = yield registerUser({
            name: 'Alice',
            email: 'alice3@example.com',
            password: 'Password123!'
        });
        const bob = yield registerUser({
            name: 'Bob',
            email: 'bob3@example.com',
            password: 'Password123!'
        });
        const chatRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/chat')
            .set('Authorization', `Bearer ${alice.token}`)
            .send({ userId: bob._id });
        (0, vitest_1.expect)(chatRes.status).toBe(200);
        (0, vitest_1.expect)(chatRes.body).toHaveProperty('_id');
        const chatId = chatRes.body._id;
        const fetchChatsRes = yield (0, supertest_1.default)(app_1.default)
            .get('/api/chat')
            .set('Authorization', `Bearer ${alice.token}`);
        (0, vitest_1.expect)(fetchChatsRes.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(fetchChatsRes.body)).toBe(true);
        const sendMessageRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/message')
            .set('Authorization', `Bearer ${alice.token}`)
            .send({ content: 'Hello Bob', chatId });
        (0, vitest_1.expect)(sendMessageRes.status).toBe(200);
        (0, vitest_1.expect)(sendMessageRes.body.content).toBe('Hello Bob');
        const messageId = sendMessageRes.body._id;
        const listMessagesRes = yield (0, supertest_1.default)(app_1.default)
            .get(`/api/message/${chatId}`)
            .set('Authorization', `Bearer ${alice.token}`);
        (0, vitest_1.expect)(listMessagesRes.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(listMessagesRes.body.items)).toBe(true);
        const reactRes = yield (0, supertest_1.default)(app_1.default)
            .put(`/api/message/${messageId}/react`)
            .set('Authorization', `Bearer ${alice.token}`)
            .send({ emoji: '??' });
        (0, vitest_1.expect)(reactRes.status).toBe(200);
        const deleteRes = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/message/${messageId}`)
            .set('Authorization', `Bearer ${alice.token}`);
        (0, vitest_1.expect)(deleteRes.status).toBe(200);
        const readRes = yield (0, supertest_1.default)(app_1.default)
            .put(`/api/chat/${chatId}/read`)
            .set('Authorization', `Bearer ${bob.token}`);
        (0, vitest_1.expect)(readRes.status).toBe(200);
        const callRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/call')
            .set('Authorization', `Bearer ${alice.token}`)
            .send({ receiverId: bob._id, status: 'missed', callType: 'audio', duration: 0 });
        (0, vitest_1.expect)(callRes.status).toBe(200);
        const historyRes = yield (0, supertest_1.default)(app_1.default)
            .get('/api/call')
            .set('Authorization', `Bearer ${alice.token}`);
        (0, vitest_1.expect)(historyRes.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(historyRes.body)).toBe(true);
        (0, vitest_1.expect)(historyRes.body.length).toBe(1);
    }));
});
