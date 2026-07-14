'use client';
import { Toaster } from 'sonner';
import { useTheme } from 'next-themes';
import { useLocale } from 'next-intl';

export function ToastProvider(): React.ReactElement {
  const { resolvedTheme } = useTheme();
  const locale = useLocale();

  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    />
  );
}
