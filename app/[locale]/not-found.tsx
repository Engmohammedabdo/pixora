'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/**
 * Renders only when a page UNDER [locale] calls notFound() — e.g. an unknown
 * /studios/<slug>. An unmatched URL never enters this segment and gets
 * app/not-found.tsx instead; the note there explains why.
 *
 * The Arabic copy follows the product's register rule: clear professional
 * Arabic, no Egyptian or Gulf colloquial. It read "اللي تدور عليها مش موجودة"
 * until 2026-09-11. These literals are baselined debt under
 * `no-arabic-literals-in-tsx`, keyed on the trimmed line text, so rewording one
 * moves its key in scripts/invariants-baseline.json.
 */
export default function LocaleNotFound(): React.ReactElement {
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
      <div className="text-center max-w-md mx-auto">
        <h1 className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-500 to-accent-500 mb-4">
          404
        </h1>
        <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-2">
          {isAr ? 'الصفحة غير موجودة' : 'Page Not Found'}
        </h2>
        <p className="text-[var(--color-text-secondary)] mb-8">
          {isAr
            ? 'الصفحة التي تبحث عنها غير موجودة أو تم نقلها'
            : "The page you're looking for doesn't exist or has been moved"}
        </p>
        <Link
          href={`/${locale}/dashboard`}
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium hover:from-primary-600 hover:to-accent-600 transition-all"
        >
          {isAr ? 'الصفحة الرئيسية' : 'Go to Dashboard'}
        </Link>
      </div>
    </div>
  );
}
