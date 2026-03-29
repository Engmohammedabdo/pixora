'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface StudioStat { studio: string; count: number; }

const STUDIO_LABELS: Record<string, string> = {
  creator: 'منشئ الصور', photoshoot: 'تصوير', campaign: 'حملات',
  plan: 'خطط', storyboard: 'ستوري بورد', analysis: 'تحليل',
  voiceover: 'صوت', edit: 'تعديل', 'prompt-builder': 'برومبت',
};

const STUDIO_COLORS: Record<string, string> = {
  creator: 'bg-purple-500', photoshoot: 'bg-blue-500', campaign: 'bg-green-500',
  plan: 'bg-amber-500', storyboard: 'bg-rose-500', analysis: 'bg-cyan-500',
  voiceover: 'bg-orange-500', edit: 'bg-pink-500', 'prompt-builder': 'bg-yellow-500',
};

export function UsageStats(): React.ReactElement {
  const [stats, setStats] = useState<StudioStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/credits/transactions?limit=100')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          const counts: Record<string, number> = {};
          d.data.forEach((tx: { type: string; description: string | null }) => {
            if (tx.type === 'usage' && tx.description) {
              const match = tx.description.match(/^(\w[\w-]*)/);
              if (match) counts[match[1]] = (counts[match[1]] || 0) + 1;
            }
          });
          setStats(Object.entries(counts).map(([studio, count]) => ({ studio, count })).sort((a, b) => b.count - a.count));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxCount = Math.max(...stats.map(s => s.count), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary-500" />استخدام الاستوديوهات</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-6 bg-surface-2 rounded animate-pulse" />)}</div>
        ) : stats.length === 0 ? (
          <p className="text-xs text-center text-[var(--color-text-muted)] py-4">ابدأ بإنشاء محتوى لتظهر الإحصائيات</p>
        ) : (
          <div className="space-y-2">
            {stats.slice(0, 6).map(s => (
              <div key={s.studio} className="flex items-center gap-2">
                <span className="text-[10px] w-16 truncate text-[var(--color-text-muted)]">{STUDIO_LABELS[s.studio] || s.studio}</span>
                <div className="flex-1 h-5 bg-surface-2 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${STUDIO_COLORS[s.studio] || 'bg-primary-500'} transition-all`} style={{ width: `${(s.count / maxCount) * 100}%` }} />
                </div>
                <span className="text-[10px] font-medium w-6 text-end">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
