'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { SEGMENT_DEFINITIONS, type UserSegment } from '@/lib/admin/engagement';
import { Users, Loader2 } from 'lucide-react';

export default function AdminUserSegmentsPage() {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<UserSegment, number> | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users/segments');
      const data = await res.json();
      if (data.success) {
        setCounts(data.data.counts);
        setTotalUsers(data.data.totalUsers);
      }
    } catch (err) {
      console.error('Failed to fetch segments:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold text-white">User Segments</h1>
          <span className="text-sm text-slate-500">({totalUsers} total users)</span>
        </div>
        <button
          onClick={() => router.push('/admin/users')}
          className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          View All Users
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SEGMENT_DEFINITIONS.map((seg) => {
          const count = counts?.[seg.key] || 0;
          const pct = totalUsers > 0 ? ((count / totalUsers) * 100).toFixed(1) : '0';

          return (
            <button
              key={seg.key}
              onClick={() => router.push(`/admin/users?segment=${seg.key}`)}
              className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-left transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.04]`}
            >
              {/* Gradient background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${seg.color.split(' ')[0]} ${seg.color.split(' ')[1]} opacity-50`} />

              <div className="relative">
                <span className="text-2xl">{seg.icon}</span>
                <div className="mt-3">
                  <p className="text-3xl font-bold tracking-tight text-white">{count}</p>
                  <p className="mt-1 text-sm font-medium text-slate-400">{seg.label}</p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-current opacity-40 transition-all duration-500"
                      style={{ width: `${Math.min(parseFloat(pct), 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-500">{pct}%</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Summary insights */}
      <div className="mt-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-300">Segment Insights</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Engagement</p>
            <p className="mt-1 text-sm text-slate-300">
              <span className="font-bold text-emerald-400">{((counts?.power_user || 0) + (counts?.active || 0))}</span> highly engaged users
              ({totalUsers > 0 ? (((counts?.power_user || 0) + (counts?.active || 0)) / totalUsers * 100).toFixed(0) : 0}% of total)
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Attention Needed</p>
            <p className="mt-1 text-sm text-slate-300">
              <span className="font-bold text-rose-400">{(counts?.at_risk || 0) + (counts?.dormant || 0)}</span> users need attention
              (at-risk + dormant)
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Growth Potential</p>
            <p className="mt-1 text-sm text-slate-300">
              <span className="font-bold text-cyan-400">{counts?.free_only || 0}</span> free users eligible for conversion
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
