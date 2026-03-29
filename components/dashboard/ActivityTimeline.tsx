'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Image, Camera, LayoutGrid, BarChart3, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const STUDIO_ICONS: Record<string, LucideIcon> = {
  creator: Image,
  photoshoot: Camera,
  campaign: LayoutGrid,
  analysis: BarChart3,
};

interface Activity {
  id: string;
  studio: string;
  credits_used: number;
  created_at: string;
  status: string;
  description?: string;
  type?: string;
  amount?: number;
}

export function ActivityTimeline(): React.ReactElement {
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
          <div
            key={i}
            className="h-12 rounded-lg bg-surface-2 animate-pulse"
          />
        ))}
      </div>
    );

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-[var(--color-text-muted)]">
        <Clock className="h-8 w-8 mb-2" />
        <p className="text-sm">لم تقم بأي نشاط بعد — ابدأ من أي استوديو!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activities.slice(0, 5).map((a) => {
        const Icon = STUDIO_ICONS[a.studio] || Clock;
        return (
          <div
            key={a.id}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-2/50"
          >
            <div className="h-8 w-8 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate">
                {a.description || a.type}
              </p>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {new Date(a.created_at).toLocaleDateString('ar-SA', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <Badge variant="secondary" className="text-[9px]">
              {(a.amount ?? 0) > 0 ? `+${a.amount}` : a.amount}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
