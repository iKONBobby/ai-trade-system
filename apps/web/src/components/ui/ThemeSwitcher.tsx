'use client';

import { useEffect, useState } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'trade-workspace-theme';
const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export default function ThemeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial: ThemeMode = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    setMode(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    if (mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncWithSystem = () => applyTheme('system');
    media.addEventListener('change', syncWithSystem);
    return () => media.removeEventListener('change', syncWithSystem);
  }, [mode]);

  const selectTheme = (next: ThemeMode) => {
    setMode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <div className="theme-switcher" aria-label="界面颜色" role="group">
      <span className="theme-switcher__label">主题</span>
      <div className="theme-switcher__options">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="theme-switcher__option"
            aria-pressed={mode === option.value}
            onClick={() => selectTheme(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
