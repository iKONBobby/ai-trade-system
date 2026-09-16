'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './ui/primitives';
import ThemeSwitcher from './ui/ThemeSwitcher';

const navItems: { href: string; label: string; icon: IconName; hideOnMobile?: boolean }[] = [
  { href: '/', label: '首页', icon: 'home' },
  { href: '/trade', label: '策略执行', icon: 'trade' },
  { href: '/analysis', label: '技术分析', icon: 'chart' },
  { href: '/screener', label: '市场筛选', icon: 'search' },
  { href: '/news', label: '资讯流', icon: 'news', hideOnMobile: true },
  { href: '/number-lab', label: '随机实验', icon: 'spark' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="sidebar__brand">
        <div className="sidebar__mark">AT</div>
        <div className="sidebar__title">
          <strong>交易工作台</strong>
          <span>MARKET / 01</span>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="工作区">
        <div className="sidebar__label">Workspace</div>
        {navItems.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar__link ${item.hideOnMobile ? 'sidebar__link--mobile-hidden' : ''} ${isActive ? 'sidebar__link--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="sidebar__icon"><Icon name={item.icon} size={18} /></span>
              <span className="sidebar__text">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <ThemeSwitcher />

      <div className="sidebar__status">
        <span className="sidebar__status-dot" aria-hidden="true" />
        <span>服务在线</span>
        <span className="sidebar__status-version mono">v1.0</span>
      </div>
    </aside>
  );
}
