import { Suspense } from 'react';
import type { Metadata } from 'next';
import LotteryTrend from '@/components/number-lab/LotteryTrend';

export const metadata: Metadata = {
  title: '历史开奖走势 · 随机实验室',
  description: '双色球与大乐透历史开奖号码、遗漏期数与分区统计。',
};

export default function LotteryHistoryPage() {
  return <Suspense fallback={<div className="page-shell" role="status">正在加载历史开奖走势…</div>}><LotteryTrend /></Suspense>;
}
