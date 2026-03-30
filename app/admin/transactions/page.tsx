'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { Column } from '@/components/admin/DataTable';
import FilterBar from '@/components/admin/FilterBar';
import KPICard from '@/components/admin/KPICard';
import CreditAdjustModal from '@/components/admin/CreditAdjustModal';
import { CreditCard, TrendingUp, TrendingDown, Plus } from 'lucide-react';

interface TransactionRow extends Record<string, unknown> {
  id: string;
  amount: number;
  type: string;
  description: string;
  balance_after: number;
  created_at: string;
  user_id: string;
  profiles: { name: string; email: string } | null;
}

interface Summary {
  totalIn: number;
  totalOut: number;
  net: number;
}

const typeColors: Record<string, string> = {
  subscription: 'bg-indigo-100 text-indigo-700',
  topup: 'bg-emerald-100 text-emerald-700',
  usage: 'bg-slate-100 text-slate-700',
  refund: 'bg-amber-100 text-amber-700',
  reset: 'bg-gray-100 text-gray-700',
  admin_adjustment: 'bg-purple-100 text-purple-700',
};

const transactionTypes = ['subscription', 'topup', 'usage', 'refund', 'reset'];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminTransactionsPage() {
  const router = useRouter();
  const [data, setData] = useState<TransactionRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalIn: 0, totalOut: 0, net: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchUser, setSearchUser] = useState('');

  // Manual adjustment modal
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUserName, setSelectedUserName] = useState('');
  const [selectedUserBalance, setSelectedUserBalance] = useState(0);

  // User search for manual adjustment
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<{ id: string; name: string; email: string; credits_balance: number }[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);

  const columns: Column<TransactionRow>[] = [
    {
      key: 'user',
      label: 'User',
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/admin/users/${row.user_id}`); }}
          className="text-indigo-600 hover:underline"
        >
          {row.profiles?.name || 'Unknown'}
        </button>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (row) => (
        <span className={`font-medium ${row.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {row.amount > 0 ? '+' : ''}{row.amount}
        </span>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (row) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[row.type] || 'bg-slate-100 text-slate-700'}`}>
          {row.type}
        </span>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      render: (row) => (
        <span className="max-w-[200px] truncate block text-slate-600" title={row.description}>
          {row.description || '—'}
        </span>
      ),
    },
    { key: 'balance_after', label: 'Balance After', sortable: true },
    {
      key: 'created_at',
      label: 'Time',
      sortable: true,
      render: (row) => timeAgo(row.created_at),
    },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (directionFilter) params.set('direction', directionFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await fetch(`/api/admin/transactions?${params}`);
      const result = await res.json();

      if (result.success) {
        setData(result.data);
        setSummary(result.summary);
        setTotal(result.pagination.total);
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, directionFilter, dateFrom, dateTo, page]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [typeFilter, directionFilter, dateFrom, dateTo]);

  // Search users for manual adjustment
  useEffect(() => {
    if (!userSearch.trim()) {
      setUserResults([]);
      return;
    }
    setSearchingUsers(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(userSearch)}&limit=5`);
        const result = await res.json();
        if (result.success) setUserResults(result.data);
      } catch { /* ignore */ }
      finally { setSearchingUsers(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [userSearch, searchUser]);

  function handleSelectUser(user: { id: string; name: string; email: string; credits_balance: number }) {
    setSelectedUserId(user.id);
    setSelectedUserName(user.name || user.email);
    setSelectedUserBalance(user.credits_balance);
    setShowUserSearch(false);
    setUserSearch('');
    setUserResults([]);
    setAdjustOpen(true);
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
          <span className="text-sm text-slate-500">({total} total)</span>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowUserSearch(!showUserSearch)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Manual Adjustment
          </button>
          {showUserSearch && (
            <div className="absolute right-0 top-full z-10 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search user by name or email..."
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                autoFocus
              />
              {searchingUsers && (
                <p className="mt-2 text-center text-xs text-slate-400">Searching...</p>
              )}
              {!searchingUsers && userResults.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-auto">
                  {userResults.map((u) => (
                    <li key={u.id}>
                      <button
                        onClick={() => handleSelectUser(u)}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <div>
                          <span className="font-medium text-slate-900">{u.name || 'Unnamed'}</span>
                          <span className="ml-2 text-slate-400">{u.email}</span>
                        </div>
                        <span className="text-xs text-slate-500">{u.credits_balance} cr</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Credits Added"
          value={`+${summary.totalIn.toLocaleString()}`}
          badgeColor="green"
          loading={loading}
        />
        <KPICard
          icon={<TrendingDown className="h-5 w-5" />}
          label="Credits Used"
          value={`-${summary.totalOut.toLocaleString()}`}
          badgeColor="red"
          loading={loading}
        />
        <KPICard
          icon={<CreditCard className="h-5 w-5" />}
          label="Net"
          value={`${summary.net >= 0 ? '+' : ''}${summary.net.toLocaleString()}`}
          badgeColor={summary.net >= 0 ? 'blue' : 'red'}
          loading={loading}
        />
      </div>

      <FilterBar
        onSearchChange={() => {}}
        searchPlaceholder=""
        filters={[
          {
            key: 'type',
            label: 'All Types',
            options: transactionTypes.map((t) => ({ value: t, label: t })),
            value: typeFilter,
            onChange: setTypeFilter,
          },
          {
            key: 'direction',
            label: 'All Directions',
            options: [
              { value: 'positive', label: 'Credits In (+)' },
              { value: 'negative', label: 'Credits Out (-)' },
            ],
            value: directionFilter,
            onChange: setDirectionFilter,
          },
        ]}
      >
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </FilterBar>

      <DataTable<TransactionRow>
        columns={columns}
        data={data}
        loading={loading}
        emptyMessage="No transactions found"
        pagination={{
          page,
          total,
          limit,
          onPageChange: setPage,
        }}
      />

      {adjustOpen && (
        <CreditAdjustModal
          open={adjustOpen}
          userId={selectedUserId}
          userName={selectedUserName}
          currentBalance={selectedUserBalance}
          onClose={() => setAdjustOpen(false)}
          onSuccess={() => {
            setAdjustOpen(false);
            fetchData();
          }}
        />
      )}
    </AdminLayout>
  );
}
