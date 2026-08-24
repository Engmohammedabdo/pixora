'use client';

interface StudioConfigCardProps {
  name: string;
  icon: string;
  enabled: boolean;
  costs: Record<string, number>;
  totalGenerations: number;
  todayGenerations: number;
  onToggle: (enabled: boolean) => void;
  onCostChange: (costs: Record<string, number>) => void;
}

export default function StudioConfigCard({
  name,
  icon,
  enabled,
  costs,
  totalGenerations,
  todayGenerations,
  onToggle,
  onCostChange,
}: StudioConfigCardProps) {
  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm transition-opacity ${enabled ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h3 className="font-semibold text-slate-900 capitalize">{name}</h3>
        </div>
        <button
          onClick={() => onToggle(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-indigo-600' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/*
        Credit costs are READ-ONLY here as of 2026-08-24.

        They used to be editable, and the override was dead in 7 of the 9 routes —
        so the knob's only real effect was to make two studios disagree with the
        published price list. components/pricing/StudioCostTable.tsx is a PUBLIC
        page that statically imports CREDIT_COSTS and tells visitors "these are the
        real per-action costs"; it cannot read a database override, so any override
        could only ever make that page lie with no correcting path.

        Prices now live in lib/credits/costs.ts and are changed by deploying.
      */}
      <div className="mb-4 space-y-2">
        <p className="text-xs font-medium text-slate-500 uppercase">
          Credit Costs <span className="normal-case font-normal">(set in lib/credits/costs.ts)</span>
        </p>
        {Object.entries(costs).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-600 capitalize">{key}:</span>
            <span className="w-20 rounded-md bg-slate-50 px-2 py-1 text-right text-sm tabular-nums text-slate-700">
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
        <div className="flex justify-between">
          <span>Total Generations</span>
          <span className="font-medium text-slate-700">{totalGenerations.toLocaleString()}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span>Today</span>
          <span className="font-medium text-slate-700">{todayGenerations}</span>
        </div>
      </div>
    </div>
  );
}
