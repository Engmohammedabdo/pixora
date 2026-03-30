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

type TabType = 'generations' | 'transactions' | 'brand_kits' | 'assets';

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
      const params = new URLSearchParams({ tab: activeTab, page: String(tabPage) });
      const res = await fetch(`/api/admin/users/${id}?${params}`);
      const data = await res.json();
      if (data.success) {
        setTabData(data.data.tabData || []);
        setTabTotal(data.data.pagination?.total || data.data.tabData?.length || 0);
      }
    } catch (err) {
      console.error('Failed to fetch tab data:', err);
    } finally {
      setTabLoading(false);
    }
  }, [id, activeTab, tabPage]);

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
        : { banned: true, ban_reason: banReason || 'Banned by admin' };

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
    { key: 'generations', label: 'Generations' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'brand_kits', label: 'Brand Kits' },
    { key: 'assets', label: 'Assets' },
  ];

  const tabColumnMap: Record<TabType, Column<Record<string, unknown>>[]> = {
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
              {user.stats && (
                <span className="ms-1.5 text-xs text-slate-400">
                  ({user.stats[tab.key === 'brand_kits' ? 'brandKits' : tab.key] || 0})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <DataTable
            columns={tabColumnMap[activeTab]}
            data={tabData}
            loading={tabLoading}
            emptyMessage={`No ${activeTab.replace('_', ' ')} found`}
            pagination={
              ['generations', 'transactions'].includes(activeTab)
                ? { page: tabPage, total: tabTotal, limit: 20, onPageChange: setTabPage }
                : undefined
            }
          />
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

      <ConfirmDialog
        open={banDialogOpen}
        title={user.banned ? 'Unban User' : 'Ban User'}
        description={
          user.banned
            ? `Are you sure you want to unban ${user.name || user.email}?`
            : `Are you sure you want to ban ${user.name || user.email}? They will be unable to use the platform.`
        }
        confirmLabel={user.banned ? 'Unban' : 'Ban'}
        confirmVariant={user.banned ? 'primary' : 'danger'}
        onConfirm={handleToggleBan}
        onCancel={() => { setBanDialogOpen(false); setBanReason(''); }}
        loading={actionLoading}
      />

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
