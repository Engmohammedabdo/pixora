'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorProps): React.ReactElement {
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';

  useEffect(() => {
    // Log for diagnostics — never shown to the user
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
      <AlertTriangle className="h-12 w-12 text-[var(--color-error)]" />
      <h2 className="text-xl font-bold font-cairo">
        {isAr ? 'حدث خطأ غير متوقع' : 'Something went wrong'}
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-md text-center">
        {isAr
          ? 'حدث خطأ أثناء تحميل الصفحة. يرجى المحاولة مرة أخرى.'
          : 'An error occurred while loading the page. Please try again.'}
      </p>
      <Button onClick={reset} variant="outline">
        {isAr ? 'إعادة المحاولة' : 'Try Again'}
      </Button>
    </div>
  );
}
