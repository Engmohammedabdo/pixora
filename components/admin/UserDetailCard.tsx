'use client';

import { ExternalLink, CreditCard, Calendar, Shield, ShieldOff } from 'lucide-react';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  plan_id: string;
  credits_balance: number;
  purchased_credits: number;
  banned: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  stats?: {
    generations: number;
    transactions: number;
    brandKits: number;
    assets: number;
  };
}

const planColors: Record<string, string> = {
  free: 'bg-slate-100 text-slate-700',
  starter: 'bg-blue-100 text-blue-700',
  pro: 'bg-indigo-100 text-indigo-700',
  business: 'bg-purple-100 text-purple-700',
  agency: 'bg-amber-100 text-amber-700',
};

interface UserDetailCardProps {
  user: UserProfile;
  onAdjustCredits: () => void;
  onChangePlan: (plan: string) => void;
  onToggleBan: () => void;
  onDelete: () => void;
}

export default function UserDetailCard({
  user,
  onAdjustCredits,
  onChangePlan,
  onToggleBan,
  onDelete,
}: UserDetailCardProps) {
  const totalCredits = user.credits_balance + (user.purchased_credits || 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 sm:flex-row">
        {/* Avatar */}
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-600">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar_url}
              alt={user.name || 'User'}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            (user.name || 'U').charAt(0).toUpperCase()
          )}
        </div>

        {/* Info */}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">{user.name || 'Unnamed'}</h2>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${planColors[user.plan_id] || planColors.free}`}>
              {user.plan_id}
            </span>
            {user.banned && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                Banned
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-slate-500">{user.email}</p>

          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1">
              <CreditCard className="h-4 w-4 text-slate-400" />
              {user.credits_balance} monthly + {user.purchased_credits || 0} purchased = {totalCredits} total
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-slate-400" />
              Joined {new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {/* Stripe links */}
          {(user.stripe_customer_id || user.stripe_subscription_id) && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {user.stripe_customer_id && (
                <a
                  href={`https://dashboard.stripe.com/customers/${user.stripe_customer_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-indigo-600 hover:underline"
                >
                  Stripe Customer <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {user.stripe_subscription_id && (
                <a
                  href={`https://dashboard.stripe.com/subscriptions/${user.stripe_subscription_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-indigo-600 hover:underline"
                >
                  Subscription <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {user.banned && user.ban_reason && (
            <div className="mt-2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
              Ban reason: {user.ban_reason}
            </div>
          )}

          {/* Stats */}
          {user.stats && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>{user.stats.generations} generations</span>
              <span>{user.stats.transactions} transactions</span>
              <span>{user.stats.brandKits} brand kits</span>
              <span>{user.stats.assets} assets</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <button
          onClick={onAdjustCredits}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Adjust Credits
        </button>

        <select
          value={user.plan_id}
          onChange={(e) => onChangePlan(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-indigo-500"
        >
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="business">Business</option>
          <option value="agency">Agency</option>
        </select>

        <button
          onClick={onToggleBan}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            user.banned
              ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
              : 'border-amber-200 text-amber-700 hover:bg-amber-50'
          }`}
        >
          {user.banned ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
          {user.banned ? 'Unban' : 'Ban'}
        </button>

        <button
          onClick={onDelete}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}
