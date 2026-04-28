export default function ScreenerPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] py-24">
        <svg className="mb-5 h-16 w-16 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <h1 className="text-xl font-semibold mb-2">智能选股</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          多因子模型选股功能即将上线
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {['基本面', '技术面', '资金面', 'AI评分', '行业筛选', '自定义因子'].map((tag) => (
            <span key={tag} className="px-3 py-1 rounded-full text-xs bg-[var(--color-bg-card-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
