import Link from 'next/link';

export default function AdminNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-2 text-6xl font-bold text-slate-700">404</h1>
        <h2 className="mb-2 text-xl font-bold text-white">Page Not Found</h2>
        <p className="mb-6 text-sm text-slate-400">
          The admin page you are looking for does not exist.
        </p>
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
