import Link from 'next/link';
import { Badge, Icon, Metric, PageHeader, Surface } from '@/components/ui/primitives';

const modules = [
  { href: '/trade', index: '01', icon: 'trade' as const, title: '策略执行', description: '输入股票代码，查看行情、指标与可复盘的交易配置。', status: '可用', tone: 'positive' as const },
  { href: '/analysis', index: '02', icon: 'chart' as const, title: '技术分析', description: '把趋势、动量、波动和成交量放到同一张分析桌上。', status: '准备中', tone: 'neutral' as const },
  { href: '/screener', index: '03', icon: 'search' as const, title: '市场筛选', description: '用规则筛出候选股，保留每一次扫描的结果和变化。', status: '准备中', tone: 'neutral' as const },
  { href: '/news', index: '04', icon: 'news' as const, title: '资讯流', description: '聚合影响市场的新闻与公告，按上下文快速浏览。', status: '准备中', tone: 'neutral' as const },
  { href: '/number-lab', index: '05', icon: 'spark' as const, title: '随机实验室', description: '用可解释过滤与安全随机源运行三因子数字实验。', status: '可用', tone: 'positive' as const },
];

export default function Home() {
  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="Market workspace / 01"
        title="交易工作台"
        description="用行情、规则和记录，建立一条可以回看的决策链。"
        actions={<Link href="/trade" className="ui-button ui-button--primary ui-button--lg">开始分析 <Icon name="arrow-up-right" size={16} /></Link>}
      />

      <section className="home-grid" aria-label="工作台概览">
        <Surface className="home-intro">
          <div className="section-label">Today’s board</div>
          <div className="home-intro__title">把复杂的市场信息，整理成下一步。</div>
          <p>这里不是预测面板。先看事实，再看规则，最后决定是否行动。</p>
          <div className="home-intro__rule" />
          <div className="home-intro__meta"><span>数据状态</span><span className="home-live"><i /> API 在线</span></div>
        </Surface>

        <Surface className="home-metrics">
          <div className="section-label">Workspace status</div>
          <div className="home-metrics__row">
            <Metric label="已上线模块" value="01" detail="策略执行" tone="positive" />
            <Metric label="观察维度" value="03" detail="价 / 量 / 规则" />
            <Metric label="版本" value="1.0" detail="稳定版" />
          </div>
        </Surface>
      </section>

      <section className="home-modules" aria-labelledby="module-title">
        <div className="home-section-heading">
          <div><div className="section-label">Modules</div><h2 id="module-title">工作区</h2></div>
          <span>按需进入，不强行聚合</span>
        </div>
        <div className="home-module-list">
          {modules.map((module) => (
            <Link key={module.href} href={module.href} className={`home-module ${module.tone === 'neutral' ? 'home-module--disabled' : ''}`}>
              <span className="home-module__index num">{module.index}</span>
              <span className="home-module__icon"><Icon name={module.icon} size={19} /></span>
              <span className="home-module__body"><strong>{module.title}</strong><span>{module.description}</span></span>
              <Badge tone={module.tone}>{module.status}</Badge>
              <Icon name="chevron-right" size={17} className="home-module__arrow" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
