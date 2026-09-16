'use client';

import { Suspense, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as Tabs from '@radix-ui/react-tabs';
import HistoryTab from '@/components/screener/HistoryTab';
import ScannerTab from '@/components/screener/ScannerTab';

type ScreenerView = 'scan' | 'history';

function ScreenerInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view: ScreenerView = params.get('tab') === 'history' ? 'history' : 'scan';

  const setView = useCallback(
    (next: string) => {
      const updated = new URLSearchParams(params.toString());
      if (next === 'scan') updated.delete('tab');
      else updated.set('tab', next);
      const query = updated.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <div className="page-shell page-shell--wide">
      <Tabs.Root
        value={view}
        onValueChange={setView}
        orientation="horizontal"
      >
        <Tabs.List className="ui-tabs" aria-label="选股视图">
          <Tabs.Trigger className="ui-tabs__trigger" value="scan">
            {ICON_SCAN}
            <span>市场扫描</span>
          </Tabs.Trigger>
          <Tabs.Trigger className="ui-tabs__trigger" value="history">
            {ICON_CLOCK}
            <span>历史记录</span>
          </Tabs.Trigger>
          <span className="ui-tabs__hint">策略筛选与复盘</span>
        </Tabs.List>
        <Tabs.Content className="ui-tabs__content" value="scan">
          <ScannerTab />
        </Tabs.Content>
        <Tabs.Content className="ui-tabs__content" value="history">
          <HistoryTab />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

const ICON_SCAN = (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m20 20-4.5-4.5M10.8 17a6.2 6.2 0 1 1 0-12.4 6.2 6.2 0 0 1 0 12.4Z" />
  </svg>
);

const ICON_CLOCK = (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

export default function ScreenerPage() {
  return (
    <Suspense fallback={<div className="page-shell"><div className="ui-loading-panel">正在加载市场筛选…</div></div>}>
      <ScreenerInner />
    </Suspense>
  );
}
