'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useCreditsStore, type CreditsStatus } from '@/store/credits';

export const CREDITS_BALANCE_QUERY_KEY = ['credits-balance'] as const;

interface CreditBalanceResponse {
  success: boolean;
  data?: { balance: number; planId: string };
}

interface UseCreditsOptions {
  /** Only the dashboard layout owns the poll. See the comment below. */
  poll?: boolean;
}

interface UseCreditsReturn {
  balance: number;
  status: CreditsStatus;
  refetch: () => void;
}

export function useCredits({ poll = false }: UseCreditsOptions = {}): UseCreditsReturn {
  const { balance, status, setBalance, setError } = useCreditsStore();

  const query = useQuery({
    queryKey: CREDITS_BALANCE_QUERY_KEY,
    queryFn: async () => {
      // Capture BEFORE the request departs. A generation that finishes while
      // this is in flight writes a newer balance; without this guard the slower
      // response wins and the number visibly goes backwards.
      const startedAt = Date.now();
      const res = await fetch('/api/credits/balance');
      if (!res.ok) throw new Error('balance_unavailable');
      const json = (await res.json()) as CreditBalanceResponse;
      // success:false still resolves the promise. Without this throw, React
      // Query's error state never engages and the UI cannot tell failure apart
      // from success.
      if (!json.success || !json.data) throw new Error('balance_unavailable');
      return { balance: json.data.balance, startedAt };
    },
    // React Query keeps refetchInterval per OBSERVER, not per query. With five
    // widgets mounting this hook that would be five independent timers, drifting
    // out of phase on every remount. Exactly one caller polls.
    refetchInterval: poll ? 30_000 : false,
    refetchOnWindowFocus: poll,
  });

  useEffect(() => {
    if (!query.data) return;
    if (query.data.startedAt < useCreditsStore.getState().updatedAt) return;
    setBalance(query.data.balance);
  }, [query.data, setBalance]);

  useEffect(() => {
    if (query.isError) setError();
  }, [query.isError, setError]);

  return { balance, status, refetch: () => { void query.refetch(); } };
}
