import AdminLayout from '@/components/admin/AdminLayout';
import { Users } from 'lucide-react';

export default function AdminUsersPage() {
  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-2">
        <Users className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
      </div>
      <p className="text-slate-500">Coming in Phase 2 — User list with search, filters, and pagination.</p>
    </AdminLayout>
  );
}
