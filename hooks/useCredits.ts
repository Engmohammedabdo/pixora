'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useCreditsStore, type CreditsStatus } from '@/store/credits';

export const CREDITS_BALANCE_QUERY_KEY = ['credits-balance'] as const;

interface CreditBalanceResponse {
  success: boolean;
  data?: { balance: number; planId: string; paymentFailed: boolean };
}

interface UseCreditsOptions {
  /** Only the dashboard layout owns the poll. See the comment below. */
  poll?: boolean;
}

interface UseCreditsReturn {
  balance: number;
  status: CreditsStatus;
  /**
   * The plan the SERVER currently has for this user, not the one cached in
   * useUser's profile (which is read once at mount and never invalidated by a
   * webhook). Null until the first response lands — callers must fall back.
   *
   * This is what closes the post-checkout window: the profile read that renders
   * the billing page can easily beat the webhook, and without a self-healing
   * source the customer who just paid $29 sits looking at a "Free" badge under a
   * green success banner until they think to reload.
   */
  planId: string | null;
  /** Stripe could not collect. Drives the dunning banner. */
  paymentFailed: boolean;
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
      return {
        balance: json.data.balance,
        planId: json.data.planId,
        paymentFailed: json.data.paymentFailed === true,
        startedAt,
      };
    },
    // React Query keeps refetchInterval per OBSERVER, not per query. With five
    // widgets mounting this hook that would be five independent timers, drifting
    // out of phase on every remount. Exactly one caller polls.
    refetchInterval: poll ? 30_000 : false,
    refetchOnWindowFocus: poll,
  });

  useEffect(() => {
    if (!query.data) return;
    // <= (not <): on a same-millisecond collision, favor the write that's
    // already in the store over the polled value that raced it.
    if (query.data.startedAt <= useCreditsStore.getState().updatedAt) return;
    setBalance(query.data.balance);
  }, [query.data, setBalance]);

  useEffect(() => {
    if (query.isError) setError();
  }, [query.isError, setError]);

  // balance comes from the store because of the stale-write guard above — a
  // generation finishing mid-poll must win. planId and paymentFailed have no such
  // race (nothing in the client writes them), so they come straight off the shared
  // React Query cache entry.
  return {
    balance,
    status,
    planId: query.data?.planId ?? null,
    paymentFailed: query.data?.paymentFailed ?? false,
    refetch: () => { void query.refetch(); },
  };
}
