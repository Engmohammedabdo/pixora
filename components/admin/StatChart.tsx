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

const COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#f43f5e', '#8b5cf6', '#10b981', '#ec4899', '#14b8a6', '#f97316'];

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

export default function StatChart({
  title,
  type,
  data,
  dataKeys = ['count'],
  xAxisKey = 'date',
  colors = COLORS,
  loading,
  height = 300,
}: StatChartProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 h-5 w-40 animate-pulse rounded bg-slate-100" />
        <div className="animate-pulse rounded bg-slate-50" style={{ height }} />
      </div>
    );
  }

  const formatDate = (value: string) => {
    if (!value || value.length !== 10) return value;
    return value.slice(5); // MM-DD
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        {type === 'bar' ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xAxisKey} tickFormatter={formatDate} tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
            <Tooltip />
            {dataKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        ) : type === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xAxisKey} tickFormatter={formatDate} tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
            <Tooltip />
            {dataKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        ) : type === 'stacked-bar' ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xAxisKey} tickFormatter={formatDate} tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
            <Tooltip />
            <Legend />
            {dataKeys.map((key, i) => (
              <Bar key={key} dataKey={key} stackId="a" fill={colors[i % colors.length]} />
            ))}
          </BarChart>
        ) : (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {data.map((_, i) => (
                <Cell key={`cell-${i}`} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
