import AdminLayout from '@/components/admin/AdminLayout';
import { FileText } from 'lucide-react';

export default function AdminPromptsPage() {
  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-2">
        <FileText className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">Prompts</h1>
      </div>
      <p className="text-slate-500">Coming in Phase 3 — System prompt overrides per studio.</p>
    </AdminLayout>
  );
}
