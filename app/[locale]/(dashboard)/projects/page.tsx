'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, FolderOpen, Calendar } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  generationCount: number;
  createdAt: string;
}

export default function ProjectsPage(): React.ReactElement {
  const t = useTranslations();
  const tProjects = useTranslations('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = (): void => {
    if (!newName.trim()) return;
    setProjects((prev) => [...prev, { id: crypto.randomUUID(), name: newName, generationCount: 0, createdAt: new Date().toISOString() }]);
    setNewName('');
    setShowCreate(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-cairo">{t('nav.projects')}</h1>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 me-2" />{t('common.create')}</Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-[var(--color-text-muted)]">
          <FolderOpen className="h-16 w-16 mb-4" />
          <h3 className="text-lg font-medium mb-1">{tProjects('empty')}</h3>
          <p className="text-sm mb-4">{tProjects('emptyDescription')}</p>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 me-2" />{t('common.create')}</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><FolderOpen className="h-4 w-4 text-primary-500" />{project.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
                <Badge variant="secondary">{project.generationCount} {tProjects('generations')}</Badge>
                <div className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(project.createdAt).toLocaleDateString('ar-SA')}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{tProjects('newProject')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={tProjects('projectName')} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
            <Button onClick={handleCreate} disabled={!newName.trim()} className="w-full">{t('common.create')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
