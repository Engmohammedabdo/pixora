import React from 'react';
import Link from 'next/link';
import './globals.css';

export default function NotFound(): React.ReactElement {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="text-center max-w-md mx-auto">
        <h1 className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-500 to-accent-500 mb-4">
          404
        </h1>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
          الصفحة غير موجودة
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-2">
          الصفحة اللي تدور عليها مش موجودة أو تم نقلها
        </p>
        <p className="text-slate-500 text-sm mb-8">
          Page not found — The page you&apos;re looking for doesn&apos;t exist
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/ar"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium hover:from-primary-600 hover:to-accent-600 transition-all"
          >
            الصفحة الرئيسية
          </Link>
          <Link
            href="/en"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white transition-all"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
