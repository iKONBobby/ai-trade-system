'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    href: '/',
    label: '首页',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="h-[18px] w-[18px] shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      </svg>
    ),
  },
  {
    href: '/trade',
    label: '智能交易',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="h-[18px] w-[18px] shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    href: '/analysis',
    label: '技术分析',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="h-[18px] w-[18px] shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    href: '/screener',
    label: '智能选股',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="h-[18px] w-[18px] shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    href: '/news',
    label: '财经资讯',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="h-[18px] w-[18px] shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen flex-col"
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--surface-1)',
        borderRight: '1px solid var(--border-1)',
      }}
    >
      {/* Logo (64px) */}
      <div
        className="flex shrink-0 items-center gap-3 px-5"
        style={{ height: 64, borderBottom: '1px solid var(--border-1)' }}
      >
        <div
          className="grid h-8 w-8 place-items-center font-bold"
          style={{
            background: 'var(--accent)',
            color: '#0a0b0d',
            borderRadius: 'var(--r-md)',
            fontFamily: 'var(--font-num)',
            fontSize: 13,
            letterSpacing: '-0.02em',
          }}
        >
          AI
        </div>
        <span className="font-semibold" style={{ fontSize: 14 }}>
          AI 交易系统
        </span>
      </div>

      {/* Nav section label */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" style={{ padding: 'var(--sp-3) var(--sp-2)' }}>
        <div
          style={{
            fontSize: 'var(--text-tiny)',
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: 'var(--sp-4) var(--sp-3) var(--sp-2)',
          }}
        >
          主功能
        </div>
        {navItems.map((item) => {
          const isExact = pathname === item.href;
          const isPrefix =
            item.href !== '/' &&
            pathname.startsWith(item.href + '/') &&
            !navItems.some(
              (other) =>
                other.href !== item.href &&
                other.href.startsWith(item.href + '/') &&
                (pathname === other.href || pathname.startsWith(other.href + '/')),
            );
          const isActive = isExact || isPrefix;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 text-sm transition-all"
              style={{
                padding: 'var(--sp-2) var(--sp-3)',
                borderRadius: 'var(--r-md)',
                color: isActive ? 'var(--text-1)' : 'var(--text-2)',
                background: isActive ? 'var(--accent-bg)' : 'transparent',
                fontSize: 'var(--text-body)',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--surface-2)';
                  e.currentTarget.style.color = 'var(--text-1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-2)';
                }
              }}
            >
              {isActive && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: -3,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 16,
                    background: 'var(--accent)',
                    borderRadius: 'var(--r-pill)',
                  }}
                />
              )}
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Status bar */}
      <div
        className="flex shrink-0 items-center gap-2"
        style={{
          padding: 'var(--sp-3) var(--sp-4)',
          borderTop: '1px solid var(--border-1)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-3)',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--success)',
            boxShadow: '0 0 8px var(--success)',
          }}
        />
        服务在线 · v1.0
      </div>
    </aside>
  );
}
