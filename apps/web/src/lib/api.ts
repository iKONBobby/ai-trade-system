import type { AnalyzeRequest, AnalyzeResponse } from '@trade/shared';

const BASE = '/api';

export async function analyzeStock(params: AnalyzeRequest): Promise<AnalyzeResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
    }

    return res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请重试');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
