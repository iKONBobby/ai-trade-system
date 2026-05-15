import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FeedbackWriter, DuplicateFeedbackError } from '../feedback-writer.js';
import type { FeedbackEntry } from '../feedback-writer.js';

function mkEntry(overrides: Partial<FeedbackEntry> = {}): FeedbackEntry {
  return {
    runId: 'swr_test_1',
    timestamp: '2026-05-14T10:00:00.000Z',
    stockCode: '600519',
    verdict: 'buy',
    decision: 'accept',
    ...overrides,
  };
}

describe('FeedbackWriter', () => {
  let dir: string;
  let writer: FeedbackWriter;
  let path: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'feedback-'));
    path = join(dir, 'user-feedback.jsonl');
    writer = new FeedbackWriter(path);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('record 写一行 jsonl', async () => {
    await writer.record(mkEntry());
    const content = await fs.readFile(path, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({
      runId: 'swr_test_1',
      stockCode: '600519',
      verdict: 'buy',
      decision: 'accept',
    });
  });

  it('多次 record 不同 runId 都 append', async () => {
    await writer.record(mkEntry({ runId: 'r1' }));
    await writer.record(mkEntry({ runId: 'r2', decision: 'reject' }));
    await writer.record(mkEntry({ runId: 'r3', decision: 'modify', modifiedPositionPct: 20 }));
    const content = await fs.readFile(path, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[2]).modifiedPositionPct).toBe(20);
  });

  it('同 runId 重复 record 抛 DuplicateFeedbackError', async () => {
    await writer.record(mkEntry({ runId: 'r1' }));
    await expect(writer.record(mkEntry({ runId: 'r1' }))).rejects.toThrow(
      DuplicateFeedbackError,
    );
    await expect(writer.record(mkEntry({ runId: 'r1', decision: 'reject' }))).rejects.toThrow(
      /already recorded/,
    );
    // duplicate 不写入
    const content = await fs.readFile(path, 'utf8');
    expect(content.trim().split('\n')).toHaveLength(1);
  });

  it('has() 反映 dedup 状态', async () => {
    expect(writer.has('r1')).toBe(false);
    await writer.record(mkEntry({ runId: 'r1' }));
    expect(writer.has('r1')).toBe(true);
    expect(writer.has('r2')).toBe(false);
  });

  it('文件目录不存在时自动创建', async () => {
    const deep = new FeedbackWriter(join(dir, 'a', 'b', 'feedback.jsonl'));
    await deep.record(mkEntry());
    const exists = await fs
      .access(join(dir, 'a', 'b', 'feedback.jsonl'))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it('行 > 3.5KB 抛错 (POSIX atomic 边界)', async () => {
    await expect(
      writer.record(
        mkEntry({ runId: 'big', stockCode: 'x'.repeat(4000) }),
      ),
    ).rejects.toThrow(/POSIX atomic/);
  });

  it('reset() 清 in-memory dedup (测试 hook)', async () => {
    await writer.record(mkEntry({ runId: 'r1' }));
    writer.reset();
    // reset 后允许同 runId 再次 record
    await writer.record(mkEntry({ runId: 'r1', decision: 'modify', modifiedPositionPct: 10 }));
    const content = await fs.readFile(path, 'utf8');
    expect(content.trim().split('\n')).toHaveLength(2);
  });

  it('并发 append 3 个不同 runId 全部成功 (POSIX 保证)', async () => {
    await Promise.all([
      writer.record(mkEntry({ runId: 'r1' })),
      writer.record(mkEntry({ runId: 'r2' })),
      writer.record(mkEntry({ runId: 'r3' })),
    ]);
    const content = await fs.readFile(path, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    // 每行都是合规 JSON (没有交织)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    const runIds = lines.map((l) => JSON.parse(l).runId).sort();
    expect(runIds).toEqual(['r1', 'r2', 'r3']);
  });
});
