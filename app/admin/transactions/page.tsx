import AdminLayout from '@/components/admin/AdminLayout';
import { CreditCard } from 'lucide-react';

export default function AdminTransactionsPage() {
  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-2">
        <CreditCard className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
      </div>
      <p className="text-slate-500">Coming in Phase 2 — Credit transactions with filters and manual adjustment.</p>
    </AdminLayout>
  );
}
