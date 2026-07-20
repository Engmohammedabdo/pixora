'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FolderOpen } from 'lucide-react';

interface ProjectOption {
  id: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Filters the asset library down to one client workspace.
 *
 * Kept separate from ProjectSelector: that one picks where NEW work is filed and
 * carries a brand kit with it, this one only narrows an existing list and adds an
 * "unassigned" bucket for work created before projects existed.
 *
 * Renders nothing when the user has no projects.
 */
export function AssetProjectFilter({ value, onChange }: Props): React.ReactElement | null {
  const t = useTranslations('projects');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/projects')
      .then((r) => r.json())
      .then((json) => {
        if (active && json?.success) setProjects(json.data.projects as ProjectOption[]);
      })
      .catch(() => { /* filter is optional — leaving it out shows everything */ })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  if (!loaded || projects.length === 0) return null;

  return (
    <div className="mb-3 flex items-center gap-2">
      <label htmlFor="asset-project-filter" className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
        <FolderOpen className="h-4 w-4 text-primary-500" />
        {t('filterByProject')}
      </label>
      <select
        id="asset-project-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <option value="all">{t('allProjects')}</option>
        <option value="unassigned">{t('unassigned')}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}
