import request from 'supertest';
import { describe, it, expect } from 'vitest';
import app from '../app';

describe('Health check', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });
});
