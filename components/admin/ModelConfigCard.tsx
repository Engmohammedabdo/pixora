'use client';

import { Loader2, Play } from 'lucide-react';

interface ModelConfigCardProps {
  name: string;
  displayName: string;
  enabled: boolean;
  fallbackPosition: number;
  stats: { total: number; completed: number; failed: number; successRate: string };
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  testResult?: { responseTimeMs: number; error?: string; result?: string; failed?: boolean };
  testing?: boolean;
}

const modelIcons: Record<string, string> = {
  gemini: '💎',
  gpt: '🧠',
  flux: '⚡',
};

export default function ModelConfigCard({
  name,
  displayName,
  enabled,
  fallbackPosition,
  stats,
  onToggle,
  onTest,
  testResult,
  testing,
}: ModelConfigCardProps) {
  const successRate = parseFloat(stats.successRate);

  return (
    <div className={`rounded-xl border bg-white p-6 shadow-sm transition-opacity ${enabled ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{modelIcons[name] || '🤖'}</span>
          <div>
            <h3 className="font-semibold text-slate-900">{displayName}</h3>
            <p className="text-xs text-slate-500">Fallback position: #{fallbackPosition}</p>
          </div>
        </div>
        <button
          onClick={() => onToggle(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-indigo-600' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Stats (7 days) */}
      <div className="mb-4 space-y-3">
        <p className="text-xs font-medium text-slate-500 uppercase">Last 7 Days</p>

        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Total Generations</span>
          <span className="font-medium text-slate-900">{stats.total}</span>
        </div>

        {/* Success rate bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-500">Success Rate</span>
            <span className={`font-medium ${successRate >= 90 ? 'text-emerald-600' : successRate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
              {stats.successRate}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${successRate >= 90 ? 'bg-emerald-500' : successRate >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(successRate, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Failed</span>
          <span className={`font-medium ${stats.failed > 0 ? 'text-red-600' : 'text-slate-900'}`}>{stats.failed}</span>
        </div>
      </div>

      {/* Test button */}
      <button
        onClick={onTest}
        disabled={testing || !enabled}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        {testing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Testing...
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Test Model
          </>
        )}
      </button>

      {/* Test result */}
      {testResult && (
        <div className={`mt-3 rounded-lg p-3 text-xs ${testResult.failed ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          <div className="flex justify-between mb-1">
            <span className="font-medium">{testResult.failed ? 'Failed' : 'Success'}</span>
            <span>{testResult.responseTimeMs}ms</span>
          </div>
          {testResult.error && <p className="mt-1 break-all">{testResult.error}</p>}
          {testResult.result && (
            <p className="mt-1 truncate" title={testResult.result}>
              {testResult.result.substring(0, 100)}...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
