import { EmptyState, PageHeader } from '@/components/ui/primitives';

export default function NewsPage() {
  return (
    <div className="page-shell">
      <PageHeader eyebrow="Signals / 04" title="资讯流" description="按标的与市场上下文浏览新闻、公告和事件。" />
      <EmptyState label="Module in progress" title="资讯流正在接入" description="实时快讯、公告与市场情绪会在这里按时间线呈现。" />
    </div>
  );
}
