'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { LifeBuoy, Loader2, Check, RotateCcw, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface Msg {
  id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  topic: string;
  message: string;
  locale: string;
  plan_id: string | null;
  credits: number | null;
  page_url: string | null;
  status: 'new' | 'handled';
  admin_note: string | null;
  handled_at: string | null;
  created_at: string;
}

const TOPIC_STYLE: Record<string, string> = {
  billing: 'bg-amber-900/60 text-amber-300',
  bug: 'bg-red-900/60 text-red-300',
  account: 'bg-blue-900/60 text-blue-300',
  other: 'bg-neutral-800 text-neutral-300',
};

export default function AdminSupportPage() {
  const [rows, setRows] = useState<Msg[]>([]);
  const [status, setStatus] = useState<'new' | 'handled' | 'all'>('new');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/support?status=${status}`);
      const json = await res.json();
      if (json.success) setRows(json.data.rows);
      else toast.error('Failed to load');
    } catch {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const setStatusFor = async (id: string, next: 'handled' | 'new'): Promise<void> => {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: next }),
      });
      const json = await res.json();
      if (json.success) { await load(); } else toast.error('Failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold">Support</h1>
        </div>

        <p className="text-sm text-neutral-400">
          Messages are stored here, not emailed — so nothing is lost while there is no email
          provider configured. Reply from your own mail client using the address on each message.
        </p>

        <div className="flex gap-2">
          {(['new', 'handled', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${
                status === s ? 'bg-indigo-600' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-neutral-500">
            {status === 'new' ? 'No unread messages.' : 'Nothing here.'}
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((m) => (
              <div key={m.id} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${TOPIC_STYLE[m.topic] ?? TOPIC_STYLE.other}`}>
                    {m.topic}
                  </span>
                  {/* Context the customer never had to be asked for. */}
                  {m.plan_id && (
                    <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
                      {m.plan_id} · {m.credits ?? 0} credits
                    </span>
                  )}
                  {!m.user_id && (
                    <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                      logged out
                    </span>
                  )}
                  <span className="ms-auto text-xs text-neutral-500">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="mb-2 flex items-center gap-2 text-sm" dir="ltr">
                  <Mail className="h-3.5 w-3.5 text-neutral-500" />
                  <a href={`mailto:${m.email}`} className="text-indigo-400 hover:underline">{m.email}</a>
                  {m.name && <span className="text-neutral-500">· {m.name}</span>}
                </div>

                <p
                  className="whitespace-pre-wrap rounded bg-neutral-950 p-3 text-sm"
                  dir={m.locale === 'ar' ? 'rtl' : 'ltr'}
                >
                  {m.message}
                </p>

                {m.page_url && (
                  <p className="mt-2 truncate text-xs text-neutral-500" dir="ltr">from: {m.page_url}</p>
                )}

                <div className="mt-3 flex gap-2">
                  {m.status === 'new' ? (
                    <button
                      onClick={() => void setStatusFor(m.id, 'handled')}
                      disabled={busy === m.id}
                      className="flex items-center gap-1 rounded bg-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-600 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /> Mark handled
                    </button>
                  ) : (
                    <button
                      onClick={() => void setStatusFor(m.id, 'new')}
                      disabled={busy === m.id}
                      className="flex items-center gap-1 rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" /> Reopen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
