import AdminLayout from '@/components/admin/AdminLayout';
import { Palette } from 'lucide-react';

export default function AdminGenerationsPage() {
  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-2">
        <Palette className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">Generations</h1>
      </div>
      <p className="text-slate-500">Coming in Phase 2 — All generations with filters, expandable rows, and output preview.</p>
    </AdminLayout>
  );
}
