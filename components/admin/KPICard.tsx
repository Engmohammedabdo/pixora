'use client';

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  badge?: string;
  badgeColor?: 'green' | 'red' | 'blue' | 'yellow';
  loading?: boolean;
}

const badgeStyles: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
  yellow: 'bg-amber-100 text-amber-700',
};

export default function KPICard({ icon, label, value, badge, badgeColor = 'blue', loading }: KPICardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
        </div>
        <div className="mt-4 h-8 w-24 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-4 w-20 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          {icon}
        </div>
        {badge && (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyles[badgeColor]}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-slate-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <p className="mt-1 text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}
