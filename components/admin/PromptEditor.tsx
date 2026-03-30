'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, RotateCcw } from 'lucide-react';

interface PromptEditorProps {
  studio: string;
  description: string;
  defaultPrompt: string;
  override: string | null;
  variables: string[];
  onSave: (prompt: string | null) => void;
  saving?: boolean;
}

export default function PromptEditor({
  studio,
  description,
  defaultPrompt,
  override,
  variables,
  onSave,
  saving,
}: PromptEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(override || '');
  const [confirmReset, setConfirmReset] = useState(false);

  const isOverridden = !!override;

  function handleSave() {
    const trimmed = editValue.trim();
    onSave(trimmed || null);
    if (!trimmed) setEditing(false);
  }

  function handleReset() {
    onSave(null);
    setEditValue('');
    setEditing(false);
    setConfirmReset(false);
  }

  function insertVariable(variable: string) {
    setEditValue(prev => prev + `{${variable}}`);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-slate-900 capitalize">{studio}</h3>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              isOverridden ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {isOverridden ? 'Using Override' : 'Using Default'}
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-5 py-4 space-y-4">
          <p className="text-sm text-slate-500">{description}</p>

          {/* Default prompt */}
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase mb-1">Default Prompt</p>
            <pre className="max-h-40 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600 whitespace-pre-wrap font-mono">
              {defaultPrompt}
            </pre>
          </div>

          {/* Variables */}
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase mb-1">Available Variables</p>
            <div className="flex flex-wrap gap-1.5">
              {variables.map(v => (
                <button
                  key={v}
                  onClick={() => { setEditing(true); insertVariable(v); }}
                  className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-mono text-indigo-700 hover:bg-indigo-100 transition-colors"
                  title={`Insert {${v}}`}
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Override editor */}
          {editing || isOverridden ? (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase mb-1">
                {isOverridden ? 'Current Override' : 'Custom Override'}
              </p>
              <textarea
                value={editValue}
                onChange={(e) => { setEditValue(e.target.value); setEditing(true); }}
                rows={8}
                className="w-full rounded-lg border border-slate-200 p-3 text-xs font-mono text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="Enter custom prompt override..."
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save Override
                </button>
                {isOverridden && (
                  <>
                    {confirmReset ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-600">Reset to default?</span>
                        <button
                          onClick={handleReset}
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
                        >
                          Yes, Reset
                        </button>
                        <button
                          onClick={() => setConfirmReset(false)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmReset(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset to Default
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setEditing(true); setEditValue(override || ''); }}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Customize Prompt
            </button>
          )}
        </div>
      )}
    </div>
  );
}
