import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { KLine } from '@trade/shared';
import { apiRouter } from '../api.js';
import * as marketSvc from '../../services/market.js';

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

const sampleKline: KLine = {
  date: '2026-05-11',
  open: 10,
  high: 10.5,
  low: 9.8,
  close: 10.2,
  volume: 1000,
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(marketSvc, 'fetchKLine');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/market/kline/:code — period whitelist + days validation', () => {
  it('defaults to period=daily when query omits period', async () => {
    fetchSpy.mockResolvedValue([sampleKline]);
    const res = await request(app).get('/api/market/kline/600519');
    expect(res.status).toBe(200);
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe('600519');
    expect((call[2] as any).period).toBe('daily');
  });

  it('passes period=5min through to fetchKLine', async () => {
    fetchSpy.mockResolvedValue([sampleKline]);
    await request(app).get('/api/market/kline/600519?period=5min');
    expect((fetchSpy.mock.calls[0][2] as any).period).toBe('5min');
  });

  it('passes period=weekly through to fetchKLine', async () => {
    fetchSpy.mockResolvedValue([sampleKline]);
    await request(app).get('/api/market/kline/600519?period=weekly');
    expect((fetchSpy.mock.calls[0][2] as any).period).toBe('weekly');
  });

  it('rejects unknown period with 400 INVALID_PERIOD', async () => {
    const res = await request(app).get('/api/market/kline/600519?period=garbage');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_PERIOD');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects days=0 with 400 INVALID_DAYS', async () => {
    const res = await request(app).get('/api/market/kline/600519?days=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_DAYS');
  });

  it('rejects days=1001 with 400 INVALID_DAYS', async () => {
    const res = await request(app).get('/api/market/kline/600519?days=1001');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_DAYS');
  });

  it('accepts boundary days=1000', async () => {
    fetchSpy.mockResolvedValue([sampleKline]);
    const res = await request(app).get('/api/market/kline/600519?days=1000');
    expect(res.status).toBe(200);
    expect(fetchSpy.mock.calls[0][1]).toBe(1000);
  });

  it('rejects code=abc123 with 400 INVALID_CODE', async () => {
    const res = await request(app).get('/api/market/kline/abc123');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_CODE');
  });
});

describe('GET /api/market/kline/:code — ENG-D1 empty-klines semantics (CRITICAL REGRESSION)', () => {
  it('returns 200 + [] when fetchKLine throws STOCK_NOT_FOUND for minute period (weekend 5min case)', async () => {
    fetchSpy.mockRejectedValue(new Error('STOCK_NOT_FOUND'));
    const res = await request(app).get('/api/market/kline/600519?period=5min');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 + [] when fetchKLine throws STOCK_NOT_FOUND for 15min', async () => {
    fetchSpy.mockRejectedValue(new Error('STOCK_NOT_FOUND'));
    const res = await request(app).get('/api/market/kline/600519?period=15min');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('still returns 404 STOCK_NOT_FOUND for daily period (truly missing stock)', async () => {
    fetchSpy.mockRejectedValue(new Error('STOCK_NOT_FOUND'));
    const res = await request(app).get('/api/market/kline/600519?period=daily');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('STOCK_NOT_FOUND');
  });

  it('still returns 404 STOCK_NOT_FOUND for weekly/monthly periods', async () => {
    fetchSpy.mockRejectedValue(new Error('STOCK_NOT_FOUND'));
    const weekRes = await request(app).get('/api/market/kline/600519?period=weekly');
    expect(weekRes.status).toBe(404);
    const monthRes = await request(app).get('/api/market/kline/600519?period=monthly');
    expect(monthRes.status).toBe(404);
  });
});

describe('GET /api/market/kline/:code — upstream errors', () => {
  it('returns 503 when UpstreamUnavailableError bubbles up', async () => {
    fetchSpy.mockRejectedValue(new marketSvc.UpstreamUnavailableError('test timeout'));
    const res = await request(app).get('/api/market/kline/600519');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('UPSTREAM_UNAVAILABLE');
  });
});
