'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

const presets = [
  { label: 'Today', days: 0 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

function getPresetDates(days: number): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  if (days === 0) return { from: to, to };
  const from = new Date(now.getTime() - days * 86400000).toISOString().split('T')[0];
  return { from, to };
}

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [showCustom, setShowCustom] = useState(false);

  function handlePreset(days: number) {
    const { from: f, to: t } = getPresetDates(days);
    onChange(f, t);
    setShowCustom(false);
  }

  function handleClear() {
    onChange('', '');
    setShowCustom(false);
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Presets */}
      <div className="flex rounded-xl bg-white/[0.04] p-0.5">
        {presets.map(p => {
          const preset = getPresetDates(p.days);
          const isActive = from === preset.from && to === preset.to;
          return (
            <button
              key={p.label}
              onClick={() => handlePreset(p.days)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? 'bg-indigo-500/20 text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
            showCustom || (from && !presets.some(p => getPresetDates(p.days).from === from))
              ? 'bg-indigo-500/20 text-indigo-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Calendar className="h-3 w-3" />
          Custom
        </button>
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={from}
            onChange={(e) => onChange(e.target.value, to)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-indigo-500/50"
          />
          <span className="text-xs text-slate-600">—</span>
          <input
            type="date"
            value={to}
            onChange={(e) => onChange(from, e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-indigo-500/50"
          />
        </div>
      )}

      {/* Clear */}
      {(from || to) && (
        <button
          onClick={handleClear}
          className="rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:text-slate-400"
        >
          Clear
        </button>
      )}
    </div>
  );
}
