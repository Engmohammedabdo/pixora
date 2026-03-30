'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  pagination?: {
    page: number;
    total: number;
    limit: number;
    onPageChange: (page: number) => void;
  };
  onRowClick?: (row: T) => void;
  expandable?: boolean;
  renderExpanded?: (row: T) => React.ReactNode;
  emptyMessage?: string;
  title?: string;
  exportable?: boolean;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading,
  pagination,
  onRowClick,
  expandable,
  renderExpanded,
  emptyMessage = 'No data available',
  title,
  exportable,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function handleExportCSV() {
    const exportColumns = columns.filter(c => c.key !== 'actions');
    const header = exportColumns.map(c => c.label).join(',');
    const rows = data.map(row =>
      exportColumns.map(col => {
        const val = row[col.key];
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title || 'export'}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const sortedData = sortKey
    ? [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : data;

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        {title && <div className="border-b border-white/[0.06] px-5 py-3"><h3 className="text-sm font-semibold text-slate-300">{title}</h3></div>}
        <div className="p-5 space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {(title || exportable) && (
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          {title && <h3 className="text-sm font-semibold text-slate-300">{title}</h3>}
          {exportable && data.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300"
              title="Export to CSV"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 ${col.sortable ? 'cursor-pointer select-none transition-colors hover:text-slate-300' : ''}`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-slate-600">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row, rowIndex) => (
                <>
                  <tr
                    key={rowIndex}
                    className={`border-b border-white/[0.03] transition-colors ${
                      onRowClick || expandable ? 'cursor-pointer hover:bg-white/[0.03]' : ''
                    } ${expandedRow === rowIndex ? 'bg-white/[0.03]' : ''}`}
                    onClick={() => {
                      if (expandable) {
                        setExpandedRow(expandedRow === rowIndex ? null : rowIndex);
                      }
                      onRowClick?.(row);
                    }}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className="px-5 py-3 text-slate-300">
                        {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                  {expandable && expandedRow === rowIndex && renderExpanded && (
                    <tr key={`expanded-${rowIndex}`}>
                      <td colSpan={columns.length} className="bg-white/[0.02] px-5 py-4 border-b border-white/[0.03]">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
          <p className="text-xs text-slate-500">
            Page {pagination.page} of {totalPages} ({pagination.total} total)
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
