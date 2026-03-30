'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface MRRChartProps {
  data: { month: string; mrr: number; newMrr: number; churnedMrr: number }[];
  loading?: boolean;
  height?: number;
}

const tooltipStyle = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  padding: '10px 14px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  color: '#e2e8f0',
  fontSize: '12px',
};

export default function MRRChart({ data, loading, height = 300 }: MRRChartProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-4 h-5 w-32 animate-pulse rounded bg-white/[0.04]" />
        <div className="animate-pulse rounded-xl bg-white/[0.02]" style={{ height }} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-white/[0.1]">
      <h3 className="mb-4 text-sm font-semibold text-slate-300">MRR Trend</h3>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: '#64748b' }}
            stroke="transparent"
            tickFormatter={(v) => v.slice(2)} // "26-01" format
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' }}
            stroke="transparent"
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
          <Area
            type="monotone"
            dataKey="mrr"
            stroke="#818cf8"
            strokeWidth={2.5}
            fill="url(#mrrGradient)"
            name="MRR"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
