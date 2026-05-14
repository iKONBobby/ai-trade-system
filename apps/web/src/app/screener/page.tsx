'use client';

import { Suspense, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import ScannerTab from '@/components/screener/ScannerTab';
import HistoryTab from '@/components/screener/HistoryTab';

type Tab = 'scan' | 'history';

function ScreenerInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = params.get('tab') === 'history' ? 'history' : 'scan';

  const setTab = useCallback(
    (next: Tab) => {
      const sp = new URLSearchParams(params.toString());
      if (next === 'scan') sp.delete('tab');
      else sp.set('tab', next);
      const q = sp.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <div className="mx-auto max-w-6xl px-6 pt-6 pb-10">
      <div className="mb-6 flex gap-1 border-b border-[var(--color-border)]">
        <TabBtn label="扫描" active={tab === 'scan'} onClick={() => setTab('scan')} icon={ICON_SCAN} />
        <TabBtn label="历史" active={tab === 'history'} onClick={() => setTab('history')} icon={ICON_CLOCK} />
      </div>
      {tab === 'scan' ? <ScannerTab /> : <HistoryTab />}
    </div>
  );
}

function TabBtn({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors -mb-px ${
        active
          ? 'border-[var(--color-primary)] text-[var(--color-text-primary)]'
          : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

const ICON_SCAN = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);
const ICON_CLOCK = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export default function ScreenerPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[var(--color-text-secondary)]">加载中…</div>}>
      <ScreenerInner />
    </Suspense>
  );
}
