'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import StudioConfigCard from '@/components/admin/StudioConfigCard';
import { toast } from 'sonner';
import { SlidersHorizontal, Save, Loader2 } from 'lucide-react';

interface StudioData {
  name: string;
  icon: string;
  enabled: boolean;
  costs: Record<string, number>;
  defaultCosts: Record<string, number>;
  totalGenerations: number;
  todayGenerations: number;
}

export default function AdminStudiosPage() {
  const [studios, setStudios] = useState<StudioData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/studios');
      const data = await res.json();
      if (data.success) setStudios(data.data);
    } catch (err) {
      console.error('Failed to fetch studios:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleToggle(index: number, enabled: boolean) {
    setStudios(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], enabled };
      return updated;
    });
    setDirty(true);
  }

  function handleCostChange(index: number, costs: Record<string, number>) {
    setStudios(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], costs };
      return updated;
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const config: Record<string, { enabled: boolean; costs: Record<string, number> }> = {};
      studios.forEach(s => {
        config[s.name] = { enabled: s.enabled, costs: s.costs };
      });

      const res = await fetch('/api/admin/studios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const data = await res.json();
      if (data.success) {
        setDirty(false);
        toast.success('Studio configuration saved');
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
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
          <SlidersHorizontal className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-slate-900">Studios</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save All Changes
        </button>
      </div>

      {dirty && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
          You have unsaved changes.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {studios.map((studio, index) => (
          <StudioConfigCard
            key={studio.name}
            name={studio.name}
            icon={studio.icon}
            enabled={studio.enabled}
            costs={studio.costs}
            totalGenerations={studio.totalGenerations}
            todayGenerations={studio.todayGenerations}
            onToggle={(enabled) => handleToggle(index, enabled)}
            onCostChange={(costs) => handleCostChange(index, costs)}
          />
        ))}
      </div>
    </AdminLayout>
  );
}
