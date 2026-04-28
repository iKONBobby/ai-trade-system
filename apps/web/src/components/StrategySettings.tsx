'use client';

interface StrategySettingsProps {
  mode: 'auto' | 'grid' | 'condition';
  onModeChange: (mode: 'auto' | 'grid' | 'condition') => void;
  capital: string;
  onCapitalChange: (val: string) => void;
  isT0: boolean;
  onT0Change: (val: boolean) => void;
  useAI: boolean;
  onAIChange: (val: boolean) => void;
}

const modes = [
  { value: 'auto' as const, label: '智能推荐' },
  { value: 'grid' as const, label: '网格交易' },
  { value: 'condition' as const, label: '条件单' },
];

export default function StrategySettings({
  mode,
  onModeChange,
  capital,
  onCapitalChange,
  isT0,
  onT0Change,
  useAI,
  onAIChange,
}: StrategySettingsProps) {
  const handleCapitalInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    onCapitalChange(val);
  };

  return (
    <div className="space-y-5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
      {/* Strategy Mode */}
      <div>
        <label className="mb-2 block text-sm text-[var(--color-text-secondary)]">策略模式</label>
        <div className="flex gap-1 rounded-lg bg-[var(--color-bg-primary)] p-1">
          {modes.map((m) => (
            <button
              key={m.value}
              onClick={() => onModeChange(m.value)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === m.value
                  ? 'bg-[var(--color-accent)] text-black'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Total Capital */}
      <div>
        <label className="mb-2 block text-sm text-[var(--color-text-secondary)]">总资金（元）</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="100000"
          value={capital}
          onChange={handleCapitalInput}
          className="w-full rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-4 py-2.5 text-base text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] outline-none transition-colors focus:border-[var(--color-accent)]"
        />
      </div>

      {/* Toggle Switches */}
      <div className="space-y-4">
        <ToggleSwitch label="T0 模式（半仓底仓）" checked={isT0} onChange={onT0Change} />
        <ToggleSwitch label="AI 优化" checked={useAI} onChange={onAIChange} />
      </div>
    </div>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 translate-y-0 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}
