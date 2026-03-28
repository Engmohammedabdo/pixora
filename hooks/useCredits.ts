'use client';

import { useQuery } from '@tanstack/react-query';
import { useCreditsStore } from '@/store/credits';
import { useEffect } from 'react';

interface CreditBalanceResponse {
  success: boolean;
  data?: {
    balance: number;
    planId: string;
  };
}

export function useCredits(): {
  balance: number;
  loading: boolean;
  refetch: () => void;
} {
  const { balance, setBalance, loading } = useCreditsStore();

  const query = useQuery<CreditBalanceResponse>({
    queryKey: ['credits-balance'],
    queryFn: async () => {
      const res = await fetch('/api/credits/balance');
      if (!res.ok) throw new Error('Failed to fetch credits');
      return res.json() as Promise<CreditBalanceResponse>;
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (query.data?.success && query.data.data) {
      setBalance(query.data.data.balance);
    }
  }, [query.data, setBalance]);

  return {
    balance,
    loading: loading || query.isLoading,
    refetch: () => { query.refetch(); },
  };
}
