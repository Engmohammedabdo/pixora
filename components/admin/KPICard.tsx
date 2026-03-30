'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  badge?: string;
  badgeColor?: 'green' | 'red' | 'blue' | 'yellow';
  trend?: { value: number; label?: string };
  sparkline?: number[];
  loading?: boolean;
}

const badgeStyles: Record<string, string> = {
  green: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  red: 'bg-red-500/10 text-red-400 ring-red-500/20',
  blue: 'bg-indigo-500/10 text-indigo-400 ring-indigo-500/20',
  yellow: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
};

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const h = 24;
  const w = 60;
  const step = w / (data.length - 1);

  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');

  return (
    <svg width={w} height={h} className="opacity-40">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function KPICard({ icon, label, value, badge, badgeColor = 'blue', trend, sparkline, loading }: KPICardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex items-start justify-between">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-white/[0.04]" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-white/[0.04]" />
        </div>
        <div className="mt-4 h-8 w-24 animate-pulse rounded-lg bg-white/[0.04]" />
        <div className="mt-2 h-4 w-20 animate-pulse rounded bg-white/[0.04]" />
      </div>
    );
  }

  const trendColor = trend
    ? trend.value > 0 ? 'text-emerald-400' : trend.value < 0 ? 'text-red-400' : 'text-slate-500'
    : '';

  return (
    <div className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.04]">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
          {icon}
        </div>
        <div className="flex items-center gap-2">
          {sparkline && sparkline.length > 1 && (
            <div className="text-indigo-400">
              <MiniSparkline data={sparkline} />
            </div>
          )}
          {badge && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${badgeStyles[badgeColor]}`}>
              {badge}
            </span>
          )}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold tracking-tight text-white">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="text-[13px] text-slate-500">{label}</p>
          {trend && (
            <span className={`flex items-center gap-0.5 text-xs font-semibold ${trendColor}`}>
              {trend.value > 0 ? <TrendingUp className="h-3 w-3" /> : trend.value < 0 ? <TrendingDown className="h-3 w-3" /> : null}
              {trend.value > 0 ? '+' : ''}{trend.value.toFixed(1)}%
              {trend.label && <span className="ms-0.5 font-normal text-slate-600">{trend.label}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
