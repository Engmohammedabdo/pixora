'use client';

import { useState } from 'react';
import { X, CreditCard, Shield, Download, Loader2 } from 'lucide-react';

interface BulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
  onBulkCreditAdjust: (amount: number, reason: string) => Promise<void>;
  onBulkBan: () => Promise<void>;
  onExport: () => void;
}

export default function BulkActions({
  selectedIds,
  onClear,
  onBulkCreditAdjust,
  onBulkBan,
  onExport,
}: BulkActionsProps) {
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditAmount, setCreditAmount] = useState(0);
  const [creditReason, setCreditReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (selectedIds.length === 0) return null;

  async function handleCreditSubmit() {
    if (!creditAmount || !creditReason.trim()) return;
    setLoading(true);
    try {
      await onBulkCreditAdjust(creditAmount, creditReason);
      setShowCreditForm(false);
      setCreditAmount(0);
      setCreditReason('');
    } finally {
      setLoading(false);
    }
  }

  async function handleBan() {
    setLoading(true);
    try {
      await onBulkBan();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.1] bg-slate-900/95 px-5 py-3 shadow-2xl backdrop-blur-xl">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-400">
          {selectedIds.length}
        </span>
        <span className="text-sm font-medium text-slate-300">users selected</span>

        <div className="mx-2 h-5 border-s border-white/10" />

        {showCreditForm ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={creditAmount || ''}
              onChange={(e) => setCreditAmount(parseInt(e.target.value) || 0)}
              placeholder="Amount"
              className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
              placeholder="Reason..."
              className="w-36 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleCreditSubmit}
              disabled={!creditAmount || !creditReason.trim() || loading}
              className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              Apply
            </button>
            <button onClick={() => setShowCreditForm(false)} className="text-slate-500 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowCreditForm(true)}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Adjust Credits
            </button>
            <button
              onClick={handleBan}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              <Shield className="h-3.5 w-3.5" />
              Ban
            </button>
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </>
        )}

        <div className="mx-2 h-5 border-s border-white/10" />

        <button
          onClick={onClear}
          className="text-slate-500 transition-colors hover:text-white"
          title="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
