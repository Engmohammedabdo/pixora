'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { Column } from '@/components/admin/DataTable';
import FilterBar from '@/components/admin/FilterBar';
import ExpandableRow from '@/components/admin/ExpandableRow';
import { ScrollText } from 'lucide-react';

type TabType = 'admin' | 'errors';

const actionColors: Record<string, string> = {
  login: 'bg-blue-100 text-blue-700',
  logout: 'bg-blue-100 text-blue-700',
  user: 'bg-indigo-100 text-indigo-700',
  credit: 'bg-emerald-100 text-emerald-700',
  setting: 'bg-amber-100 text-amber-700',
  studio: 'bg-purple-100 text-purple-700',
  model: 'bg-cyan-100 text-cyan-700',
  prompt: 'bg-orange-100 text-orange-700',
  generation: 'bg-red-100 text-red-700',
};

function getActionColor(action: string): string {
  for (const [prefix, color] of Object.entries(actionColors)) {
    if (action.startsWith(prefix)) return color;
  }
  return 'bg-slate-100 text-slate-700';
}

const studioColors: Record<string, string> = {
  creator: 'bg-violet-100 text-violet-700',
  photoshoot: 'bg-pink-100 text-pink-700',
  campaign: 'bg-indigo-100 text-indigo-700',
  plan: 'bg-cyan-100 text-cyan-700',
  storyboard: 'bg-amber-100 text-amber-700',
  analysis: 'bg-teal-100 text-teal-700',
  voiceover: 'bg-rose-100 text-rose-700',
  edit: 'bg-slate-100 text-slate-700',
  'prompt-builder': 'bg-lime-100 text-lime-700',
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

// Admin log columns
const adminColumns: Column<Record<string, unknown>>[] = [
  {
    key: 'action',
    label: 'Action',
    render: (row) => (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getActionColor(row.action as string)}`}>
        {row.action as string}
      </span>
    ),
  },
  {
    key: 'target',
    label: 'Target',
    render: (row) => {
      const type = row.target_type as string;
      const id = row.target_id as string;
      if (!type) return '—';
      return <span className="text-xs font-mono text-slate-600">{type}:{id?.substring(0, 8) || ''}</span>;
    },
  },
  {
    key: 'details',
    label: 'Details',
    render: (row) => {
      const details = row.details as Record<string, unknown> | null;
      if (!details) return '—';
      const text = JSON.stringify(details);
      return (
        <span className="max-w-[200px] truncate block text-xs text-slate-500" title={text}>
          {text.substring(0, 80)}{text.length > 80 ? '...' : ''}
        </span>
      );
    },
  },
  {
    key: 'ip_address',
    label: 'IP',
    render: (row) => <span className="text-xs font-mono text-slate-500">{row.ip_address as string || '—'}</span>,
  },
  {
    key: 'created_at',
    label: 'Time',
    sortable: true,
    render: (row) => (
      <span title={new Date(row.created_at as string).toLocaleString()}>
        {timeAgo(row.created_at as string)}
      </span>
    ),
  },
];

export default function AdminLogsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>('admin');
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionTypes, setActionTypes] = useState<string[]>([]);

  // Error columns
  const errorColumns: Column<Record<string, unknown>>[] = [
    {
      key: 'user',
      label: 'User',
      render: (row) => {
        const profiles = row.profiles as { name: string; email: string } | null;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/admin/users/${row.user_id}`); }}
            className="text-indigo-600 hover:underline text-sm"
          >
            {profiles?.name || 'Unknown'}
          </button>
        );
      },
    },
    {
      key: 'studio',
      label: 'Studio',
      render: (row) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${studioColors[row.studio as string] || 'bg-slate-100 text-slate-700'}`}>
          {row.studio as string}
        </span>
      ),
    },
    { key: 'model', label: 'Model' },
    {
      key: 'error',
      label: 'Error',
      render: (row) => (
        <span className="max-w-[250px] truncate block text-xs text-red-600" title={row.error as string}>
          {(row.error as string) || '—'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Time',
      sortable: true,
      render: (row) => (
        <span title={new Date(row.created_at as string).toLocaleString()}>
          {timeAgo(row.created_at as string)}
        </span>
      ),
    },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab, page: String(page), limit: String(limit) });
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (tab === 'admin' && actionFilter) params.set('action', actionFilter);

      const res = await fetch(`/api/admin/logs?${params}`);
      const result = await res.json();

      if (result.success) {
        setData(result.data);
        setTotal(result.pagination.total);
        if (result.actionTypes) setActionTypes(result.actionTypes);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }, [tab, page, dateFrom, dateTo, actionFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [tab, actionFilter, dateFrom, dateTo]);

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center gap-3">
        <ScrollText className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">Logs</h1>
        <span className="text-sm text-slate-500">({total} entries)</span>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex border-b border-slate-200">
        <button
          onClick={() => setTab('admin')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'admin' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Admin Actions
        </button>
        <button
          onClick={() => setTab('errors')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'errors' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Generation Errors
        </button>
      </div>

      {/* Filters */}
      <FilterBar
        onSearchChange={() => {}}
        searchPlaceholder=""
        filters={tab === 'admin' ? [
          {
            key: 'action',
            label: 'All Actions',
            options: actionTypes.map(a => ({ value: a, label: a })),
            value: actionFilter,
            onChange: setActionFilter,
          },
        ] : []}
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

      {/* Table */}
      <DataTable
        columns={tab === 'admin' ? adminColumns : errorColumns}
        data={data}
        loading={loading}
        emptyMessage={tab === 'admin' ? 'No admin actions logged yet' : 'No generation errors — all clear!'}
        expandable={tab === 'admin'}
        renderExpanded={tab === 'admin' ? (row) => {
          const details = row.details as Record<string, unknown> | null;
          if (!details) return <p className="text-xs text-slate-400">No details</p>;
          return <ExpandableRow data={details} />;
        } : undefined}
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
