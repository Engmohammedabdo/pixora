'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BrandKit } from '@/lib/supabase/types';

interface BrandKitResponse {
  success: boolean;
  data?: BrandKit[];
}

interface SingleBrandKitResponse {
  success: boolean;
  data?: BrandKit;
}

/**
 * Carries the server's error code to the caller.
 *
 * These mutations used to throw `new Error('Failed to create brand kit')` and
 * the page awaited them without a catch, so a 400 produced an unhandled
 * rejection and nothing on screen: the dialog stayed open, the button
 * re-enabled, and the user was never told why. Two real 400s hid behind that —
 * `brand_kit_limit_reached` and, until this release, a validation error on the
 * null `logo_url` the form sends whenever no logo was chosen.
 */
export class BrandKitError extends Error {
  public readonly code: string;
  public readonly limit?: number;

  constructor(code: string, limit?: number) {
    super(`brand_kit_request_failed: ${code}`);
    this.name = 'BrandKitError';
    this.code = code;
    this.limit = limit;
  }
}

async function readError(res: Response): Promise<BrandKitError> {
  try {
    const json = (await res.json()) as { error?: string; limit?: number };
    return new BrandKitError(json.error || 'request_failed', json.limit);
  } catch {
    return new BrandKitError('request_failed');
  }
}

export function useBrandKits(): {
  brandKits: BrandKit[];
  loading: boolean;
  defaultKit: BrandKit | undefined;
  refetch: () => void;
} {
  const query = useQuery<BrandKitResponse>({
    queryKey: ['brand-kits'],
    queryFn: async () => {
      const res = await fetch('/api/brand-kits');
      if (!res.ok) throw new Error('Failed to fetch brand kits');
      return res.json() as Promise<BrandKitResponse>;
    },
  });

  const brandKits = query.data?.data || [];
  const defaultKit = brandKits.find((kit) => kit.is_default) || brandKits[0];

  return {
    brandKits,
    loading: query.isLoading,
    defaultKit,
    refetch: () => { query.refetch(); },
  };
}

export function useCreateBrandKit(): {
  createBrandKit: (data: Partial<BrandKit>) => Promise<BrandKit | undefined>;
  loading: boolean;
} {
  const queryClient = useQueryClient();

  const mutation = useMutation<SingleBrandKitResponse, Error, Partial<BrandKit>>({
    mutationFn: async (data) => {
      const res = await fetch('/api/brand-kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await readError(res);
      return res.json() as Promise<SingleBrandKitResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
    },
  });

  return {
    createBrandKit: async (data) => {
      const result = await mutation.mutateAsync(data);
      return result.data;
    },
    loading: mutation.isPending,
  };
}

export function useUpdateBrandKit(): {
  updateBrandKit: (id: string, data: Partial<BrandKit>) => Promise<BrandKit | undefined>;
  loading: boolean;
} {
  const queryClient = useQueryClient();

  const mutation = useMutation<SingleBrandKitResponse, Error, { id: string; data: Partial<BrandKit> }>({
    mutationFn: async ({ id, data }) => {
      const res = await fetch(`/api/brand-kits/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await readError(res);
      return res.json() as Promise<SingleBrandKitResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
    },
  });

  return {
    updateBrandKit: async (id, data) => {
      const result = await mutation.mutateAsync({ id, data });
      return result.data;
    },
    loading: mutation.isPending,
  };
}

export function useDeleteBrandKit(): {
  deleteBrandKit: (id: string) => Promise<void>;
  loading: boolean;
} {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/brand-kits/${id}`, { method: 'DELETE' });
      if (!res.ok) throw await readError(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
    },
  });

  return {
    deleteBrandKit: async (id) => { await mutation.mutateAsync(id); },
    loading: mutation.isPending,
  };
}
