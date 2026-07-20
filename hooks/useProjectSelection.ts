'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pyra.selectedProject';

/**
 * Shared state for the project (client workspace) a studio will file its output
 * into, plus the brand kit that project dictates.
 *
 * Extracted so all nine studios wire the selector identically — the alternative
 * was the same two useState lines and the same handler repeated in every page,
 * which is exactly how the studios drifted apart in the first place.
 */
export function useProjectSelection(): {
  projectId: string | null;
  projectBrandKitId: string | null;
  onProjectChange: (projectId: string | null, brandKitId: string | null) => void;
} {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectBrandKitId, setProjectBrandKitId] = useState<string | null>(null);

  // Restore the last choice so switching studio keeps the client context. Read in
  // an effect, not in useState's initialiser, because localStorage does not exist
  // during server rendering and would break hydration.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { projectId: string | null; brandKitId: string | null };
      if (saved?.projectId) {
        setProjectId(saved.projectId);
        setProjectBrandKitId(saved.brandKitId ?? null);
      }
    } catch {
      // Corrupt or unavailable storage is not worth failing the studio over.
    }
  }, []);

  const onProjectChange = useCallback((id: string | null, kitId: string | null): void => {
    setProjectId(id);
    setProjectBrandKitId(kitId);
    try {
      if (id) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ projectId: id, brandKitId: kitId }));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* ignore */ }
  }, []);

  return { projectId, projectBrandKitId, onProjectChange };
}
