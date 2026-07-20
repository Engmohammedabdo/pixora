'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface StudioStat { studio: string; count: number; }

interface TxRow { type: string; generations: { studio: string } | null; }

const STUDIO_COLORS: Record<string, string> = {
  creator: 'bg-purple-500', photoshoot: 'bg-blue-500', campaign: 'bg-green-500',
  plan: 'bg-amber-500', storyboard: 'bg-rose-500', analysis: 'bg-cyan-500',
  voiceover: 'bg-orange-500', edit: 'bg-pink-500', 'prompt-builder': 'bg-yellow-500',
};

// generations.studio stores route slugs; nav keys are camelCase. Only
// prompt-builder diverges. Mirrors STUDIO_NAV_KEY in ActivityTimeline.tsx.
const STUDIO_NAV_KEY: Record<string, string> = {
  creator: 'creator', photoshoot: 'photoshoot', campaign: 'campaign',
  plan: 'plan', storyboard: 'storyboard', analysis: 'analysis',
  voiceover: 'voiceover', edit: 'edit', 'prompt-builder': 'promptBuilder',
};

export function UsageStats(): React.ReactElement {
  const t = useTranslations('widgets');
  const tNav = useTranslations('nav');
  const [stats, setStats] = useState<StudioStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/credits/transactions?limit=100')
      .then((r) => r.json())
      .then((d: { success?: boolean; data?: TxRow[] }) => {
        if (!d.success || !d.data) return;
        // The studio comes from the joined generation. The previous version
        // regex-matched the frozen English description and captured "Image" /
        // "Photoshoot", which never matched a studio slug.
        const counts: Record<string, number> = {};
        d.data.forEach((tx) => {
          const studio = tx.generations?.studio;
          if (tx.type === 'usage' && studio) counts[studio] = (counts[studio] || 0) + 1;
        });
        setStats(
          Object.entries(counts)
            .map(([studio, count]) => ({ studio, count }))
            .sort((a, b) => b.count - a.count)
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxCount = Math.max(...stats.map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary-500 shrink-0" />
          {t('studioUsage')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-6 bg-surface-2 rounded animate-pulse" />)}</div>
        ) : stats.length === 0 ? (
          <p className="text-xs text-center text-[var(--color-text-muted)] py-4">{t('usageEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {stats.slice(0, 6).map((s) => (
              <div key={s.studio} className="flex items-center gap-2">
                <span className="text-xs w-24 shrink-0 truncate text-[var(--color-text-muted)]">{tNav(STUDIO_NAV_KEY[s.studio] || s.studio)}</span>
                <div className="flex-1 min-w-0 h-5 bg-surface-2 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${STUDIO_COLORS[s.studio] || 'bg-primary-500'} transition-all`} style={{ width: `${(s.count / maxCount) * 100}%` }} />
                </div>
                <span className="text-xs font-medium w-6 shrink-0 text-end">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
