import AnalysisWorkspace from '@/components/analysis/AnalysisWorkspace';
import { PageHeader } from '@/components/ui/primitives';

export default function AnalysisPage() {
  return (
    <div className="page-shell page-shell--wide">
      <PageHeader eyebrow="Research / 02" title="技术分析" description="在同一时间轴上核对趋势、动量、量能与风险，并明确每个判断的失效条件。" />
      <AnalysisWorkspace />
    </div>
  );
}
