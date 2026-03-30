'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import PromptEditor from '@/components/admin/PromptEditor';
import { FileText, Loader2 } from 'lucide-react';

interface PromptData {
  studio: string;
  description: string;
  defaultPrompt: string;
  variables: string[];
  override: string | null;
  isOverridden: boolean;
}

export default function AdminPromptsPage() {
  const [prompts, setPrompts] = useState<PromptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingStudio, setSavingStudio] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/prompts');
      const data = await res.json();
      if (data.success) setPrompts(data.data);
    } catch (err) {
      console.error('Failed to fetch prompts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave(studio: string, prompt: string | null) {
    setSavingStudio(studio);
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studio, prompt }),
      });
      const data = await res.json();
      if (data.success) {
        setPrompts(prev =>
          prev.map(p =>
            p.studio === studio
              ? { ...p, override: prompt, isOverridden: !!prompt }
              : p
          )
        );
      }
    } catch (err) {
      console.error('Failed to save prompt:', err);
    } finally {
      setSavingStudio(null);
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

  const overriddenCount = prompts.filter(p => p.isOverridden).length;

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center gap-3">
        <FileText className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">System Prompts</h1>
        {overriddenCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {overriddenCount} overridden
          </span>
        )}
      </div>

      <p className="mb-6 text-sm text-slate-500">
        Override system prompts per studio. Leave empty to use the default prompt from code.
      </p>

      <div className="space-y-3">
        {prompts.map(prompt => (
          <PromptEditor
            key={prompt.studio}
            studio={prompt.studio}
            description={prompt.description}
            defaultPrompt={prompt.defaultPrompt}
            override={prompt.override}
            variables={prompt.variables}
            onSave={(p) => handleSave(prompt.studio, p)}
            saving={savingStudio === prompt.studio}
          />
        ))}
      </div>
    </AdminLayout>
  );
}
