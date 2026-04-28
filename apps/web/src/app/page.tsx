import Link from 'next/link';

const features = [
  {
    href: '/trade',
    title: '智能交易',
    desc: '输入股票代码，AI 分析行情，自动生成破冰号最优交易配置文件',
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    color: 'text-[var(--color-accent)]',
    bg: 'bg-[var(--color-accent)]/5',
    border: 'border-[var(--color-accent)]/20',
    available: true,
  },
  {
    href: '/analysis',
    title: '技术分析',
    desc: '多维度技术指标分析：布林带、MACD、RSI、均线系统、成交量分析',
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    color: 'text-blue-400',
    bg: 'bg-blue-400/5',
    border: 'border-blue-400/20',
    available: false,
  },
  {
    href: '/screener',
    title: '智能选股',
    desc: '多因子模型筛选：基本面 + 技术面 + 资金面，AI 评分排名',
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    color: 'text-purple-400',
    bg: 'bg-purple-400/5',
    border: 'border-purple-400/20',
    available: false,
  },
  {
    href: '/news',
    title: '财经资讯',
    desc: '实时财经新闻聚合，AI 摘要关键信息，市场情绪分析',
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
    color: 'text-amber-400',
    bg: 'bg-amber-400/5',
    border: 'border-amber-400/20',
    available: false,
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold">
          <span className="text-[var(--color-accent)]">AI</span> 交易系统
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)] max-w-lg">
          基于规则引擎与 AI 的 A 股智能交易辅助平台。分析行情、生成策略、辅助决策。
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className={`group relative rounded-xl border ${f.border} ${f.bg} p-5 transition-all hover:scale-[1.02] ${
              f.available
                ? 'cursor-pointer hover:shadow-lg hover:shadow-[var(--color-accent)]/5'
                : 'cursor-default'
            }`}
          >
            {!f.available && (
              <span className="absolute top-3 right-4 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-bg-card-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                即将推出
              </span>
            )}
            <div className={`mb-3 ${f.color}`}>{f.icon}</div>
            <h2 className="text-sm font-semibold mb-1.5">
              {f.title}
              {!f.available && (
                <span className="ml-2 text-[10px] text-[var(--color-text-secondary)] font-normal">
                  开发中
                </span>
              )}
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{f.desc}</p>
          </Link>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="mt-10 grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-4 text-center">
          <div className="text-2xl font-bold text-[var(--color-accent)]">1</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-1">已上线功能</div>
        </div>
        <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-4 text-center">
          <div className="text-2xl font-bold text-[var(--color-text-secondary)]">3</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-1">开发中功能</div>
        </div>
        <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-4 text-center">
          <div className="text-2xl font-bold text-[var(--color-text-secondary)]">v1.0</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-1">当前版本</div>
        </div>
      </div>
    </div>
  );
}
