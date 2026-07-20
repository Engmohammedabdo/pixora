'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FolderOpen } from 'lucide-react';
import { Label } from '@/components/ui/label';

export interface ProjectOption {
  id: string;
  name: string;
  brandKitId: string | null;
}

interface Props {
  value: string | null;
  onChange: (projectId: string | null, brandKitId: string | null) => void;
  className?: string;
}

/**
 * Picks the client workspace a generation belongs to.
 *
 * This is the piece that gives projects their value. Without it a project is an
 * empty folder — nothing is ever filed into it. It also carries the project's
 * brand kit back to the caller, so switching client automatically switches the
 * colours, fonts and voice instead of relying on the user to remember.
 *
 * Renders nothing when the user has no projects, so it stays out of the way of
 * solo users who never create one.
 */
export function ProjectSelector({ value, onChange, className }: Props): React.ReactElement | null {
  const t = useTranslations('projects');
  // Unique per instance: a hardcoded id would collide if two selectors ever render
  // on one page, breaking the label association for screen readers.
  const selectId = useId();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/projects')
      .then(async (r) => {
        // A 500 resolves the promise — only a transport error rejects. Without
        // this check a failed request looked identical to "no projects yet".
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (!active) return;
        if (json?.success) setProjects(json.data.projects as ProjectOption[]);
        else setFailed(true);
      })
      .catch(() => {
        // Surface the failure instead of silently hiding: a vanished selector looks
        // identical to "you have no projects", so the user files work into the wrong
        // client without ever knowing the list failed to load.
        if (active) setFailed(true);
      })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  // Self-heal a stale selection.
  //
  // useProjectSelection restores the last project from localStorage, but that id
  // can outlive the project: it may have been deleted, or a different account may
  // have signed in on the same browser. The id is still sent with every generation,
  // so all nine studios answer 404 project_not_found — and because this component
  // renders nothing when the list is empty, there is no control left to clear it.
  // Reconciling against the freshly fetched list is what breaks that dead end.
  useEffect(() => {
    if (!loaded || !value) return;
    if (!projects.some((p) => p.id === value)) onChange(null, null);
  }, [loaded, projects, value, onChange]);

  if (failed) {
    return (
      <p className={className ? `${className} text-xs text-[var(--color-error)]` : 'text-xs text-[var(--color-error)]'}>
        {t('loadFailed')}
      </p>
    );
  }

  if (!loaded || projects.length === 0) return null;

  return (
    <div className={className}>
      <Label htmlFor={selectId} className="flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-primary-500" />
        {t('assignTo')}
      </Label>
      <select
        id={selectId}
        value={value ?? ''}
        onChange={(e) => {
          const id = e.target.value || null;
          const picked = projects.find((p) => p.id === id);
          onChange(id, picked?.brandKitId ?? null);
        }}
        className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <option value="">{t('unassigned')}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}
