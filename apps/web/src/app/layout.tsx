import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

const themeScript = `
  (() => {
    try {
      const saved = localStorage.getItem('trade-workspace-theme');
      const mode = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
      const resolved = mode === 'system'
        ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : mode;
      const root = document.documentElement;
      root.dataset.themeMode = mode;
      root.dataset.theme = resolved;
      root.style.colorScheme = resolved;
    } catch (_) {}
  })();
`;

export const metadata: Metadata = {
  title: 'AI 交易系统',
  description: '智能分析股票行情，生成最优交易配置',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased" style={{ background: 'var(--surface-base)', color: 'var(--text-1)' }}>
        <a className="skip-link" href="#main-content">跳转到主要内容</a>
        <Sidebar />
        <main id="main-content" className="app-main">
          {children}
        </main>
      </body>
    </html>
  );
}
