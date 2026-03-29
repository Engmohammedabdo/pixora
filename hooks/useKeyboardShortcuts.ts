'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/routing';

export function useKeyboardShortcuts(): void {
  const router = useRouter();

  useEffect(() => {
    let buffer = '';
    let timer: NodeJS.Timeout;

    const handler = (e: KeyboardEvent): void => {
      // Don't trigger in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      buffer += e.key.toLowerCase();
      clearTimeout(timer);
      timer = setTimeout(() => {
        buffer = '';
      }, 500);

      const shortcuts: Record<string, string> = {
        gc: '/creator',
        gp: '/photoshoot',
        gm: '/campaign',
        ga: '/analysis',
        gs: '/storyboard',
        gd: '/dashboard',
        gb: '/billing',
      };

      for (const [combo, href] of Object.entries(shortcuts)) {
        if (buffer.endsWith(combo)) {
          router.push(href);
          buffer = '';
          break;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [router]);
}
