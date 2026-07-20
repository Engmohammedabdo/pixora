'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { reportClientError } from '@/lib/report-client-error';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  // Ref (not state) survives React StrictMode's dev-only double effect
  // invocation without re-running for the same error, while still firing
  // again for a genuinely new error object after a retry.
  const reportedErrorRef = useRef<Error | null>(null);

  useEffect(() => {
    if (reportedErrorRef.current === error) return;
    reportedErrorRef.current = error;
    reportClientError(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-6">
        <div className="text-center space-y-4 max-w-md">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold">حدث خطأ غير متوقع</h1>
          <p className="text-[var(--color-text-muted)]">
            {error.message || 'نعتذر عن هذا الخطأ. يرجى المحاولة مرة أخرى.'}
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={reset}>إعادة المحاولة</Button>
            <Button variant="outline" asChild>
              <Link href="/ar">العودة للرئيسية</Link>
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
