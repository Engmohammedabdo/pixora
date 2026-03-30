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

      {/* Costs */}
      <div className="mb-4 space-y-2">
        <p className="text-xs font-medium text-slate-500 uppercase">Credit Costs</p>
        {Object.entries(costs).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <label className="text-sm text-slate-600 capitalize">{key}:</label>
            <input
              type="number"
              min={0}
              value={value}
              onChange={(e) => {
                const newCosts = { ...costs, [key]: parseInt(e.target.value) || 0 };
                onCostChange(newCosts);
              }}
              className="w-20 rounded-md border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-indigo-500"
            />
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
