import AdminLayout from '@/components/admin/AdminLayout';
import { Bot } from 'lucide-react';

export default function AdminModelsPage() {
  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-2">
        <Bot className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">AI Models</h1>
      </div>
      <p className="text-slate-500">Coming in Phase 3 — Model enable/disable, fallback order, stats, and testing.</p>
    </AdminLayout>
  );
}
