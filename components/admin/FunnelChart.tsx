'use client';

interface FunnelStep {
  name: string;
  count: number;
  rate: number;
}

interface FunnelChartProps {
  steps: FunnelStep[];
  loading?: boolean;
}

const stepColors = [
  { bg: 'bg-indigo-500/20', bar: 'bg-indigo-500', text: 'text-indigo-400' },
  { bg: 'bg-cyan-500/20', bar: 'bg-cyan-500', text: 'text-cyan-400' },
  { bg: 'bg-amber-500/20', bar: 'bg-amber-500', text: 'text-amber-400' },
  { bg: 'bg-emerald-500/20', bar: 'bg-emerald-500', text: 'text-emerald-400' },
];

export default function FunnelChart({ steps, loading }: FunnelChartProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-4 h-5 w-40 animate-pulse rounded bg-white/[0.04]" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  const maxCount = steps.length > 0 ? steps[0].count : 1;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-white/[0.1]">
      <h3 className="mb-1 text-sm font-semibold text-slate-300">Conversion Funnel</h3>
      <p className="mb-4 text-xs text-slate-600">User journey from signup to paid</p>

      <div className="space-y-3">
        {steps.map((step, i) => {
          const color = stepColors[i % stepColors.length];
          const barWidth = maxCount > 0 ? Math.max((step.count / maxCount) * 100, 4) : 4;
          const dropOff = i > 0 ? steps[i - 1].count - step.count : 0;
          const dropOffRate = i > 0 && steps[i - 1].count > 0
            ? ((dropOff / steps[i - 1].count) * 100).toFixed(0)
            : '0';

          return (
            <div key={step.name}>
              {/* Drop-off indicator */}
              {i > 0 && dropOff > 0 && (
                <div className="flex items-center gap-2 py-1 ps-4">
                  <div className="h-4 border-s border-dashed border-red-500/30" />
                  <span className="text-[10px] text-red-400/70">
                    -{dropOff} dropped ({dropOffRate}%)
                  </span>
                </div>
              )}

              <div className="relative rounded-xl overflow-hidden">
                {/* Background */}
                <div className={`absolute inset-0 ${color.bg}`} />

                {/* Bar */}
                <div
                  className={`absolute inset-y-0 start-0 ${color.bar} opacity-20 transition-all duration-700`}
                  style={{ width: `${barWidth}%` }}
                />

                {/* Content */}
                <div className="relative flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-200">{step.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">{step.count.toLocaleString()}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color.bg} ${color.text}`}>
                      {step.rate.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {steps.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-600">No funnel data available yet</p>
        )}
      </div>
    </div>
  );
}
