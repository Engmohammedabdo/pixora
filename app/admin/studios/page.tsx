import AdminLayout from '@/components/admin/AdminLayout';
import { SlidersHorizontal } from 'lucide-react';

export default function AdminStudiosPage() {
  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-2">
        <SlidersHorizontal className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">Studios</h1>
      </div>
      <p className="text-slate-500">Coming in Phase 3 — Studio enable/disable, credit cost overrides.</p>
    </AdminLayout>
  );
}
