'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function LocaleNotFound(): React.ReactElement {
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="text-center max-w-md mx-auto">
        <h1 className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500 mb-4">
          404
        </h1>
        <h2 className="text-2xl font-semibold text-white mb-2">
          {isAr ? 'الصفحة غير موجودة' : 'Page Not Found'}
        </h2>
        <p className="text-gray-400 mb-8">
          {isAr
            ? 'الصفحة اللي تدور عليها مش موجودة أو تم نقلها'
            : "The page you're looking for doesn't exist or has been moved"}
        </p>
        <Link
          href={`/${locale}/dashboard`}
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium hover:from-orange-600 hover:to-amber-600 transition-all"
        >
          {isAr ? 'الصفحة الرئيسية' : 'Go to Dashboard'}
        </Link>
      </div>
    </div>
  );
}
