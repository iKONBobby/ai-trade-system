import type { Metadata } from 'next';
import NumberAgentWorkspace from '@/components/number-lab/NumberAgentWorkspace';

export const metadata: Metadata = {
  title: '随机实验室 · AI 交易系统',
  description: '使用可解释过滤与安全随机源进行数字生成实验。',
};

export default function NumberLabPage() {
  return <NumberAgentWorkspace />;
}

