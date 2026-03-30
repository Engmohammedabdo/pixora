'use client';

interface HealthCardProps {
  name: string;
  icon?: string;
  total: number;
  completed: number;
  failed: number;
  successRate: number;
  credits?: number;
  estimatedCost?: number;
  topError?: { message: string; count: number } | null;
  loading?: boolean;
}

function getStatusColor(rate: number): { dot: string; ring: string; bg: string } {
  if (rate >= 95) return { dot: 'bg-emerald-500', ring: 'ring-emerald-500/20', bg: 'from-emerald-500/10 to-green-500/5' };
  if (rate >= 80) return { dot: 'bg-amber-500', ring: 'ring-amber-500/20', bg: 'from-amber-500/10 to-yellow-500/5' };
  return { dot: 'bg-red-500', ring: 'ring-red-500/20', bg: 'from-red-500/10 to-rose-500/5' };
}

export default function HealthCard({
  name,
  icon,
  total,
  completed,
  failed,
  successRate,
  credits,
  estimatedCost,
  topError,
  loading,
}: HealthCardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="h-5 w-24 animate-pulse rounded bg-white/[0.04]" />
        <div className="mt-4 h-8 w-16 animate-pulse rounded bg-white/[0.04]" />
        <div className="mt-3 h-2 animate-pulse rounded-full bg-white/[0.04]" />
      </div>
    );
  }

  const status = getStatusColor(successRate);

  return (
    <div className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.04]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          <h3 className="text-sm font-semibold capitalize text-slate-200">{name}</h3>
        </div>
        <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ${status.ring}`}>
          <div className={`h-2 w-2 rounded-full ${status.dot} animate-pulse`} />
          <span className="text-xs font-bold text-white">{successRate}%</span>
        </div>
      </div>

      {/* Success rate bar */}
      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full ${status.dot} transition-all duration-700`}
            style={{ width: `${Math.min(successRate, 100)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-white">{total}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Total</p>
        </div>
        <div>
          <p className="text-lg font-bold text-emerald-400">{completed}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Success</p>
        </div>
        <div>
          <p className={`text-lg font-bold ${failed > 0 ? 'text-red-400' : 'text-slate-500'}`}>{failed}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Failed</p>
        </div>
      </div>

      {/* Extra info */}
      <div className="mt-3 space-y-1 border-t border-white/[0.04] pt-3">
        {credits !== undefined && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Credits consumed</span>
            <span className="text-slate-300">{credits.toLocaleString()}</span>
          </div>
        )}
        {estimatedCost !== undefined && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Est. API cost</span>
            <span className="text-slate-300">${estimatedCost.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Top error */}
      {topError && (
        <div className="mt-3 rounded-lg bg-red-500/5 px-3 py-2 ring-1 ring-red-500/10">
          <p className="truncate text-[10px] text-red-400" title={topError.message}>
            {topError.message} ({topError.count}x)
          </p>
        </div>
      )}
    </div>
  );
}
