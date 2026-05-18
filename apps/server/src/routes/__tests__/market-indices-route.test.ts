import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { apiRouter } from '../api.js';
import * as marketSvc from '../../services/market.js';

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/market/indices', () => {
  it('成功 → 200 + MarketIndex[]', async () => {
    vi.spyOn(marketSvc, 'fetchIndices').mockResolvedValue([
      { label: '上证指数', value: 3245.67, changePct: 0.83 },
      { label: '深证成指', value: 9856.12, changePct: 1.15 },
      { label: '创业板指', value: 1927.84, changePct: -0.21 },
    ]);
    const res = await request(app).get('/api/market/indices');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toEqual({ label: '上证指数', value: 3245.67, changePct: 0.83 });
  });

  it('UpstreamUnavailableError → 503', async () => {
    vi.spyOn(marketSvc, 'fetchIndices').mockRejectedValue(
      new marketSvc.UpstreamUnavailableError('timeout'),
    );
    const res = await request(app).get('/api/market/indices');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('其他异常 → 500', async () => {
    vi.spyOn(marketSvc, 'fetchIndices').mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/market/indices');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('SERVER_ERROR');
  });
});
