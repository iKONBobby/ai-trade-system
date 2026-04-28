export default function NewsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] py-24">
        <svg className="mb-5 h-16 w-16 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
        <h1 className="text-xl font-semibold mb-2">财经资讯</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          实时财经新闻与 AI 摘要功能即将上线
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {['实时快讯', 'AI摘要', '情绪分析', '行业动态', '公告解读', '热点追踪'].map((tag) => (
            <span key={tag} className="px-3 py-1 rounded-full text-xs bg-[var(--color-bg-card-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
