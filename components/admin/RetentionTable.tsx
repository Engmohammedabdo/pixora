'use client';

interface CohortData {
  cohort: string;
  totalUsers: number;
  months: { month: number; activeUsers: number; retentionRate: number }[];
}

interface RetentionTableProps {
  cohorts: CohortData[];
  loading?: boolean;
}

function getRetentionColor(rate: number): string {
  if (rate >= 80) return 'bg-emerald-500/30 text-emerald-300';
  if (rate >= 60) return 'bg-emerald-500/20 text-emerald-400';
  if (rate >= 40) return 'bg-amber-500/20 text-amber-400';
  if (rate >= 20) return 'bg-orange-500/20 text-orange-400';
  if (rate > 0) return 'bg-red-500/20 text-red-400';
  return 'bg-white/[0.02] text-slate-600';
}

export default function RetentionTable({ cohorts, loading }: RetentionTableProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-4 h-5 w-48 animate-pulse rounded bg-white/[0.04]" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  // Find max months across all cohorts
  const maxMonths = Math.max(...cohorts.map(c => c.months.length), 1);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-white/[0.1]">
      <h3 className="mb-1 text-sm font-semibold text-slate-300">Retention Cohorts</h3>
      <p className="mb-4 text-xs text-slate-600">User retention by signup month (% with activity)</p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-slate-500">Cohort</th>
              <th className="px-3 py-2 text-center font-semibold uppercase tracking-wider text-slate-500">Users</th>
              {Array.from({ length: maxMonths }).map((_, i) => (
                <th key={i} className="px-3 py-2 text-center font-semibold uppercase tracking-wider text-slate-500">
                  {i === 0 ? 'Mo 0' : `Mo ${i}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => (
              <tr key={cohort.cohort} className="border-t border-white/[0.04]">
                <td className="px-3 py-2 font-medium text-slate-300">{cohort.cohort}</td>
                <td className="px-3 py-2 text-center text-slate-400">{cohort.totalUsers}</td>
                {Array.from({ length: maxMonths }).map((_, i) => {
                  const monthData = cohort.months.find(m => m.month === i);
                  if (!monthData) {
                    return <td key={i} className="px-3 py-2" />;
                  }
                  return (
                    <td key={i} className="px-1 py-1">
                      <div
                        className={`rounded-md px-2 py-1.5 text-center font-medium ${getRetentionColor(monthData.retentionRate)}`}
                        title={`${monthData.activeUsers} of ${cohort.totalUsers} users`}
                      >
                        {monthData.retentionRate.toFixed(0)}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {cohorts.length === 0 && (
              <tr>
                <td colSpan={maxMonths + 2} className="px-3 py-8 text-center text-slate-600">
                  No cohort data available yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
