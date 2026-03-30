'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import DataTable, { Column } from '@/components/admin/DataTable';
import FilterBar from '@/components/admin/FilterBar';
import ExpandableRow from '@/components/admin/ExpandableRow';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { Palette, Trash2 } from 'lucide-react';

interface GenerationRow extends Record<string, unknown> {
  id: string;
  studio: string;
  model: string;
  status: string;
  credits_used: number;
  error: string | null;
  created_at: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  user_id: string;
  profiles: { name: string; email: string } | null;
}

const statusColors: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
};

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

const studios = ['creator', 'photoshoot', 'campaign', 'plan', 'storyboard', 'analysis', 'voiceover', 'edit', 'prompt-builder'];
const models = ['gemini', 'gpt', 'flux'];
const statuses = ['pending', 'processing', 'completed', 'failed'];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminGenerationsPage() {
  const router = useRouter();
  const [data, setData] = useState<GenerationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Filters
  const [studioFilter, setStudioFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const columns: Column<GenerationRow>[] = [
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
      key: 'studio',
      label: 'Studio',
      sortable: true,
      render: (row) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${studioColors[row.studio] || 'bg-slate-100 text-slate-700'}`}>
          {row.studio}
        </span>
      ),
    },
    { key: 'model', label: 'Model', sortable: true },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[row.status] || 'bg-slate-100 text-slate-700'}`}>
          {row.status}
        </span>
      ),
    },
    { key: 'credits_used', label: 'Credits', sortable: true },
    {
      key: 'created_at',
      label: 'Time',
      sortable: true,
      render: (row) => timeAgo(row.created_at),
    },
    {
      key: 'actions',
      label: '',
      width: '50px',
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteId(row.id); }}
          className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (studioFilter) params.set('studio', studioFilter);
      if (modelFilter) params.set('model', modelFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await fetch(`/api/admin/generations?${params}`);
      const result = await res.json();

      if (result.success) {
        setData(result.data);
        setTotal(result.pagination.total);
      }
    } catch (err) {
      console.error('Failed to fetch generations:', err);
    } finally {
      setLoading(false);
    }
  }, [studioFilter, modelFilter, statusFilter, dateFrom, dateTo, page]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [studioFilter, modelFilter, statusFilter, dateFrom, dateTo]);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/generations?id=${deleteId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        setData((prev) => prev.filter((g) => g.id !== deleteId));
        setTotal((prev) => prev - 1);
      }
    } finally {
      setDeleteLoading(false);
      setDeleteId(null);
    }
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center gap-3">
        <Palette className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">Generations</h1>
        <span className="text-sm text-slate-500">({total} total)</span>
      </div>

      <FilterBar
        onSearchChange={() => {}}
        searchPlaceholder=""
        filters={[
          {
            key: 'studio',
            label: 'All Studios',
            options: studios.map((s) => ({ value: s, label: s })),
            value: studioFilter,
            onChange: setStudioFilter,
          },
          {
            key: 'model',
            label: 'All Models',
            options: models.map((m) => ({ value: m, label: m })),
            value: modelFilter,
            onChange: setModelFilter,
          },
          {
            key: 'status',
            label: 'All Status',
            options: statuses.map((s) => ({ value: s, label: s })),
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
      >
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          placeholder="To"
        />
      </FilterBar>

      <DataTable<GenerationRow>
        columns={columns}
        data={data}
        loading={loading}
        emptyMessage="No generations found"
        expandable
        renderExpanded={(row) => (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500 uppercase">Input</p>
              <ExpandableRow data={row.input || {}} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500 uppercase">Output</p>
              <ExpandableRow data={row.output || {}} />
            </div>
            {row.error && (
              <div className="md:col-span-2">
                <p className="mb-1 text-xs font-semibold text-red-500 uppercase">Error</p>
                <pre className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{row.error}</pre>
              </div>
            )}
          </div>
        )}
        pagination={{
          page,
          total,
          limit,
          onPageChange: setPage,
        }}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Generation"
        description="This will permanently delete this generation and all associated assets. This cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleteLoading}
      />
    </AdminLayout>
  );
}
