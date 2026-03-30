'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useUser } from '@/hooks/useUser';
import { useRouter, usePathname } from '@/i18n/routing';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { User, Globe, Sun, Moon, Monitor, LogOut, Shield, FileText, Pencil } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { toast } from 'sonner';

export default function SettingsPage(): React.ReactElement {
  const t = useTranslations('settings');
  const { profile, signOut } = useUser();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.name) setEditName(profile.name);
  }, [profile]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const formData = new FormData();
      if (editName !== profile?.name) formData.append('name', editName);
      const avatarInput = document.getElementById('avatar-upload') as HTMLInputElement;
      if (avatarInput?.files?.[0]) formData.append('avatar', avatarInput.files[0]);

      const res = await fetch('/api/user/profile', { method: 'PATCH', body: formData });
      const data = await res.json();
      if (data.success) {
        toast.success('تم تحديث الملف الشخصي');
        setEditing(false);
        window.location.reload();
      } else {
        toast.error(data.error || 'فشل التحديث');
      }
    } catch { toast.error('حدث خطأ في الشبكة'); } finally { setSaving(false); }
  };

  const currentLocale = pathname.startsWith('/en') ? 'en' : 'ar';
  const switchLocale = currentLocale === 'ar' ? 'en' : 'ar';

  const initials = profile?.name
    ? profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  const themes = [
    { id: 'light', label: t('light'), icon: Sun },
    { id: 'dark', label: t('dark'), icon: Moon },
    { id: 'system', label: t('system'), icon: Monitor },
  ] as const;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold font-cairo">{t('title')}</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" /> {t('profile')}
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="ms-auto text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            {editing ? (
              <div className="flex-1 space-y-3">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="الاسم"
                  className="max-w-xs"
                />
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="block text-sm text-[var(--color-text-secondary)] file:me-2 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:file:bg-primary-900/30"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'جاري الحفظ...' : 'حفظ'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                    إلغاء
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-lg">{profile?.name || '-'}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">{profile?.email || '-'}</p>
                <Badge variant="secondary" className="mt-1">{profile?.plan_id || 'free'}</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" /> {t('language')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {[
              { locale: 'ar', label: t('arabic') },
              { locale: 'en', label: t('english') },
            ].map(({ locale, label }) => (
              <button
                key={locale}
                onClick={() => router.replace(pathname, { locale: locale as 'ar' | 'en' })}
                className={cn(
                  'flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors',
                  currentLocale === locale
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'border-[var(--color-border)] hover:border-primary-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sun className="h-4 w-4" /> {t('theme')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {themes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTheme(id)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-2 rounded-lg border px-4 py-3 transition-colors',
                  theme === id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'border-[var(--color-border)] hover:border-primary-300'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Legal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> قانوني
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link href="/privacy" className="block text-sm text-primary-500 hover:underline">سياسة الخصوصية</Link>
          <Link href="/terms" className="block text-sm text-primary-500 hover:underline">شروط الاستخدام</Link>
        </CardContent>
      </Card>

      <Separator />

      {/* Logout */}
      <Button variant="destructive" onClick={signOut} className="gap-2 w-full">
        <LogOut className="h-4 w-4" />
        تسجيل الخروج
      </Button>
    </div>
  );
}
