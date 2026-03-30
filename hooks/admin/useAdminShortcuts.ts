'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const SHORTCUTS: Record<string, string> = {
  'd': '/admin/dashboard',
  'a': '/admin/analytics',
  'u': '/admin/users',
  'g': '/admin/generations',
  't': '/admin/transactions',
  's': '/admin/settings',
  'h': '/admin/health',
  'l': '/admin/logs',
};

export function useAdminShortcuts() {
  const router = useRouter();
  const pendingRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if typing in input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Ignore if modifier keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // "g" prefix chord: press "g" then another key
      if (e.key === 'g' && !pendingRef.current) {
        e.preventDefault();
        pendingRef.current = 'g';
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => { pendingRef.current = null; }, 800);
        return;
      }

      if (pendingRef.current === 'g') {
        pendingRef.current = null;
        clearTimeout(timeoutRef.current);
        const href = SHORTCUTS[e.key];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeoutRef.current);
    };
  }, [router]);
}
