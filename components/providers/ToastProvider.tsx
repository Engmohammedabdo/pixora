'use client';
import { Toaster } from 'sonner';

export function ToastProvider(): React.ReactElement {
  return <Toaster position="top-center" richColors closeButton dir="rtl" />;
}
