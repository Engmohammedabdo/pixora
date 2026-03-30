'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import MetricCard from '@/components/admin/MetricCard';
import MRRChart from '@/components/admin/MRRChart';
import StatChart from '@/components/admin/StatChart';
import RetentionTable from '@/components/admin/RetentionTable';
import FunnelChart from '@/components/admin/FunnelChart';
import {
  TrendingUp,
  DollarSign,
  UserMinus,
  User,
  Crown,
  Activity,
} from 'lucide-react';

interface OverviewData {
  mrr: number;
  arr: number;
  mrrByPlan: Record<string, number>;
  totalUsers: number;
  payingUsers: number;
  freeUsers: number;
  arpu: number;
  ltv: number;
  dau: number;
  wau: number;
  mau: number;
  dauMauRatio: number;
  signupsThisMonth: number;
  signupsChange: number;
  activeUsersChange: number;
}

interface MRRData {
  currentMrr: number;
  mrrTrend: { month: string; mrr: number; newMrr: number; churnedMrr: number }[];
  mrrByPlan: Record<string, { count: number; mrr: number }>;
  growthRate: number;
}

interface ChurnData {
  currentChurnRate: number;
  churnTrend: { month: string; churnRate: number; churned: number; revenueChurned: number }[];
  totalChurned: number;
}

interface CohortData {
  cohort: string;
  totalUsers: number;
  months: { month: number; activeUsers: number; retentionRate: number }[];
}

interface FunnelStep {
  name: string;
  count: number;
  rate: number;
}

export default function AdminAnalyticsPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [mrr, setMrr] = useState<MRRData | null>(null);
  const [churn, setChurn] = useState<ChurnData | null>(null);
  const [retention, setRetention] = useState<CohortData[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [ovRes, mrrRes, churnRes, retRes, funRes] = await Promise.all([
        fetch('/api/admin/analytics/overview'),
        fetch('/api/admin/analytics/mrr?months=12'),
        fetch('/api/admin/analytics/churn?months=6'),
        fetch('/api/admin/analytics/retention?cohorts=6'),
        fetch('/api/admin/analytics/funnel?days=30'),
      ]);

      const [ovData, mrrData, churnData, retData, funData] = await Promise.all([
        ovRes.json(), mrrRes.json(), churnRes.json(), retRes.json(), funRes.json(),
      ]);

      if (ovData.success) setOverview(ovData.data);
      if (mrrData.success) setMrr(mrrData.data);
      if (churnData.success) setChurn(churnData.data);
      if (retData.success) setRetention(retData.data.cohorts);
      if (funData.success) setFunnel(funData.data.steps);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Churn trend for line chart
  const churnChartData = (churn?.churnTrend || []).map(t => ({
    date: t.month,
    churnRate: t.churnRate,
  }));

  // Revenue by plan for bar chart
  const revenueByPlanData = mrr?.mrrByPlan
    ? Object.entries(mrr.mrrByPlan).map(([plan, data]) => ({
        name: plan.charAt(0).toUpperCase() + plan.slice(1),
        revenue: data.mrr,
        subscribers: data.count,
      }))
    : [];

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-indigo-400" />
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
      </div>

      {/* Top Metrics — 6 cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          icon={<DollarSign className="h-4 w-4" />}
          label="MRR"
          value={overview?.mrr ?? 0}
          prefix="$"
          trend={mrr ? { value: mrr.growthRate, label: 'MoM' } : undefined}
          loading={loading}
        />
        <MetricCard
          icon={<DollarSign className="h-4 w-4" />}
          label="ARR"
          value={overview?.arr ?? 0}
          prefix="$"
          loading={loading}
        />
        <MetricCard
          icon={<UserMinus className="h-4 w-4" />}
          label="Churn Rate"
          value={churn?.currentChurnRate ?? 0}
          suffix="%"
          trend={churn?.currentChurnRate !== undefined ? { value: -churn.currentChurnRate } : undefined}
          loading={loading}
        />
        <MetricCard
          icon={<User className="h-4 w-4" />}
          label="ARPU"
          value={overview?.arpu ? overview.arpu.toFixed(2) : '0'}
          prefix="$"
          loading={loading}
        />
        <MetricCard
          icon={<Crown className="h-4 w-4" />}
          label="LTV"
          value={overview?.ltv ? overview.ltv.toFixed(0) : '0'}
          prefix="$"
          loading={loading}
        />
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="DAU / MAU"
          value={`${overview?.dau ?? 0} / ${overview?.mau ?? 0}`}
          trend={overview ? { value: overview.dauMauRatio, label: 'ratio' } : undefined}
          loading={loading}
        />
      </div>

      {/* Charts — 2x2 grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MRRChart
          data={mrr?.mrrTrend || []}
          loading={loading}
        />
        <StatChart
          title="Revenue by Plan"
          type="bar"
          data={revenueByPlanData}
          dataKeys={['revenue']}
          xAxisKey="name"
          loading={loading}
        />
        <FunnelChart
          steps={funnel}
          loading={loading}
        />
        <StatChart
          title="Churn Rate Trend"
          type="line"
          data={churnChartData}
          dataKeys={['churnRate']}
          xAxisKey="date"
          colors={['#f87171']}
          loading={loading}
        />
      </div>

      {/* Retention Table — Full width */}
      <div className="mt-6">
        <RetentionTable
          cohorts={retention}
          loading={loading}
        />
      </div>

      {/* Quick Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<User className="h-4 w-4" />}
          label="Total Users"
          value={overview?.totalUsers ?? 0}
          trend={overview ? { value: overview.signupsChange, label: 'vs last mo' } : undefined}
          loading={loading}
        />
        <MetricCard
          icon={<Crown className="h-4 w-4" />}
          label="Paying Users"
          value={overview?.payingUsers ?? 0}
          loading={loading}
        />
        <MetricCard
          icon={<User className="h-4 w-4" />}
          label="Free Users"
          value={overview?.freeUsers ?? 0}
          loading={loading}
        />
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="Signups This Month"
          value={overview?.signupsThisMonth ?? 0}
          trend={overview ? { value: overview.signupsChange, label: 'vs last mo' } : undefined}
          loading={loading}
        />
      </div>
    </AdminLayout>
  );
}
