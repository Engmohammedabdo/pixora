'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Star, Copy, Check, History } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SavedPrompt {
  id: string;
  prompt: string;
  studio: string;
  is_favorite: boolean;
  use_count: number;
  created_at: string;
}

interface PromptHistoryProps {
  onSelect: (prompt: string) => void;
  studio?: string;
}

export function PromptHistory({ onSelect, studio }: PromptHistoryProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [copied, setCopied] = useState<string | null>(null);

  // For now, use local storage since API isn't wired yet
  useEffect(() => {
    if (!open) return;
    const saved = localStorage.getItem('pyrasuite_prompts');
    if (saved) {
      try { setPrompts(JSON.parse(saved)); } catch { /* */ }
    }
  }, [open]);

  const handleCopy = async (text: string, id: string): Promise<void> => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleFavorite = (id: string): void => {
    setPrompts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, is_favorite: !p.is_favorite } : p);
      localStorage.setItem('pyrasuite_prompts', JSON.stringify(updated));
      return updated;
    });
  };

  const filtered = filter === 'favorites' ? prompts.filter(p => p.is_favorite) : prompts;
  const studioFiltered = studio ? filtered.filter(p => p.studio === studio || !p.studio) : filtered;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1">
        <History className="h-3 w-3" /> السجل
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>سجل البرومبتات</DialogTitle></DialogHeader>
          <div className="flex gap-2 mb-3">
            <button onClick={() => setFilter('all')} className={cn('rounded-full px-3 py-1 text-xs', filter === 'all' ? 'bg-primary-500 text-white' : 'bg-surface-2')}>الكل ({prompts.length})</button>
            <button onClick={() => setFilter('favorites')} className={cn('rounded-full px-3 py-1 text-xs', filter === 'favorites' ? 'bg-primary-500 text-white' : 'bg-surface-2')}>المفضلة</button>
          </div>
          {studioFiltered.length === 0 ? (
            <p className="text-sm text-center text-[var(--color-text-muted)] py-8">لا توجد برومبتات محفوظة بعد</p>
          ) : (
            <div className="space-y-2">
              {studioFiltered.map(p => (
                <div key={p.id} className="rounded-lg border p-3 hover:border-primary-300 transition-colors">
                  <p className="text-xs leading-relaxed line-clamp-2 mb-2" dir="ltr">{p.prompt}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {p.studio && <Badge variant="secondary" className="text-[9px]">{p.studio}</Badge>}
                      <span className="text-[10px] text-[var(--color-text-muted)]">{new Date(p.created_at).toLocaleDateString('ar-SA')}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => toggleFavorite(p.id)} className={cn('p-1 rounded', p.is_favorite ? 'text-amber-500' : 'text-[var(--color-text-muted)]')}><Star className="h-3 w-3" fill={p.is_favorite ? 'currentColor' : 'none'} /></button>
                      <button onClick={() => handleCopy(p.prompt, p.id)} className="p-1 rounded text-[var(--color-text-muted)]">{copied === p.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}</button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => { onSelect(p.prompt); setOpen(false); }}>استخدم</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Helper to save a prompt to history
export function savePromptToHistory(prompt: string, studio: string): void {
  const saved = localStorage.getItem('pyrasuite_prompts');
  const prompts: SavedPrompt[] = saved ? JSON.parse(saved) : [];
  prompts.unshift({
    id: crypto.randomUUID(),
    prompt,
    studio,
    is_favorite: false,
    use_count: 1,
    created_at: new Date().toISOString(),
  });
  // Keep last 50
  localStorage.setItem('pyrasuite_prompts', JSON.stringify(prompts.slice(0, 50)));
}
