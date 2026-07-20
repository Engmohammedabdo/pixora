'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Image as ImageIcon, Camera, LayoutGrid, BarChart3, Clock, Map, Film, Mic, Pencil, Lightbulb,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// All 9 studios. The previous map had 4, but it was keyed on a field that was
// always undefined, so every row fell back to Clock regardless.
const STUDIO_ICONS: Record<string, LucideIcon> = {
  creator: ImageIcon,
  photoshoot: Camera,
  campaign: LayoutGrid,
  plan: Map,
  storyboard: Film,
  analysis: BarChart3,
  voiceover: Mic,
  edit: Pencil,
  'prompt-builder': Lightbulb,
};

// generations.studio stores route slugs; nav keys are camelCase. Only
// prompt-builder diverges, but interpolating would silently miss it.
const STUDIO_NAV_KEY: Record<string, string> = {
  creator: 'creator', photoshoot: 'photoshoot', campaign: 'campaign',
  plan: 'plan', storyboard: 'storyboard', analysis: 'analysis',
  voiceover: 'voiceover', edit: 'edit', 'prompt-builder': 'promptBuilder',
};

// Enums stored raw in generations.input. Only values in these lists have a
// translation key (edit.editTypes.* / voiceover.dialects.*) — anything else
// (schema drift, a future value) falls back to no detail line rather than
// printing the raw enum.
const KNOWN_EDIT_TYPES: string[] = ['background_replace', 'object_remove', 'color_change', 'text_add', 'style_transfer'];
const KNOWN_DIALECTS: string[] = ['formal', 'saudi', 'emirati', 'egyptian', 'gulf'];

type TxType =
  | 'usage' | 'subscription' | 'topup' | 'refund'
  | 'reset' | 'referral' | 'admin_adjustment' | 'onboarding';

type GenerationInput = Record<string, unknown>;

interface Activity {
  id: string;
  type: TxType;
  amount: number | null;
  created_at: string;
  // Supabase returns an embedded object for a to-one relation; it is null when
  // generation_id is null. `input` is JSONB and always an object when present
  // (never null per the generations table schema), but we still guard below.
  generations: { studio: string; input: GenerationInput | null } | null;
}

/**
 * A short, de-emphasized second line per activity row — e.g. resolution for
 * an image, edit type for an edit, dialect for a voiceover. Returns null
 * (render nothing) whenever the expected field is missing or of an
 * unrecognized shape, rather than throwing or printing `undefined`/raw enums.
 */
function getActivityDetail(
  t: ReturnType<typeof useTranslations>,
  studio: string | undefined,
  input: GenerationInput | null | undefined
): string | null {
  if (!studio || !input) return null;

  switch (studio) {
    case 'creator': {
      const resolution = input.resolution;
      if (typeof resolution !== 'string' || !resolution) return null;
      return `${t('credits.resolutionLabel')}: ${resolution}`;
    }
    case 'edit': {
      const editType = input.editType;
      if (typeof editType !== 'string' || !KNOWN_EDIT_TYPES.includes(editType)) return null;
      return t(`edit.editTypes.${editType}`);
    }
    case 'photoshoot': {
      const shots = input.shots;
      if (typeof shots !== 'number') return null;
      return t('dashboard.activityShots', { count: shots });
    }
    case 'voiceover': {
      const dialect = input.dialect;
      if (typeof dialect !== 'string' || !KNOWN_DIALECTS.includes(dialect)) return null;
      return t(`voiceover.dialects.${dialect}`);
    }
    case 'plan':
    case 'analysis': {
      const businessName = input.businessName;
      if (typeof businessName !== 'string' || !businessName.trim()) return null;
      return businessName;
    }
    // storyboard's only distinguishing field is `concept`, which is long
    // free text unsuited to a compact detail line — intentionally skipped.
    default:
      return null;
  }
}

export function ActivityTimeline(): React.ReactElement {
  const t = useTranslations();
  const format = useFormatter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/credits/transactions?limit=10')
      .then((r) => r.json())
      .then((d: { success?: boolean; data?: Activity[] }) => {
        if (d.success) setActivities(d.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-surface-2 animate-pulse" />
        ))}
      </div>
    );

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-[var(--color-text-muted)]">
        <Clock className="h-8 w-8 mb-2" />
        <p className="text-sm">{t('dashboard.noGenerations')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activities.slice(0, 5).map((a) => {
        const studio = a.generations?.studio;
        const Icon = (studio && STUDIO_ICONS[studio]) || Clock;
        // A studio generation names its studio; everything else (topups,
        // renewals, referral bonuses) names its transaction type.
        const navKey = studio ? STUDIO_NAV_KEY[studio] : undefined;
        const label = navKey ? t(`nav.${navKey}`) : t(`credits.txType.${a.type}`);
        const detail = getActivityDetail(t, studio, a.generations?.input);
        return (
          <div
            key={a.id}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-2/50"
          >
            <div className="h-8 w-8 shrink-0 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate">{label}</p>
              {detail && (
                <p className="text-[10px] text-[var(--color-text-secondary)] truncate">{detail}</p>
              )}
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {format.dateTime(new Date(a.created_at), {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <Badge variant="secondary" className="text-[9px] shrink-0">
              {(a.amount ?? 0) > 0 ? `+${a.amount}` : a.amount}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
