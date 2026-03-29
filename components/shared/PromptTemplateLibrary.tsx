'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PROMPT_TEMPLATES,
  TEMPLATE_CATEGORIES,
} from '@/lib/prompts/templates';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PromptTemplateLibraryProps {
  onSelect: (prompt: string, style: string) => void;
}

export function PromptTemplateLibrary({
  onSelect,
}: PromptTemplateLibraryProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = activeCategory
    ? PROMPT_TEMPLATES.filter((t) => t.category === activeCategory)
    : PROMPT_TEMPLATES;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1"
      >
        <BookOpen className="h-3 w-3" /> القوالب
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>مكتبة القوالب</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                'rounded-full px-3 py-1 text-xs',
                !activeCategory
                  ? 'bg-primary-500 text-white'
                  : 'bg-surface-2'
              )}
            >
              الكل
            </button>
            {TEMPLATE_CATEGORIES.map((cat) => {
              const sample = PROMPT_TEMPLATES.find(
                (t) => t.category === cat
              );
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs',
                    activeCategory === cat
                      ? 'bg-primary-500 text-white'
                      : 'bg-surface-2'
                  )}
                >
                  {sample?.categoryAr || cat}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  onSelect(template.prompt, template.style);
                  setOpen(false);
                }}
                className="text-start rounded-xl border p-4 hover:border-primary-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">
                    {template.nameAr}
                  </span>
                  <Badge variant="secondary" className="text-[9px]">
                    {template.categoryAr}
                  </Badge>
                </div>
                <p
                  className="text-xs text-[var(--color-text-muted)] line-clamp-2"
                  dir="ltr"
                >
                  {template.prompt}
                </p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
