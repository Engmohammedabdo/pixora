'use client';

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const COLORS = ['#818cf8', '#22d3ee', '#fbbf24', '#f87171', '#a78bfa', '#34d399', '#f472b6', '#2dd4bf', '#fb923c'];

interface StatChartProps {
  title: string;
  type: 'bar' | 'line' | 'pie' | 'stacked-bar';
  data: Record<string, unknown>[];
  dataKeys?: string[];
  xAxisKey?: string;
  colors?: string[];
  loading?: boolean;
  height?: number;
}

const CustomTooltipStyle = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  padding: '10px 14px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  color: '#e2e8f0',
  fontSize: '12px',
};

export default function StatChart({
  title,
  type,
  data,
  dataKeys = ['count'],
  xAxisKey = 'date',
  colors = COLORS,
  loading,
  height = 280,
}: StatChartProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-4 h-5 w-40 animate-pulse rounded-lg bg-white/[0.04]" />
        <div className="animate-pulse rounded-xl bg-white/[0.02]" style={{ height }} />
      </div>
    );
  }

  const formatDate = (value: string) => {
    if (!value || value.length !== 10) return value;
    return value.slice(5);
  };

  const axisStyle = { fontSize: 11, fill: '#64748b' };
  const gridStyle = '#1e293b';

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-white/[0.1]">
      <h3 className="mb-4 text-sm font-semibold text-slate-300">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        {type === 'bar' ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStyle} vertical={false} />
            <XAxis dataKey={xAxisKey} tickFormatter={formatDate} tick={axisStyle} stroke="transparent" />
            <YAxis tick={axisStyle} stroke="transparent" allowDecimals={false} />
            <Tooltip contentStyle={CustomTooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            {dataKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[6, 6, 0, 0]} />
            ))}
          </BarChart>
        ) : type === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStyle} vertical={false} />
            <XAxis dataKey={xAxisKey} tickFormatter={formatDate} tick={axisStyle} stroke="transparent" />
            <YAxis tick={axisStyle} stroke="transparent" allowDecimals={false} />
            <Tooltip contentStyle={CustomTooltipStyle} />
            {dataKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2.5} dot={false} />
            ))}
          </LineChart>
        ) : type === 'stacked-bar' ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStyle} vertical={false} />
            <XAxis dataKey={xAxisKey} tickFormatter={formatDate} tick={axisStyle} stroke="transparent" />
            <YAxis tick={axisStyle} stroke="transparent" allowDecimals={false} />
            <Tooltip contentStyle={CustomTooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            {dataKeys.map((key, i) => (
              <Bar key={key} dataKey={key} stackId="a" fill={colors[i % colors.length]} radius={i === dataKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        ) : (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={105}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              strokeWidth={0}
              label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {data.map((_, i) => (
                <Cell key={`cell-${i}`} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={CustomTooltipStyle} />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
