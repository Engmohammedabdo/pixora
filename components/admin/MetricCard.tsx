'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  prefix?: string;
  suffix?: string;
  trend?: { value: number; label?: string };
  loading?: boolean;
}

export default function MetricCard({ icon, label, value, prefix, suffix, trend, loading }: MetricCardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-white/[0.04]" />
        <div className="mt-3 h-7 w-20 animate-pulse rounded bg-white/[0.04]" />
        <div className="mt-1.5 h-4 w-24 animate-pulse rounded bg-white/[0.04]" />
      </div>
    );
  }

  const trendColor = trend
    ? trend.value > 0 ? 'text-emerald-400' : trend.value < 0 ? 'text-red-400' : 'text-slate-500'
    : '';

  const TrendIcon = trend
    ? trend.value > 0 ? TrendingUp : trend.value < 0 ? TrendingDown : Minus
    : null;

  const formattedValue = typeof value === 'number'
    ? value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toLocaleString()
    : value;

  return (
    <div className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.04]">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/10 text-indigo-400">
        {icon}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold tracking-tight text-white">
          {prefix}{formattedValue}{suffix}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[13px] text-slate-500">{label}</span>
          {trend && TrendIcon && (
            <span className={`flex items-center gap-0.5 text-xs font-semibold ${trendColor}`}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trend.value).toFixed(1)}%
              {trend.label && <span className="font-normal text-slate-600 ms-0.5">{trend.label}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
