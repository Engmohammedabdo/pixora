'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/lib/supabase/types';

export const USER_QUERY_KEY = ['auth-user'] as const;

interface UserQueryData {
  user: User | null;
  profile: Profile | null;
}

interface UseUserReturn {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isError: boolean;
  refetch: () => void;
  signOut: () => Promise<void>;
}

async function fetchUserAndProfile(
  supabase: ReturnType<typeof createBrowserClient>
): Promise<UserQueryData> {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .single();

  return { user: authUser, profile };
}

// useUser() is mounted in ~18 components at once on a busy page (layout chrome,
// widgets, and the page itself). Each used to run its own getUser() call, its own
// profiles select, AND its own onAuthStateChange subscription — the same work
// duplicated up to 18x, and 18 independent chances to hit a rate limit. React
// Query's cache collapses the fetches to one shared entry (below). This module
// -scoped, reference-counted guard collapses the subscriptions to one too — it is
// intentionally NOT tied to any single component's mount/unmount, because with 18
// mounting instances the first-to-mount / last-to-unmount is not a stable choice.
let authListenerRefCount = 0;
let authListenerCleanup: (() => void) | null = null;

function ensureAuthListener(
  supabase: ReturnType<typeof createBrowserClient>,
  queryClient: QueryClient
): () => void {
  authListenerRefCount += 1;

  if (!authListenerCleanup) {
    // Undefined until the first delivery. supabase-js sends INITIAL_SESSION to
    // every new subscriber as part of subscribing — it carries no new information
    // (the query already fetched the current user) and must be treated as a
    // baseline, not a change, or every page load would double its requests.
    let lastUserId: string | null | undefined;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user?.id ?? null;
      const previousId = lastUserId;
      lastUserId = nextId;

      if (previousId === undefined) return; // INITIAL_SESSION baseline, not a change
      // TOKEN_REFRESHED never changes who is signed in. SIGNED_OUT is filtered
      // separately: our own signOut() below hard-navigates immediately after
      // calling supabase.auth.signOut(), and invalidating here would fire an
      // authenticated query at a cookie jar that's mid-teardown, producing 401s
      // for no benefit (the page is about to be torn down anyway).
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') return;
      if (nextId === previousId) return; // no actual identity change

      void queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY });
    });

    authListenerCleanup = () => subscription.unsubscribe();
  }

  return () => {
    authListenerRefCount -= 1;
    if (authListenerRefCount === 0 && authListenerCleanup) {
      authListenerCleanup();
      authListenerCleanup = null;
    }
  };
}

export function useUser(): UseUserReturn {
  const supabase = useMemo(() => createBrowserClient(), []);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: USER_QUERY_KEY,
    queryFn: () => fetchUserAndProfile(supabase),
  });

  useEffect(() => ensureAuthListener(supabase, queryClient), [supabase, queryClient]);

  // C6: Use current locale instead of hardcoded /ar/
  const signOut = useCallback(async (): Promise<void> => {
    // Clear the saved client workspace: on a shared browser it would otherwise
    // carry into the next account and break every studio with a 404.
    try { window.localStorage.removeItem('pyra.selectedProject'); } catch { /* ignore */ }
    await supabase.auth.signOut();
    // Hard navigation tears down the whole React tree, including the
    // QueryClient, so there is no stale cache left to clear afterward — and
    // calling queryClient.clear() here would be actively harmful, since any
    // observer still alive during the redirect would rebuild and refetch
    // against a session that no longer exists.
    const locale = window.location.pathname.split('/')[1] || 'ar';
    window.location.href = `/${locale}/login`;
  }, [supabase]);

  return {
    user: query.data?.user ?? null,
    profile: query.data?.profile ?? null,
    loading: query.isPending,
    isError: query.isError,
    refetch: () => { void query.refetch(); },
    signOut,
  };
}
