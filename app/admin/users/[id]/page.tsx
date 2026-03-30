'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import UserDetailCard from '@/components/admin/UserDetailCard';
import CreditAdjustModal from '@/components/admin/CreditAdjustModal';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import DataTable, { Column } from '@/components/admin/DataTable';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  plan_id: string;
  credits_balance: number;
  purchased_credits: number;
  banned: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  stats?: {
    generations: number;
    transactions: number;
    brandKits: number;
    assets: number;
  };
}

type TabType = 'generations' | 'transactions' | 'brand_kits' | 'assets' | 'timeline';

interface TimelineEvent {
  id: string;
  type: string;
  icon: string;
  title: string;
  description: string;
  created_at: string;
}

interface EngagementData {
  total: number;
  label: string;
  breakdown: Record<string, number>;
}

const statusColors: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const generationColumns: Column<Record<string, unknown>>[] = [
  { key: 'studio', label: 'Studio', sortable: true },
  { key: 'model', label: 'Model', sortable: true },
  {
    key: 'status',
    label: 'Status',
    render: (row) => (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[row.status as string] || 'bg-slate-100 text-slate-700'}`}>
        {row.status as string}
      </span>
    ),
  },
  { key: 'credits_used', label: 'Credits', sortable: true },
  {
    key: 'created_at',
    label: 'Time',
    render: (row) => timeAgo(row.created_at as string),
  },
];

const transactionColumns: Column<Record<string, unknown>>[] = [
  {
    key: 'amount',
    label: 'Amount',
    sortable: true,
    render: (row) => {
      const amount = row.amount as number;
      return (
        <span className={`font-medium ${amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {amount > 0 ? '+' : ''}{amount}
        </span>
      );
    },
  },
  {
    key: 'type',
    label: 'Type',
    render: (row) => (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
        {row.type as string}
      </span>
    ),
  },
  { key: 'description', label: 'Description' },
  { key: 'balance_after', label: 'Balance After', sortable: true },
  {
    key: 'created_at',
    label: 'Time',
    render: (row) => timeAgo(row.created_at as string),
  },
];

const brandKitColumns: Column<Record<string, unknown>>[] = [
  { key: 'name', label: 'Name', sortable: true },
  {
    key: 'colors',
    label: 'Colors',
    render: (row) => {
      const colors = (row.colors as string[]) || [];
      return (
        <div className="flex gap-1">
          {colors.slice(0, 5).map((c, i) => (
            <div key={i} className="h-5 w-5 rounded border border-slate-200" style={{ backgroundColor: c }} title={c} />
          ))}
        </div>
      );
    },
  },
  {
    key: 'is_default',
    label: 'Default',
    render: (row) => row.is_default ? <span className="text-xs text-indigo-600 font-medium">Default</span> : null,
  },
  {
    key: 'created_at',
    label: 'Created',
    render: (row) => timeAgo(row.created_at as string),
  },
];

const assetColumns: Column<Record<string, unknown>>[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'type', label: 'Type' },
  { key: 'studio', label: 'Studio' },
  {
    key: 'created_at',
    label: 'Created',
    render: (row) => timeAgo(row.created_at as string),
  },
];

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('generations');
  const [tabData, setTabData] = useState<Record<string, unknown>[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabPage, setTabPage] = useState(1);
  const [tabTotal, setTabTotal] = useState(0);

  // Timeline + Engagement
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelineTotal, setTimelineTotal] = useState(0);

  // Modals
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      const data = await res.json();
      if (data.success) setUser(data.data);
    } catch (err) {
      console.error('Failed to fetch user:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchTabData = useCallback(async () => {
    setTabLoading(true);
    try {
      if (activeTab === 'timeline') {
        const res = await fetch(`/api/admin/users/${id}/timeline?page=${timelinePage}&limit=30`);
        const data = await res.json();
        if (data.success) {
          setTimelineEvents(data.data.events || []);
          setTimelineTotal(data.data.pagination?.total || 0);
          if (data.data.engagement) setEngagement(data.data.engagement);
        }
      } else {
        const params = new URLSearchParams({ tab: activeTab, page: String(tabPage) });
        const res = await fetch(`/api/admin/users/${id}?${params}`);
        const data = await res.json();
        if (data.success) {
          setTabData(data.data.tabData || []);
          setTabTotal(data.data.pagination?.total || data.data.tabData?.length || 0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch tab data:', err);
    } finally {
      setTabLoading(false);
    }
  }, [id, activeTab, tabPage, timelinePage]);

  useEffect(() => { fetchUser(); }, [fetchUser]);
  useEffect(() => { fetchTabData(); }, [fetchTabData]);
  useEffect(() => { setTabPage(1); }, [activeTab]);

  async function handleChangePlan(plan: string) {
    if (!user || plan === user.plan_id) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: plan }),
      });
      const data = await res.json();
      if (data.success) setUser(data.data);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleBan() {
    if (!user) return;
    setActionLoading(true);
    try {
      const body = user.banned
        ? { banned: false }
        : { banned: true, ban_reason: banReason.trim() };

      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) setUser(data.data);
      setBanDialogOpen(false);
      setBanReason('');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) router.push('/admin/users');
    } finally {
      setActionLoading(false);
      setDeleteDialogOpen(false);
    }
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'timeline', label: 'Timeline' },
    { key: 'generations', label: 'Generations' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'brand_kits', label: 'Brand Kits' },
    { key: 'assets', label: 'Assets' },
  ];

  const tabColumnMap: Partial<Record<TabType, Column<Record<string, unknown>>[]>> = {
    generations: generationColumns,
    transactions: transactionColumns,
    brand_kits: brandKitColumns,
    assets: assetColumns,
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      </AdminLayout>
    );
  }

  if (!user) {
    return (
      <AdminLayout>
        <div className="py-20 text-center text-slate-500">User not found</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* Back button */}
      <button
        onClick={() => router.push('/admin/users')}
        className="mb-4 flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Users
      </button>

      {/* User card */}
      <UserDetailCard
        user={user}
        onAdjustCredits={() => setCreditModalOpen(true)}
        onChangePlan={handleChangePlan}
        onToggleBan={() => setBanDialogOpen(true)}
        onDelete={() => setDeleteDialogOpen(true)}
      />

      {/* Tabs */}
      <div className="mt-6">
        <div className="flex border-b border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-indigo-500 text-indigo-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {user.stats && tab.key !== 'timeline' && (
                <span className="ms-1.5 text-xs text-slate-400">
                  ({user.stats[tab.key === 'brand_kits' ? 'brandKits' : tab.key] || 0})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {activeTab === 'timeline' ? (
            <div className="space-y-4">
              {/* Engagement Score */}
              {engagement && (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-300">Engagement Score</h4>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${
                      engagement.label === 'power' ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' :
                      engagement.label === 'active' ? 'bg-blue-500/10 text-blue-400 ring-blue-500/20' :
                      engagement.label === 'moderate' ? 'bg-amber-500/10 text-amber-400 ring-amber-500/20' :
                      'bg-slate-500/10 text-slate-400 ring-slate-500/20'
                    }`}>
                      {engagement.total}/100 — {engagement.label}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        engagement.total >= 70 ? 'bg-emerald-500' :
                        engagement.total >= 50 ? 'bg-blue-500' :
                        engagement.total >= 30 ? 'bg-amber-500' : 'bg-slate-500'
                      }`}
                      style={{ width: `${engagement.total}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    {Object.entries(engagement.breakdown).map(([key, val]) => (
                      <div key={key} className="flex justify-between rounded-lg bg-white/[0.03] px-2 py-1.5">
                        <span className="text-slate-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="font-medium text-slate-300">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline Events */}
              {tabLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
                  ))}
                </div>
              ) : timelineEvents.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-600">No activity yet</p>
              ) : (
                <div className="space-y-1">
                  {timelineEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.03]">
                      <span className="mt-0.5 text-lg">{event.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200">{event.title}</p>
                        <p className="text-xs text-slate-500 truncate">{event.description}</p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-600">{timeAgo(event.created_at)}</span>
                    </div>
                  ))}
                  {timelineTotal > timelineEvents.length && (
                    <button
                      onClick={() => setTimelinePage(p => p + 1)}
                      className="w-full rounded-lg py-2 text-center text-xs text-indigo-400 hover:bg-white/[0.03]"
                    >
                      Load more...
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <DataTable
              columns={tabColumnMap[activeTab] || []}
              data={tabData}
              loading={tabLoading}
              emptyMessage={`No ${activeTab.replace('_', ' ')} found`}
              pagination={
                ['generations', 'transactions'].includes(activeTab)
                  ? { page: tabPage, total: tabTotal, limit: 20, onPageChange: setTabPage }
                  : undefined
              }
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <CreditAdjustModal
        open={creditModalOpen}
        userId={user.id}
        userName={user.name || user.email}
        currentBalance={user.credits_balance}
        onClose={() => setCreditModalOpen(false)}
        onSuccess={(newBalance) => {
          setUser({ ...user, credits_balance: newBalance });
          if (activeTab === 'transactions') fetchTabData();
        }}
      />

      {/* Ban dialog — includes reason input when banning */}
      {banDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setBanDialogOpen(false); setBanReason(''); }} />
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {user.banned ? 'Unban User' : 'Ban User'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {user.banned
                ? `Are you sure you want to unban ${user.name || user.email}?`
                : `Are you sure you want to ban ${user.name || user.email}? They will be unable to use the platform.`}
            </p>
            {!user.banned && (
              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-slate-700">Ban Reason (required)</label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Reason for banning this user..."
                  required
                />
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setBanDialogOpen(false); setBanReason(''); }}
                disabled={actionLoading}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleBan}
                disabled={actionLoading || (!user.banned && !banReason.trim())}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  user.banned ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {user.banned ? 'Unban' : 'Ban'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete User Account"
        description={`This will permanently delete ${user.name || user.email}'s account and all their data. This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        requireInput={user.email}
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialogOpen(false)}
        loading={actionLoading}
      />
    </AdminLayout>
  );
}
