import AdminLayout from '@/components/admin/AdminLayout';
import { ScrollText } from 'lucide-react';

export default function AdminLogsPage() {
  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-2">
        <ScrollText className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">Logs</h1>
      </div>
      <p className="text-slate-500">Coming in Phase 3 — Admin action logs and generation error logs.</p>
    </AdminLayout>
  );
}
