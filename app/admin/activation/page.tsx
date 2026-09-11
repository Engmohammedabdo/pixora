'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Users, Repeat, Zap, AlertTriangle } from 'lucide-react';

/**
 * The screen the 30-day decision is read off.
 *
 * `docs/POSITIONING.md` §7 states the number and what each result means. This page
 * shows it and — deliberately — shows the two things that make it readable: how
 * many events were scanned (so an empty table is distinguishable from a broken
 * read) and the day-bucket caveat.
 *
 * THREE QUERIES, NOTHING ELSE. The temptation with a fresh data source is a
 * dashboard; the reason this table went a fortnight unread is that nobody needed
 * a dashboard, they needed one number. A chart can come after the number stops
 * being zero.
 */
interface ActivationData {
  windowDays: number;
  dayBucket: string;
  eventsScanned: number;
  eventsCounted: number;
  returningUsers: number;
  returningUsersUsingTwoStudios: number;
  activeUsers: number;
  signups: { date: string; count: number }[];
  startedByStudio: { studio: string; count: number }[];
  totals: Record<string, number>;
}

const TARGET = 5;

export default function ActivationPage(): React.ReactElement {
  const [data, setData] = useState<ActivationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/analytics/activation?days=30');
      const json = await res.json() as { success: boolean; data?: ActivationData; detail?: string; error?: string };
      // A failed read must NOT render as zeros. Zero is the finding this page
      // exists to report, so faking it would be the worst possible bug here.
      if (!json.success || !json.data) throw new Error(json.detail ?? json.error ?? 'request failed');
      setData(json.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const verdict = (n: number): { label: string; tone: string } => {
    if (n >= TARGET) return { label: 'The segment is right — pour more of the same people in.', tone: 'text-emerald-400' };
    if (n >= 1) return { label: 'The segment is plausible; the second session is what to fix.', tone: 'text-amber-400' };
    return { label: 'Zero. Read it against how many conversations you actually held.', tone: 'text-slate-400' };
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Activation</h1>
          <p className="mt-1 text-sm text-slate-400">
            The first reader of <code className="rounded bg-slate-800 px-1.5 py-0.5">public.user_events</code>.
            One number: distinct people, excluding the test account, who completed a generation on two different days in 30 days.
          </p>
        </div>

        {loading && <p className="text-slate-400">Loading…</p>}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div>
              <p className="font-medium text-red-300">The read failed — this is not a zero.</p>
              <p className="mt-1 font-mono text-xs text-red-400/80">{error}</p>
              <button onClick={() => void load()} className="mt-3 rounded-lg border border-red-800 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/40">
                Retry
              </button>
            </div>
          </div>
        )}

        {data && (
          <>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
              <p className="text-sm font-medium uppercase tracking-widest text-slate-500">Returning users · 30 days</p>
              <div className="mt-3 flex items-baseline gap-4">
                <span className="font-mono text-6xl font-semibold text-slate-100 tabular-nums">{data.returningUsers}</span>
                <span className="text-lg text-slate-500">/ target {TARGET}</span>
              </div>
              <p className={`mt-3 text-sm ${verdict(data.returningUsers).tone}`}>{verdict(data.returningUsers).label}</p>
              <p className="mt-4 border-t border-slate-800 pt-4 text-sm text-slate-400">
                <strong className="text-slate-300">{data.returningUsersUsingTwoStudios}</strong> of them used a second studio.
                {' '}A tool gets used again; a platform gets used differently.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: Users, label: 'Active users (any completion)', value: data.activeUsers },
                { icon: Zap, label: 'Generations completed', value: data.totals.generation_completed ?? 0 },
                { icon: Repeat, label: 'Sign-ups (distinct people)', value: data.totals.sign_up ?? 0 },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <Icon className="h-4 w-4 text-slate-500" />
                  <p className="mt-3 font-mono text-2xl font-semibold text-slate-100 tabular-nums">{value}</p>
                  <p className="mt-1 text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="mb-4 text-sm font-semibold text-slate-300">Generations started, by studio</h2>
                {data.startedByStudio.length === 0 ? (
                  <p className="text-sm text-slate-500">None in this window.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.startedByStudio.map((s) => (
                      <li key={s.studio} className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">{s.studio}</span>
                        <span className="font-mono tabular-nums text-slate-200">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="mb-4 text-sm font-semibold text-slate-300">Sign-ups per day · distinct people · Dubai calendar days</h2>
                {data.signups.length === 0 ? (
                  <p className="text-sm text-slate-500">None in this window.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.signups.map((s) => (
                      <li key={s.date} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-slate-400">{s.date}</span>
                        <span className="font-mono tabular-nums text-slate-200">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* The two facts that make the number above readable. Without the scan
                count, an empty table and a broken filter look identical. */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-xs leading-relaxed text-slate-500">
              <p>
                <strong className="text-slate-400">{data.eventsScanned}</strong> events scanned,{' '}
                <strong className="text-slate-400">{data.eventsCounted}</strong> counted after excluding the test account.
                {data.eventsScanned === 0 && ' Nothing was written in this window — that is a different problem from nobody returning.'}
              </p>
              <p className="mt-2">{data.dayBucket}</p>
              <p className="mt-2">
                Record how many of the twenty conversations you actually held alongside this number.
                Without that input, the output is unreadable — see <code>docs/POSITIONING.md</code> §7.
              </p>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
