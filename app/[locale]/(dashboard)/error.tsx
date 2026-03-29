'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
      <AlertTriangle className="h-12 w-12 text-[var(--color-error)]" />
      <h2 className="text-xl font-bold font-cairo">حدث خطأ غير متوقع</h2>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-md text-center">
        {error.message || 'حدث خطأ أثناء تحميل الصفحة. يرجى المحاولة مرة أخرى.'}
      </p>
      <Button onClick={reset} variant="outline">
        إعادة المحاولة
      </Button>
    </div>
  );
}
