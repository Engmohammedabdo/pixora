'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AuthError({ error, reset }: ErrorProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
      <AlertTriangle className="h-12 w-12 text-[var(--color-error)]" />
      <h2 className="text-xl font-bold">حدث خطأ</h2>
      <p className="text-sm text-[var(--color-text-secondary)] text-center">
        {error.message || 'حدث خطأ أثناء المصادقة.'}
      </p>
      <Button onClick={reset} variant="outline">إعادة المحاولة</Button>
    </div>
  );
}
