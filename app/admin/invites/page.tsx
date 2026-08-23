'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Loader2, Copy, Check, Ticket, ShieldAlert, ShieldCheck, Send, X } from 'lucide-react';
import { toast } from 'sonner';

interface Row {
  id: string;
  email: string;
  name: string | null;
  segment: string | null;
  source: string | null;
  locale: string | null;
  invited_at: string | null;
  invite_token: string | null;
  redeemed_at: string | null;
  created_at: string;
}

interface GateStatus {
  installed: boolean;
  enabled: boolean;
  invited: number;
  redeemed: number;
  waiting: number;
}

type Filter = 'all' | 'waiting' | 'invited' | 'joined';

/** Mirrors the shape `/api/admin/invites` returns per address. */
interface InviteResult {
  email: string;
  token?: string;
  error?: string;
  reissued?: boolean;
  sent?: 'sent' | 'failed' | 'skipped';
  sendError?: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';

export default function AdminInvitesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<GateStatus | null>(null);
  const [filter, setFilter] = useState<Filter>('waiting');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter, ...(search ? { search } : {}) });
      const res = await fetch(`/api/admin/invites?${params}`);
      const json = await res.json();
      if (json.success) {
        setRows(json.data.rows);
        setStatus(json.data.status);
      } else {
        toast.error(json.error || 'Failed to load');
      }
    } catch {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => { void load(); }, [load]);

  /**
   * The invite LINK, not just the token.
   *
   * The token has to reach the signup page as `?invite=` — the browser puts it in
   * raw_user_meta_data, which is the only thing the database gate reads. A bare code
   * pasted into WhatsApp puts the burden of assembling a URL on the recipient, and
   * that is where a hand-picked cohort quietly evaporates.
   */
  const inviteLink = (row: Row): string =>
    `${APP_URL}/${row.locale || 'ar'}/signup?invite=${row.invite_token}`;

  const copy = async (row: Row): Promise<void> => {
    try {
      await navigator.clipboard.writeText(inviteLink(row));
      setCopied(row.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Copy failed — select the link manually');
    }
  };

  const issue = async (emails: string[]): Promise<void> => {
    setBusy('issue');
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error || 'Failed'); return; }

      const results: InviteResult[] = json.data.results;
      const failed = results.filter((r) => r.error);
      const sent = results.filter((r) => r.sent === 'sent').length;
      const skipped = results.filter((r) => r.sent === 'skipped').length;
      const undelivered = results.filter((r) => r.sent === 'failed');

      toast.success(`${json.data.issued} invite(s) issued · ${sent} emailed`);
      if (failed.length) {
        toast.error(`${failed.length} could not be issued`);
        console.warn('[invites] issue failures:', failed);
      }

      /**
       * Issued-but-not-delivered gets its own message, and it is an error rather
       * than a warning. The seats are open and the people they belong to have not
       * been told — the founder has to go and send those links by hand, and the
       * only moment they will act on that is this one.
       */
      if (undelivered.length) {
        toast.error(
          `${undelivered.length} invite(s) issued but the email FAILED — copy their links and send manually`,
          { duration: 15000 }
        );
        console.error('[invites] undelivered:', undelivered);
      }
      if (skipped) {
        toast.warning(
          `${skipped} invite(s) issued but no email was sent — mail is not configured on this deployment. Copy the links and send them yourself.`,
          { duration: 15000 }
        );
      }
      await load();
    } catch {
      toast.error('Failed');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (email: string): Promise<void> => {
    setBusy(email);
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (json.success) { toast.success('Invite revoked'); await load(); }
      else toast.error(json.error === 'already_redeemed_or_not_found'
        ? 'Already used — revoking the token will not remove the account'
        : 'Failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Ticket className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold">Invites</h1>
        </div>

        {/* The gate lives on auth.users, a table the Supabase auth service owns. A
            redeploy or a restore can drop the trigger and signup silently reverts to
            fully open — so its presence is stated here, not assumed. */}
        {status && (
          <div className={`flex items-start gap-3 rounded-lg border p-4 ${
            status.installed && status.enabled
              ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
              : 'border-red-800 bg-red-950/40 text-red-300'
          }`}>
            {status.installed && status.enabled
              ? <ShieldCheck className="h-5 w-5 flex-shrink-0" />
              : <ShieldAlert className="h-5 w-5 flex-shrink-0" />}
            <div className="text-sm">
              <p className="font-semibold">
                {status.installed && status.enabled
                  ? 'Invite gate is ON — signup requires a valid invite token.'
                  : !status.installed
                    ? 'GATE MISSING: the trigger is not on auth.users. Anyone can sign up right now.'
                    : 'Gate is installed but DISABLED. Anyone can sign up right now.'}
              </p>
              <p className="mt-1 opacity-80">
                {status.waiting} waiting · {status.invited} invited · {status.redeemed} joined
              </p>
              {!status.installed && (
                <p className="mt-2 font-mono text-xs">
                  node scripts/db/apply.js supabase/migrations/035_invite_gate.sql
                </p>
              )}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          <label className="mb-2 block text-sm font-medium">Invite someone directly</label>
          <div className="flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="name@example.com"
              dir="ltr"
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            />
            <button
              onClick={() => { if (manual.trim()) { void issue([manual.trim()]); setManual(''); } }}
              disabled={busy === 'issue' || !manual.trim()}
              className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Invite
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Works for anyone — they do not have to be on the waitlist. Re-inviting returns the same
            link, so clicking twice will not invalidate one you already sent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['waiting', 'invited', 'joined', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${
                filter === f ? 'bg-indigo-600' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              {f}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email…"
            dir="ltr"
            className="ms-auto rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm"
          />
          {filter === 'waiting' && rows.length > 0 && (
            <button
              onClick={() => void issue(rows.map((r) => r.email))}
              disabled={busy === 'issue'}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
            >
              Invite all {rows.length} shown
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-neutral-500">Nothing here yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-start">
                <tr>
                  <th className="p-3 text-start font-medium">Email</th>
                  <th className="p-3 text-start font-medium">Segment</th>
                  <th className="p-3 text-start font-medium">State</th>
                  <th className="p-3 text-start font-medium">Invite link</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-800">
                    <td className="p-3" dir="ltr">
                      <div>{row.email}</div>
                      {row.name && <div className="text-xs text-neutral-500">{row.name}</div>}
                    </td>
                    <td className="p-3 text-neutral-400">{row.segment || '—'}</td>
                    <td className="p-3">
                      {row.redeemed_at ? (
                        <span className="rounded bg-emerald-900/60 px-2 py-0.5 text-xs text-emerald-300">joined</span>
                      ) : row.invite_token ? (
                        <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300">invited</span>
                      ) : (
                        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">waiting</span>
                      )}
                    </td>
                    <td className="p-3">
                      {row.redeemed_at ? (
                        <span className="text-xs text-neutral-500">used</span>
                      ) : row.invite_token ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void copy(row)}
                            className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
                          >
                            {copied === row.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copied === row.id ? 'Copied' : 'Copy link'}
                          </button>
                          {/*
                            Safe to press twice. `issue_invite` is idempotent — it
                            returns the SAME token for an address already holding
                            one — so this re-sends the link that was mailed before
                            rather than minting a second one and quietly breaking
                            the first.
                          */}
                          <button
                            onClick={() => void issue([row.email])}
                            disabled={busy === 'issue'}
                            className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700 disabled:opacity-50"
                            title="Email the same link again"
                          >
                            <Send className="h-3 w-3" /> Resend
                          </button>
                          <button
                            onClick={() => void revoke(row.email)}
                            disabled={busy === row.email}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-950/50 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" /> Revoke
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => void issue([row.email])}
                          disabled={busy === 'issue'}
                          className="rounded bg-indigo-600 px-2 py-1 text-xs hover:bg-indigo-500 disabled:opacity-50"
                        >
                          Invite
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-neutral-500">
          Inviting emails the person their link automatically, in their own language. If mail is not
          configured on this deployment the invite is still issued and you are told so explicitly —
          copy the link and send it yourself. <span className="text-neutral-400">Resend</span> mails
          the same link again; it never mints a second one.
        </p>
      </div>
    </AdminLayout>
  );
}
