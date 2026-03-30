'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Heart, Copy, Check, Users, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ComingSoonBanner } from '@/components/ui/coming-soon-banner';

const COMMUNITY_PROMPTS = [
  { id: '1', prompt: 'Professional flat lay of luxury watch on black marble, dramatic rim lighting, minimalist composition', author: 'أحمد', studio: 'creator', likes: 42, category: 'فاخر' },
  { id: '2', prompt: 'Cozy coffee shop interior with warm lighting, Arabic calligraphy on wall, steaming cup in foreground', author: 'سارة', studio: 'creator', likes: 38, category: 'مأكولات' },
  { id: '3', prompt: 'Modern Saudi startup office with glass walls, team collaboration, brand colors teal and white', author: 'خالد', studio: 'creator', likes: 31, category: 'أعمال' },
  { id: '4', prompt: 'Aerial drone shot of Dubai Marina at sunset, luxury yacht in foreground, golden reflections', author: 'نورة', studio: 'creator', likes: 56, category: 'عقارات' },
  { id: '5', prompt: 'Skincare routine flat lay with green plants, white towels, glass bottles, soft morning light', author: 'ريم', studio: 'creator', likes: 44, category: 'جمال' },
  { id: '6', prompt: 'Street food cart in old Jeddah, vibrant colors, local spices display, warm evening light', author: 'محمد', studio: 'photoshoot', likes: 29, category: 'مأكولات' },
];

export default function CommunityPage(): React.ReactElement {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const handleCopy = async (prompt: string, id: string): Promise<void> => {
    toast.info('قريباً!');
    return;
  };

  const toggleLike = (id: string): void => {
    toast.info('قريباً!'); return;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-cairo flex items-center gap-2"><Users className="h-6 w-6 text-primary-500" /> مجتمع البرومبتات</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">اكتشف برومبتات مشاركة من مستخدمين آخرين</p>
        </div>
        <Button className="gap-2" onClick={() => toast.info('قريباً!')}><Sparkles className="h-4 w-4" /> شارك برومبتك</Button>
      </div>

      <ComingSoonBanner featureName="Community" featureNameAr="المجتمع" description="Share and discover prompts" descriptionAr="شارك واكتشف برومبتات" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {COMMUNITY_PROMPTS.map(p => (
          <Card key={p.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-[9px]">{p.category}</Badge>
                <span className="text-[10px] text-[var(--color-text-muted)]">بواسطة {p.author}</span>
              </div>
              <p className="text-xs leading-relaxed line-clamp-3 font-mono bg-surface-2 rounded p-2" dir="ltr">{p.prompt}</p>
              <div className="flex items-center justify-between">
                <button onClick={() => toggleLike(p.id)} className={cn('flex items-center gap-1 text-xs', likedIds.has(p.id) ? 'text-red-500' : 'text-[var(--color-text-muted)]')}>
                  <Heart className="h-3 w-3" fill={likedIds.has(p.id) ? 'currentColor' : 'none'} />
                  {p.likes + (likedIds.has(p.id) ? 1 : 0)}
                </button>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={() => handleCopy(p.prompt, p.id)}>
                    {copiedId === p.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    {copiedId === p.id ? 'تم!' : 'نسخ'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
