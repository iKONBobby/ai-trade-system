import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export type IconName =
  | 'home'
  | 'trade'
  | 'chart'
  | 'search'
  | 'news'
  | 'refresh'
  | 'settings'
  | 'star'
  | 'arrow-up-right'
  | 'chevron-right'
  | 'clock'
  | 'download'
  | 'upload'
  | 'check'
  | 'spark'
  | 'shield'
  | 'nodes';

const ICON_PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6" />,
  trade: <path d="M4 17.5 9 12l3.5 3.5L20 8M15 8h5v5" />,
  chart: <path d="M4 19V5m0 14h16M8 16v-3m4 3V8m4 8v-6" />,
  search: <path d="m20 20-4.5-4.5M10.8 17a6.2 6.2 0 1 1 0-12.4 6.2 6.2 0 0 1 0 12.4Z" />,
  news: <path d="M5 4.5h12a2 2 0 0 1 2 2V19H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2ZM7 8h8M7 11h8M7 14h5" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.8-3.9L3 10m0 0V5m0 5h5M4 13a8 8 0 0 0 14.8 3.9L21 14m0 0v5m0-5h-5" />,
  settings: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM4.5 12a7.5 7.5 0 0 1 .1-1.2l-1.8-1.4 2-3.4 2.1.9a7.5 7.5 0 0 1 2-1.2L9.2 3h5.6l.3 2.7a7.5 7.5 0 0 1 2 1.2l2.1-.9 2 3.4-1.8 1.4a7.5 7.5 0 0 1 0 2.4l1.8 1.4-2 3.4-2.1-.9a7.5 7.5 0 0 1-2 1.2l-.3 2.7H9.2l-.3-2.7a7.5 7.5 0 0 1-2-1.2l-2.1.9-2-3.4 1.8-1.4A7.5 7.5 0 0 1 4.5 12Z" />,
  star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  'arrow-up-right': <path d="M5 19 19 5M8 5h11v11" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  clock: <path d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  download: <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />,
  upload: <path d="M12 20V10m0 0-4 4m4-4 4 4M5 5h14" />,
  check: <path d="m5 12 4.2 4L19 6.5" />,
  spark: <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3ZM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM5 14l.9 2.6 2.6.9-2.6.9L5 21l-.9-2.6-2.6-.9 2.6-.9L5 14Z" />,
  shield: <path d="M12 3 4.5 6v5.5c0 4.4 3 7.8 7.5 9.5 4.5-1.7 7.5-5.1 7.5-9.5V6L12 3Zm-3 9 2 2 4-4" />,
  nodes: <path d="M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 3a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 1a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7.8 6.2l8.4 1.6M7 8.7v6.6m2-7.1 6.5 8.2" />,
};

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={`ui-icon ${className}`} fill="none" height={size} viewBox="0 0 24 24" width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}>
      {ICON_PATHS[name]}
    </svg>
  );
}

export function Button({ variant = 'secondary', size = 'md', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  return <button className={`ui-button ui-button--${variant} ui-button--${size} ${className}`} {...props}>{children}</button>;
}

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={`ui-icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
}

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'info'; children: ReactNode; className?: string }) {
  return <span className={`ui-badge ui-badge--${tone} ${className}`}>{children}</span>;
}

export function Surface({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-surface ${className}`} {...props}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="ui-page-header"><div>{eyebrow && <div className="ui-eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="ui-page-header__actions">{actions}</div>}</header>;
}

export function EmptyState({ label, title, description, action }: { label?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="ui-empty-state">{label && <div className="ui-empty-state__label">{label}</div>}<h2>{title}</h2>{description && <p>{description}</p>}{action && <div className="ui-empty-state__action">{action}</div>}</div>;
}

export function Metric({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail?: string; tone?: 'neutral' | 'positive' | 'negative' }) {
  return <div className="ui-metric"><span className="ui-metric__label">{label}</span><strong className={`ui-metric__value ui-metric__value--${tone} num`}>{value}</strong>{detail && <span className="ui-metric__detail">{detail}</span>}</div>;
}
