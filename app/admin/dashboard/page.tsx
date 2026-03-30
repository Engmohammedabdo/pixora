import AdminLayout from '@/components/admin/AdminLayout';
import { LayoutDashboard } from 'lucide-react';

export default function AdminDashboardPage() {
  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-2">
        <LayoutDashboard className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      </div>
      <p className="text-slate-500">Coming in Phase 2 — KPI cards, charts, and recent activity tables.</p>
    </AdminLayout>
  );
}
