'use client';
import { Sparkles } from 'lucide-react';

interface PromptSuggestionsProps {
  onSelect: (suggestion: string) => void;
}

const SUGGESTIONS = [
  'صورة إعلانية لمنتج قهوة فاخر على رخام',
  'حملة سوشال ميديا لمطعم خليجي',
  'تصوير عطر فاخر مع إضاءة درامية',
  'تصميم بوست إنستغرام لعرض خاص',
  'صورة منتج عناية بالبشرة بأسلوب بسيط',
  'إعلان عقاري لفيلا مودرن في دبي',
];

export function PromptSuggestions({ onSelect }: PromptSuggestionsProps): React.ReactElement {
  // Randomly pick 3 suggestions
  const selected = SUGGESTIONS.sort(() => 0.5 - Math.random()).slice(0, 3);

  return (
    <div className="flex flex-wrap gap-1.5">
      <Sparkles className="h-3 w-3 text-primary-400 mt-1" />
      {selected.map((s, i) => (
        <button key={i} type="button" onClick={() => onSelect(s)}
          className="text-[11px] px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
          {s}
        </button>
      ))}
    </div>
  );
}
