import AdminLayout from '@/components/admin/AdminLayout';
import { Settings } from 'lucide-react';

export default function AdminSettingsPage() {
  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-2">
        <Settings className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      </div>
      <p className="text-slate-500">Coming in Phase 3 — Feature flags, rate limits, and app config.</p>
    </AdminLayout>
  );
}
