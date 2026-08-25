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
  /**
   * Which `brand_kits` columns the server refused, for a 400
   * `validation_error`. Empty for every other code.
   *
   * Without this a schema refusal is indistinguishable from a transport
   * failure at the call site, so both were reported as "we couldn't save it,
   * try again" — advice that cannot work, on a form whose only other exit
   * discards everything the customer filled in.
   */
  public readonly fields: readonly string[];

  constructor(code: string, options: { limit?: number; fields?: readonly string[] } = {}) {
    super(`brand_kit_request_failed: ${code}`);
    this.name = 'BrandKitError';
    this.code = code;
    this.limit = options.limit;
    this.fields = options.fields ?? [];
  }
}

/**
 * The `brand_kits` column names inside a 400's Zod issues.
 *
 * `error.issues` is returned verbatim as `details` by both routes; each issue's
 * `path` is the schema path, whose HEAD is the column. Read defensively — this
 * is a network payload, and a shape it does not match must degrade to "no
 * field named", never throw inside an error handler.
 */
function fieldsFromDetails(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  const out: string[] = [];
  for (const issue of details) {
    if (!issue || typeof issue !== 'object') continue;
    const path = (issue as { path?: unknown }).path;
    if (!Array.isArray(path) || path.length === 0) continue;
    const head = path[0];
    if (typeof head === 'string') out.push(head);
  }
  return out;
}

async function readError(res: Response): Promise<BrandKitError> {
  try {
    const json = (await res.json()) as { error?: string; limit?: number; details?: unknown };
    return new BrandKitError(json.error || 'request_failed', {
      limit: json.limit,
      fields: fieldsFromDetails(json.details),
    });
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
