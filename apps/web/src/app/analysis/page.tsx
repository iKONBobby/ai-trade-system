export default function AnalysisPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] py-24">
        <svg className="mb-5 h-16 w-16 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h1 className="text-xl font-semibold mb-2">技术分析</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          多维度技术指标分析功能即将上线
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {['布林带', 'MACD', 'RSI', '均线系统', '成交量', 'K线形态'].map((tag) => (
            <span key={tag} className="px-3 py-1 rounded-full text-xs bg-[var(--color-bg-card-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
