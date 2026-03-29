'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { Trophy, ArrowLeft } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const CHALLENGES = [
  { title: 'أنشئ حملة رمضانية', description: 'استخدم مخطط الحملات لإنشاء حملة بمناسبة رمضان', reward: 10, studio: '/campaign' as const, target: 1 },
  { title: 'صمم 3 صور منتجات', description: 'استخدم منشئ الصور لإنشاء 3 صور مختلفة', reward: 5, studio: '/creator' as const, target: 3 },
  { title: 'حلل منافسيك', description: 'استخدم التحليل التسويقي لتحليل عملك', reward: 8, studio: '/analysis' as const, target: 1 },
  { title: 'أنشئ ستوري بورد فيديو', description: 'صمم ستوري بورد لإعلان 30 ثانية', reward: 12, studio: '/storyboard' as const, target: 1 },
];

export function WeeklyChallenge(): React.ReactElement {
  // Rotate challenge weekly based on current week number
  const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const challenge = CHALLENGES[weekNumber % CHALLENGES.length];
  const progress = 0; // TODO: track from generations table

  return (
    <Card className="overflow-hidden">
      <div className="h-1 bg-gradient-to-l from-primary-500 to-accent-500" />
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold">تحدي الأسبوع</span>
          </div>
          <Badge variant="secondary" className="text-[10px] gap-1">
            +{challenge.reward} كريدت
          </Badge>
        </div>
        <div>
          <h3 className="font-semibold text-sm">{challenge.title}</h3>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{challenge.description}</p>
        </div>
        <Progress value={(progress / challenge.target) * 100} className="h-1.5" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--color-text-muted)]">{progress}/{challenge.target}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
            <Link href={challenge.studio}>ابدأ <ArrowLeft className="h-3 w-3 rtl:rotate-180" /></Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
