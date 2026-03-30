'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, X } from 'lucide-react';

interface CreditAdjustModalProps {
  open: boolean;
  userId: string;
  userName: string;
  currentBalance: number;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}

const quickAmounts = [
  { label: '+10', value: 10 },
  { label: '+50', value: 50 },
  { label: '+100', value: 100 },
  { label: '-10', value: -10 },
  { label: '-50', value: -50 },
];

export default function CreditAdjustModal({
  open,
  userId,
  userName,
  currentBalance,
  onClose,
  onSuccess,
}: CreditAdjustModalProps) {
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) onClose();
  }, [onClose, loading]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open, handleEscape]);

  if (!open) return null;

  const newBalance = currentBalance + amount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !reason.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Failed to adjust credits');
        return;
      }

      onSuccess(data.data.newBalance);
      setAmount(0);
      setReason('');
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Adjust Credits</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          Adjusting credits for <span className="font-medium text-slate-700">{userName}</span>
        </p>

        <form onSubmit={handleSubmit}>
          {/* Amount */}
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-slate-700">Amount</label>
            <input
              type="number"
              value={amount || ''}
              onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="Enter amount (positive to add, negative to subtract)"
            />
          </div>

          {/* Quick amounts */}
          <div className="mb-4 flex flex-wrap gap-2">
            {quickAmounts.map((qa) => (
              <button
                key={qa.value}
                type="button"
                onClick={() => setAmount(qa.value)}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                  qa.value > 0
                    ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                    : 'border-red-200 text-red-700 hover:bg-red-50'
                }`}
              >
                {qa.label}
              </button>
            ))}
          </div>

          {/* Balance preview */}
          <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
            <span className="text-slate-500">Balance: </span>
            <span className="font-medium text-slate-700">{currentBalance}</span>
            <span className="text-slate-400"> → </span>
            <span className={`font-bold ${newBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {newBalance}
            </span>
          </div>

          {/* Reason */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="Reason for adjustment..."
              required
            />
          </div>

          {error && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!amount || !reason.trim() || newBalance < 0 || loading}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply Adjustment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
