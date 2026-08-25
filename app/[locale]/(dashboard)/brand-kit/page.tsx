'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import Image from 'next/image';
import { useBrandKits, useCreateBrandKit, useUpdateBrandKit, useDeleteBrandKit, BrandKitError } from '@/hooks/useBrandKit';
import { BrandKitForm } from '@/components/brand-kit/BrandKitForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, Star, Palette } from 'lucide-react';
import type { BrandKit } from '@/lib/supabase/types';

export default function BrandKitPage(): React.ReactElement {
  const t = useTranslations('brandKit');
  const { brandKits, loading } = useBrandKits();
  const { createBrandKit, loading: creating } = useCreateBrandKit();
  const { updateBrandKit, loading: updating } = useUpdateBrandKit();
  const { deleteBrandKit, loading: deleting } = useDeleteBrandKit();

  const [showCreate, setShowCreate] = useState(false);
  const [editingKit, setEditingKit] = useState<BrandKit | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Every constraint 042 and 045 can trip, mapped by app/api/brand-kits'
  // mapBrandKitCheckViolation. Kept as a lookup rather than an if-chain because
  // that function can grow without this switch needing a new branch shape.
  const ERROR_MESSAGE_KEYS: Record<string, string> = {
    invalid_logo_url: 'invalidLogo',
    invalid_website_url: 'invalidWebsiteUrl',
    invalid_industry: 'invalidIndustry',
    invalid_description: 'invalidDescription',
    invalid_target_audience: 'invalidTargetAudience',
    invalid_city: 'invalidCity',
  };

  // Every mutation below used to be awaited with no catch, so a rejected
  // request became an unhandled promise rejection: the dialog stayed open with
  // no message and the user had no way to learn what was wrong.
  const reportFailure = (error: unknown, fallbackKey: string): void => {
    const code = error instanceof BrandKitError ? error.code : 'request_failed';
    if (code === 'brand_kit_limit_reached') {
      const limit = error instanceof BrandKitError ? error.limit : undefined;
      toast.error(t('limitReached', { limit: limit ?? '' }));
      return;
    }
    const messageKey = ERROR_MESSAGE_KEYS[code];
    toast.error(t(messageKey ?? fallbackKey));
  };

  const handleCreate = async (data: Partial<BrandKit>): Promise<void> => {
    try {
      await createBrandKit(data);
      setShowCreate(false);
      toast.success(t('created'));
    } catch (error) {
      reportFailure(error, 'saveFailed');
    }
  };

  const handleUpdate = async (data: Partial<BrandKit>): Promise<void> => {
    if (!editingKit) return;
    try {
      await updateBrandKit(editingKit.id, data);
      setEditingKit(null);
      toast.success(t('updated'));
    } catch (error) {
      reportFailure(error, 'saveFailed');
    }
  };

  const handleDelete = (id: string): void => {
    setDeleteId(id);
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleteId) return;
    try {
      await deleteBrandKit(deleteId);
      setDeleteId(null);
    } catch (error) {
      reportFailure(error, 'deleteFailed');
    }
  };

  const handleSetDefault = async (kit: BrandKit): Promise<void> => {
    try {
      await updateBrandKit(kit.id, { is_default: true });
    } catch (error) {
      reportFailure(error, 'saveFailed');
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-cairo">{t('title')}</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 me-2" />
          {t('create')}
        </Button>
      </div>

      {brandKits.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Palette className="h-12 w-12 mx-auto text-[var(--color-text-muted)] mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('empty')}</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {t('emptyDescription')}
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 me-2" />
              {t('create')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brandKits.map((kit) => (
            <Card key={kit.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* The logo had no reader anywhere in the product: it was
                        uploaded, saved, and never displayed. It still does not
                        reach any model — see brandKit.emptyDescription — but it
                        does now identify the kit in the list. */}
                    {kit.logo_url && (
                      <Image
                        src={kit.logo_url}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 shrink-0 rounded object-contain border p-0.5"
                        unoptimized
                      />
                    )}
                    <CardTitle className="text-base truncate">{kit.name}</CardTitle>
                  </div>
                  {kit.is_default && (
                    <Badge variant="default" className="text-xs shrink-0">
                      <Star className="h-3 w-3 me-1" />
                      {t('isDefault')}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Color swatches */}
                <div className="flex gap-2">
                  <div
                    className="h-8 w-8 rounded-full border"
                    style={{ backgroundColor: kit.primary_color }}
                    title={kit.primary_color}
                  />
                  <div
                    className="h-8 w-8 rounded-full border"
                    style={{ backgroundColor: kit.secondary_color }}
                    title={kit.secondary_color}
                  />
                  <div
                    className="h-8 w-8 rounded-full border"
                    style={{ backgroundColor: kit.accent_color }}
                    title={kit.accent_color}
                  />
                </div>

                {/* Fonts */}
                <p className="text-xs text-[var(--color-text-muted)]">
                  {kit.font_primary} / {kit.font_secondary}
                </p>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {!kit.is_default && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetDefault(kit)}
                    >
                      <Star className="h-3 w-3 me-1" />
                      {t('setDefault')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditingKit(kit)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(kit.id)}
                    disabled={deleting}
                    className="text-[var(--color-error)]"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('create')}</DialogTitle>
          </DialogHeader>
          {/* Mounted only while open, same as the Edit dialog below — the form
              owns no reset logic, so a form kept mounted across closes would
              show the last kit's business fields the next time this opens. */}
          {showCreate && <BrandKitForm onSubmit={handleCreate} loading={creating} />}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingKit} onOpenChange={() => setEditingKit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingKit?.name}</DialogTitle>
          </DialogHeader>
          {editingKit && (
            <BrandKitForm
              initialData={editingKit}
              onSubmit={handleUpdate}
              loading={updating}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('delete')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--color-text-secondary)]">{t('deleteConfirm')}</p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {t('delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
