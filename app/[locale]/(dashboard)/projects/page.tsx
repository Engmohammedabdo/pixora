'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/routing';
import { Plus, FolderOpen, Calendar, Trash2, Palette, Pencil } from 'lucide-react';
import { useBrandKits } from '@/hooks/useBrandKit';

interface Project {
  id: string;
  name: string;
  brandKitId: string | null;
  generationCount: number;
  createdAt: string;
}

export default function ProjectsPage(): React.ReactElement {
  const t = useTranslations();
  const tProjects = useTranslations('projects');
  const locale = useLocale();

  const [projects, setProjects] = useState<Project[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBrandKitId, setNewBrandKitId] = useState<string>('');
  // null = create mode; a project = edit mode. Same dialog serves both.
  const [editing, setEditing] = useState<Project | null>(null);
  const { brandKits } = useBrandKits();

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/projects');
      const json = await res.json();
      if (json?.success) {
        setProjects(json.data.projects as Project[]);
        setLimit(json.data.limit as number);
      }
    } catch {
      toast.error(tProjects('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [tProjects]);

  useEffect(() => { void load(); }, [load]);

  const atLimit = limit !== null && projects.length >= limit;

  const handleCreate = async (): Promise<void> => {
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, brandKitId: newBrandKitId || null }),
      });
      const json = await res.json();

      if (!json?.success) {
        // The limit is the upgrade moment — say what the limit is and link to billing
        // rather than showing a dead-end error.
        if (json?.error === 'project_limit_reached') {
          toast.error(tProjects('limitReached', { limit: json.limit }));
        } else {
          toast.error(tProjects('createFailed'));
        }
        return;
      }

      setProjects((prev) => [json.data as Project, ...prev]);
      setNewName('');
      setNewBrandKitId('');
      setShowCreate(false);
      toast.success(tProjects('created'));
    } catch {
      toast.error(tProjects('createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (project: Project): void => {
    setEditing(project);
    setNewName(project.name);
    setNewBrandKitId(project.brandKitId ?? '');
    setShowCreate(true);
  };

  const handleUpdate = async (): Promise<void> => {
    if (!editing) return;
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, brandKitId: newBrandKitId || null }),
      });
      const json = await res.json();
      if (!json?.success) {
        toast.error(tProjects('updateFailed'));
        return;
      }
      setProjects((prev) => prev.map((p) => (
        p.id === editing.id ? { ...p, name: json.data.name, brandKitId: json.data.brandKitId } : p
      )));
      closeDialog();
      toast.success(tProjects('updated'));
    } catch {
      toast.error(tProjects('updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const closeDialog = (): void => {
    setShowCreate(false);
    setEditing(null);
    setNewName('');
    setNewBrandKitId('');
  };

  const handleDelete = async (project: Project): Promise<void> => {
    if (!confirm(tProjects('confirmDelete', { name: project.name }))) return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json?.success) {
        toast.error(tProjects('deleteFailed'));
        return;
      }
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      // Drop the saved selection if it pointed at this project, so the studios do
      // not keep sending a project id that no longer exists.
      try {
        const raw = window.localStorage.getItem('pyra.selectedProject');
        if (raw && (JSON.parse(raw) as { projectId?: string }).projectId === project.id) {
          window.localStorage.removeItem('pyra.selectedProject');
        }
      } catch { /* ignore */ }
      toast.success(tProjects('deleted'));
    } catch {
      toast.error(tProjects('deleteFailed'));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-cairo">{t('nav.projects')}</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">{tProjects('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {limit !== null && (
            <span className="text-sm text-[var(--color-text-muted)] tabular-nums">
              {projects.length} / {limit}
            </span>
          )}
          <Button onClick={() => { setEditing(null); setNewName(''); setNewBrandKitId(''); setShowCreate(true); }} disabled={loading || atLimit}>
            <Plus className="h-4 w-4 me-2" />{t('common.create')}
          </Button>
        </div>
      </div>

      {atLimit && (
        <Card className="border-primary-300 bg-primary-50/60 dark:bg-primary-900/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">{tProjects('limitReached', { limit: limit ?? 0 })}</p>
            <Button asChild size="sm"><Link href="/billing">{tProjects('upgrade')}</Link></Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-28 animate-pulse bg-[var(--color-surface-2)]" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-[var(--color-text-muted)]">
          <FolderOpen className="h-16 w-16 mb-4" />
          <h3 className="text-lg font-medium mb-1">{tProjects('empty')}</h3>
          <p className="text-sm mb-4">{tProjects('emptyDescription')}</p>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 me-2" />{t('common.create')}</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-primary-500 shrink-0" />
                  <span className="break-words">{project.name}</span>
                </CardTitle>
                <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={tProjects('editProject', { name: project.name })}
                  onClick={() => openEdit(project)}
                  className="text-[var(--color-text-muted)] hover:text-primary-500"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={tProjects('deleteProject', { name: project.name })}
                  onClick={() => void handleDelete(project)}
                  className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                <Badge variant="secondary">{tProjects('generationCount', { count: project.generationCount })}</Badge>
                {project.brandKitId && (
                  <span className="flex items-center gap-1"><Palette className="h-3 w-3" />{tProjects('hasBrandKit')}</span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(project.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-AE')}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) closeDialog(); else setShowCreate(true); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? tProjects('editProject', { name: editing.name }) : tProjects('newProject')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={tProjects('projectName')}
              maxLength={80}
              onKeyDown={(e) => { if (e.key === 'Enter') void (editing ? handleUpdate() : handleCreate()); }}
            />
            {(brandKits.length > 0 || editing) && (
              <div className="space-y-2">
                <label htmlFor="project-brand-kit" className="text-sm font-medium">
                  {tProjects('brandKit')}
                </label>
                <select
                  id="project-brand-kit"
                  value={newBrandKitId}
                  onChange={(e) => setNewBrandKitId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  <option value="">{tProjects('noBrandKit')}</option>
                  {brandKits.map((k) => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {brandKits.length === 0 ? (
                    <Link href="/brand-kit" className="text-primary-500 hover:underline">{tProjects('createBrandKitFirst')}</Link>
                  ) : tProjects('brandKitHint')}
                </p>
              </div>
            )}
            <Button
              onClick={() => void (editing ? handleUpdate() : handleCreate())}
              disabled={!newName.trim() || saving}
              className="w-full"
            >
              {saving ? '…' : editing ? t('common.save') : t('common.create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
