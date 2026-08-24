'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import type { RetrievableStudio } from '@/lib/studios/text-output';

/**
 * The customer's own past runs of a text studio, reopenable.
 *
 * `plan`, `analysis` and `storyboard` write their whole deliverable into
 * `generations.output` and produce no `assets` row, so before this component the
 * only copy of a finished plan was the React state of the tab that made it.
 * Reloading — or a phone deciding to evict a background tab — destroyed work the
 * customer had paid 5, 3 or 14 credits for, with no warning and no way back.
 *
 * Renders nothing at all until it knows there is something to show. An empty
 * "no previous work" panel on a first visit is noise on the one screen where the
 * customer is trying to start, and this sits above the fold on mobile.
 */

interface Row {
  id: string;
  studio: string;
  status: string;
  input: Record<string, unknown> | null;
  credits_used: number | null;
  created_at: string;
}

interface RecentWorkProps {
  studio: RetrievableStudio;
  /**
   * Handed the parsed `output` of the chosen run AND the `input` it was produced
   * from.
   *
   * `input` matters because restoring only the output left the form holding
   * whatever the customer had last typed — and analysis and storyboard both pass
   * live form state into their PDF export, so a restored run was exported under
   * the wrong business name. Rehydrating the inputs also lets a restored run be
   * re-run, which is what a customer reaching for history usually wants.
   */
  onRestore: (output: Record<string, unknown>, input: Record<string, unknown>) => void;
  /** Refetch when this changes — pass the id of the last finished generation. */
  refreshKey?: string | number;
}

export function RecentWork({ studio, onRestore, refreshKey }: RecentWorkProps): React.ReactElement | null {
  const t = useTranslations('studio');
  const [rows, setRows] = useState<Row[]>([]);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/generations?studio=${studio}&limit=10`);
        const json = await res.json();
        if (!cancelled && json.success) setRows(json.data.rows);
      } catch {
        // A history panel that cannot load is not worth an error toast on top of
        // whatever the customer came here to do. The studio itself still works.
      }
    })();
    return () => { cancelled = true; };
  }, [studio, refreshKey]);

  const restore = useCallback(async (id: string): Promise<void> => {
    setOpening(id);
    try {
      const res = await fetch(`/api/generations/${id}`);
      const json = await res.json();
      if (!json.success || !json.data?.output) {
        toast.error(t('recentWorkFailed'));
        return;
      }
      onRestore(
        json.data.output as Record<string, unknown>,
        (json.data.input ?? {}) as Record<string, unknown>
      );
    } catch {
      toast.error(t('recentWorkFailed'));
    } finally {
      setOpening(null);
    }
  }, [onRestore, t]);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-[var(--color-text-muted)]" />
          <h3 className="text-sm font-semibold">{t('recentWorkTitle')}</h3>
        </div>

        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => void restore(row.id)}
                disabled={opening !== null}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-start transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-50"
              >
                {opening === row.id
                  ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  : <RotateCcw className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />}
                <span className="min-w-0 flex-1 truncate text-sm">{label(row)}</span>
                <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                  {formatDate(row.created_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-[var(--color-text-muted)]">{t('recentWorkHint')}</p>
      </CardContent>
    </Card>
  );
}

/**
 * A name for a past run, taken from what the customer typed.
 *
 * `businessName` covers plan and analysis, `concept` covers storyboard. The
 * fallback is the empty string rather than a placeholder like "Untitled": the
 * date sits next to it and already identifies the row, so an invented label
 * would add nothing and translate badly.
 */
function label(row: Row): string {
  const input = row.input ?? {};
  const raw = input.businessName ?? input.concept ?? '';
  const text = typeof raw === 'string' ? raw.trim() : '';
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

/**
 * Locale-aware, but never `toLocaleDateString()` with a hardcoded locale — an
 * Arabic user reading a US date on an Arabic page is the kind of detail that
 * reads as a product built elsewhere. `undefined` lets the browser use its own.
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
