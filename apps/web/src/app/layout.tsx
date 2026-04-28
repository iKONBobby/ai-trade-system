import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI交易系统',
  description: '智能分析股票行情，生成最优交易配置',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}
