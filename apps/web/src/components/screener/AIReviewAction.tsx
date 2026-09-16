'use client';

interface AIReviewActionProps {
  status?: 'not_requested' | 'running' | 'done' | 'unavailable';
  reviewedAt?: string;
  loading: boolean;
  onReview: () => void;
}

export default function AIReviewAction({ status, reviewedAt, loading, onReview }: AIReviewActionProps) {
  if (status === 'done') {
    return (
      <div
        role="status"
        className="inline-flex min-h-11 items-center rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3 text-xs text-emerald-500"
      >
        AI 复核已记录{reviewedAt ? ` · ${new Date(reviewedAt).toLocaleString('zh-CN')}` : ''}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onReview}
      disabled={loading || status === 'running'}
      aria-busy={loading || status === 'running'}
      className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--accent-foreground)] transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {(loading || status === 'running') && (
        <svg aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-30" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {loading || status === 'running'
        ? 'AI 复核中…'
        : status === 'unavailable'
          ? '重试 AI 复核'
          : '补做 AI 复核'}
    </button>
  );
}
