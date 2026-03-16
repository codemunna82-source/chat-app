import request from 'supertest';
import { describe, it, expect } from 'vitest';
import app from '../app';

const registerUser = async (payload: { name: string; email: string; password: string }) => {
  const res = await request(app).post('/api/users').send(payload);
  expect(res.status).toBe(201);
  expect(res.body).toHaveProperty('token');
  return res.body as { _id: string; token: string; name: string; email: string };
};

describe('Auth + Users', () => {
  it('registers and logs in a user', async () => {
    const email = 'alice@example.com';
    const password = 'Password123!';

    const registerRes = await request(app).post('/api/users').send({
      name: 'Alice',
      email,
      password,
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body).toHaveProperty('token');

    const loginRes = await request(app).post('/api/users/login').send({
      email,
      password,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('token');
  });

  it('returns users list excluding the requester', async () => {
    const alice = await registerUser({
      name: 'Alice',
      email: 'alice2@example.com',
      password: 'Password123!'
    });
    await registerUser({
      name: 'Bob',
      email: 'bob2@example.com',
      password: 'Password123!'
    });

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((u: any) => u._id);
    expect(ids).not.toContain(alice._id);
  });
});

describe('Chats + Messages + Calls', () => {
  it('creates a chat, sends a message, reacts, deletes, and logs a call', async () => {
    const alice = await registerUser({
      name: 'Alice',
      email: 'alice3@example.com',
      password: 'Password123!'
    });
    const bob = await registerUser({
      name: 'Bob',
      email: 'bob3@example.com',
      password: 'Password123!'
    });

    const chatRes = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ userId: bob._id });

    expect(chatRes.status).toBe(200);
    expect(chatRes.body).toHaveProperty('_id');
    const chatId = chatRes.body._id;

    const fetchChatsRes = await request(app)
      .get('/api/chat')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(fetchChatsRes.status).toBe(200);
    expect(Array.isArray(fetchChatsRes.body)).toBe(true);

    const sendMessageRes = await request(app)
      .post('/api/message')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ content: 'Hello Bob', chatId });

    expect(sendMessageRes.status).toBe(200);
    expect(sendMessageRes.body.content).toBe('Hello Bob');
    const messageId = sendMessageRes.body._id;

    const listMessagesRes = await request(app)
      .get(`/api/message/${chatId}`)
      .set('Authorization', `Bearer ${alice.token}`);

    expect(listMessagesRes.status).toBe(200);
    expect(Array.isArray(listMessagesRes.body.items)).toBe(true);

    const reactRes = await request(app)
      .put(`/api/message/${messageId}/react`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ emoji: '??' });

    expect(reactRes.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/message/${messageId}`)
      .set('Authorization', `Bearer ${alice.token}`);

    expect(deleteRes.status).toBe(200);

    const readRes = await request(app)
      .put(`/api/chat/${chatId}/read`)
      .set('Authorization', `Bearer ${bob.token}`);

    expect(readRes.status).toBe(200);

    const callRes = await request(app)
      .post('/api/call')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ receiverId: bob._id, status: 'missed', callType: 'audio', duration: 0 });

    expect(callRes.status).toBe(200);

    const historyRes = await request(app)
      .get('/api/call')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(historyRes.status).toBe(200);
    expect(Array.isArray(historyRes.body)).toBe(true);
    expect(historyRes.body.length).toBe(1);
  });
});
