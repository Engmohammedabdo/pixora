'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wand2, Loader2 } from 'lucide-react';

interface PromptEnhancerProps {
  prompt: string;
  onEnhanced: (enhancedPrompt: string) => void;
}

export function PromptEnhancer({ prompt, onEnhanced }: PromptEnhancerProps): React.ReactElement {
  const [loading, setLoading] = useState(false);

  const handleEnhance = async (): Promise<void> => {
    if (!prompt || prompt.length < 5) return;
    setLoading(true);
    try {
      const res = await fetch('/api/studios/prompt-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: prompt, outputType: 'image' }),
      });
      const data = await res.json();
      if (data.success && data.data?.prompts?.[0]?.prompt) {
        onEnhanced(data.data.prompts[0].prompt);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleEnhance}
      disabled={loading || !prompt || prompt.length < 5}
      className="gap-1 text-xs"
      title="تحسين البرومبت بالذكاء الاصطناعي"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
      تحسين
    </Button>
  );
}
