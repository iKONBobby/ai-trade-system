// Feedback writer (C4): 用户对 swarm verdict 的采纳决策 → jsonl 沉淀.
//
// 文件: apps/server/data/user-feedback.jsonl
// 行格式: {"runId","timestamp","stockCode","verdict","decision","modifiedPositionPct?"}
//
// 并发安全: 行 < 4KB 时 POSIX fs.promises.appendFile 是原子 append (plan-eng-review D9 决策).
// Dedup: in-memory Set<runId> + 错误 409 — 单用户内存级, server 重启后丢失可接受.

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

export type FeedbackDecision = 'accept' | 'reject' | 'modify';

export interface FeedbackEntry {
  runId: string;
  timestamp: string; // ISO datetime
  stockCode: string;
  verdict: string;
  decision: FeedbackDecision;
  modifiedPositionPct?: number;
}

export class DuplicateFeedbackError extends Error {
  readonly runId: string;
  constructor(runId: string) {
    super(`feedback already recorded for runId ${runId}`);
    this.runId = runId;
    this.name = 'DuplicateFeedbackError';
  }
}

export class FeedbackWriter {
  private readonly seen = new Set<string>();

  constructor(private readonly filePath: string) {}

  /** Persist 一条 feedback. 抛 DuplicateFeedbackError 如果 runId 已有记录. */
  async record(entry: FeedbackEntry): Promise<void> {
    if (this.seen.has(entry.runId)) {
      throw new DuplicateFeedbackError(entry.runId);
    }

    const line = JSON.stringify(entry);
    // 4KB POSIX atomic append 保证 (设计文档 Risk 表).
    if (Buffer.byteLength(line, 'utf8') > 3500) {
      throw new Error(`feedback line 超 3.5KB, 违反 POSIX atomic append 保证: ${line.length} chars`);
    }

    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, line + '\n', 'utf8');
    this.seen.add(entry.runId);
  }

  /** 测试 / debug 用 — 检查 runId 是否已记录. */
  has(runId: string): boolean {
    return this.seen.has(runId);
  }

  /** 重置 in-memory dedup (测试用; 生产中不调用). */
  reset(): void {
    this.seen.clear();
  }
}

// 模块级单例 (默认路径). 应用启动时注入实际 dataDir.
const DEFAULT_DATA_DIR = join(process.cwd(), 'data');
export const feedbackWriter = new FeedbackWriter(
  join(DEFAULT_DATA_DIR, 'user-feedback.jsonl'),
);
