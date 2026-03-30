'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { Column } from '@/components/admin/DataTable';
import FilterBar from '@/components/admin/FilterBar';
import Image from 'next/image';
import { Users, Eye } from 'lucide-react';

interface UserRow extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  plan_id: string;
  credits_balance: number;
  purchased_credits: number;
  banned: boolean;
  created_at: string;
}

const planColors: Record<string, string> = {
  free: 'bg-slate-100 text-slate-700',
  starter: 'bg-blue-100 text-blue-700',
  pro: 'bg-indigo-100 text-indigo-700',
  business: 'bg-purple-100 text-purple-700',
  agency: 'bg-amber-100 text-amber-700',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [bannedFilter, setBannedFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      label: 'User',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
            {row.avatar_url ? (
              <Image src={row.avatar_url} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" unoptimized />
            ) : (
              (row.name || 'U').charAt(0).toUpperCase()
            )}
          </div>
          <span className="font-medium text-slate-900">{row.name || 'Unnamed'}</span>
        </div>
      ),
    },
    { key: 'email', label: 'Email', sortable: true },
    {
      key: 'plan_id',
      label: 'Plan',
      sortable: true,
      render: (row) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${planColors[row.plan_id] || planColors.free}`}>
          {row.plan_id}
        </span>
      ),
    },
    {
      key: 'credits_balance',
      label: 'Credits',
      sortable: true,
      render: (row) => (
        <span>{row.credits_balance + (row.purchased_credits || 0)}</span>
      ),
    },
    {
      key: 'created_at',
      label: 'Joined',
      sortable: true,
      render: (row) => timeAgo(row.created_at),
    },
    {
      key: 'banned',
      label: 'Status',
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            row.banned ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {row.banned ? 'Banned' : 'Active'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: '60px',
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/admin/users/${row.id}`);
          }}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-indigo-600 transition-colors hover:bg-indigo-50"
        >
          <Eye className="h-3.5 w-3.5" />
          View
        </button>
      ),
    },
  ];

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (planFilter) params.set('plan', planFilter);
      if (bannedFilter) params.set('banned', bannedFilter);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();

      if (data.success) {
        setUsers(data.data);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [search, planFilter, bannedFilter, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, planFilter, bannedFilter]);

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center gap-3">
        <Users className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <span className="text-sm text-slate-500">({total} total)</span>
      </div>

      <FilterBar
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or email..."
        filters={[
          {
            key: 'plan',
            label: 'All Plans',
            options: [
              { value: 'free', label: 'Free' },
              { value: 'starter', label: 'Starter' },
              { value: 'pro', label: 'Pro' },
              { value: 'business', label: 'Business' },
              { value: 'agency', label: 'Agency' },
            ],
            value: planFilter,
            onChange: setPlanFilter,
          },
          {
            key: 'status',
            label: 'All Status',
            options: [
              { value: 'false', label: 'Active' },
              { value: 'true', label: 'Banned' },
            ],
            value: bannedFilter,
            onChange: setBannedFilter,
          },
        ]}
      />

      <DataTable<UserRow>
        columns={columns}
        data={users}
        loading={loading}
        emptyMessage="No users found"
        onRowClick={(row) => router.push(`/admin/users/${row.id}`)}
        pagination={{
          page,
          total,
          limit,
          onPageChange: setPage,
        }}
      />
    </AdminLayout>
  );
}
