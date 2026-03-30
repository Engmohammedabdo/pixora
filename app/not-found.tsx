import Link from 'next/link';

export default function NotFound(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="text-center max-w-md mx-auto">
        <h1 className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500 mb-4">
          404
        </h1>
        <h2 className="text-2xl font-semibold text-white mb-2">
          الصفحة غير موجودة
        </h2>
        <p className="text-gray-400 mb-2">
          الصفحة اللي تدور عليها مش موجودة أو تم نقلها
        </p>
        <p className="text-gray-500 text-sm mb-8">
          Page not found — The page you&apos;re looking for doesn&apos;t exist
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/ar"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium hover:from-orange-600 hover:to-amber-600 transition-all"
          >
            الصفحة الرئيسية
          </Link>
          <Link
            href="/en"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-gray-700 text-gray-300 font-medium hover:border-gray-500 hover:text-white transition-all"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
