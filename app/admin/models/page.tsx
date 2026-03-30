'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import AdminLayout from '@/components/admin/AdminLayout';
import ModelConfigCard from '@/components/admin/ModelConfigCard';
import { Bot, Save, Loader2 } from 'lucide-react';

interface ModelData {
  name: string;
  enabled: boolean;
  fallbackPosition: number;
  stats: { total: number; completed: number; failed: number; successRate: string };
}

interface TestResult {
  responseTimeMs: number;
  error?: string;
  result?: string;
  failed?: boolean;
}

const MODEL_NAMES: Record<string, string> = {
  gemini: 'Google Gemini',
  gpt: 'OpenAI GPT',
  flux: 'Flux (Replicate)',
};

export default function AdminModelsPage() {
  const [models, setModels] = useState<ModelData[]>([]);
  const [fallbackOrder, setFallbackOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/models');
      const data = await res.json();
      if (data.success) {
        setModels(data.data.models);
        setFallbackOrder(data.data.fallbackOrder);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleToggle(name: string, enabled: boolean) {
    setModels(prev => prev.map(m => m.name === name ? { ...m, enabled } : m));
    setDirty(true);
  }

  async function handleTest(model: string) {
    setTesting(prev => ({ ...prev, [model]: true }));
    try {
      const res = await fetch('/api/admin/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResults(prev => ({ ...prev, [model]: data.data }));
      }
    } catch {
      setTestResults(prev => ({ ...prev, [model]: { responseTimeMs: 0, error: 'Network error', failed: true } }));
    } finally {
      setTesting(prev => ({ ...prev, [model]: false }));
    }
  }

  async function handleSave() {
    const enabledModels = models.filter(m => m.enabled).map(m => m.name);
    if (enabledModels.length === 0) {
      toast.error('At least one model must be enabled');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: enabledModels,
          fallback_order: fallbackOrder.filter(m => enabledModels.includes(m)),
        }),
      });
      const data = await res.json();
      if (data.success) setDirty(false);
      else if (data.error) toast.error(data.error);
    } finally {
      setSaving(false);
    }
  }

  function moveFallback(model: string, direction: 'up' | 'down') {
    setFallbackOrder(prev => {
      const arr = [...prev];
      const idx = arr.indexOf(model);
      if (idx === -1) return arr;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
    setDirty(true);
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-slate-900">AI Models</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Configuration
        </button>
      </div>

      {dirty && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
          You have unsaved changes.
        </div>
      )}

      {/* Model cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {models.map(model => (
          <ModelConfigCard
            key={model.name}
            name={model.name}
            displayName={MODEL_NAMES[model.name] || model.name}
            enabled={model.enabled}
            fallbackPosition={fallbackOrder.indexOf(model.name) + 1}
            stats={model.stats}
            onToggle={(enabled) => handleToggle(model.name, enabled)}
            onTest={() => handleTest(model.name)}
            testResult={testResults[model.name]}
            testing={testing[model.name]}
          />
        ))}
      </div>

      {/* Fallback order */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Fallback Order</h3>
        <p className="mb-3 text-xs text-slate-500">
          When a model fails, the system tries the next model in this order.
        </p>
        <div className="space-y-2">
          {fallbackOrder.map((model, idx) => (
            <div key={model} className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                {idx + 1}
              </span>
              <span className="flex-1 text-sm font-medium text-slate-900">
                {MODEL_NAMES[model] || model}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => moveFallback(model, 'up')}
                  disabled={idx === 0}
                  className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveFallback(model, 'down')}
                  disabled={idx === fallbackOrder.length - 1}
                  className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
