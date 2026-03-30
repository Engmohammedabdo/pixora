'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import SettingsToggle from '@/components/admin/SettingsToggle';
import { Settings, Save, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface FeatureFlags {
  maintenance_mode: boolean;
  registration_enabled: boolean;
  free_plan_enabled: boolean;
  referral_enabled: boolean;
  daily_bonus_enabled: boolean;
}

interface RateLimits {
  requests_per_minute: number;
  daily_generations: Record<string, number>;
}

interface AppConfig {
  watermark_text: string;
  default_locale: string;
}

const PLANS = ['free', 'starter', 'pro', 'business', 'agency'];

export default function AdminSettingsPage() {
  const [flags, setFlags] = useState<FeatureFlags>({
    maintenance_mode: false,
    registration_enabled: true,
    free_plan_enabled: true,
    referral_enabled: true,
    daily_bonus_enabled: true,
  });
  const [rateLimits, setRateLimits] = useState<RateLimits>({
    requests_per_minute: 10,
    daily_generations: { free: 10, starter: 50, pro: 100, business: 200, agency: 500 },
  });
  const [appConfig, setAppConfig] = useState<AppConfig>({
    watermark_text: 'PyraSuite',
    default_locale: 'ar',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.success) {
        setFlags(data.data.featureFlags);
        setRateLimits(data.data.rateLimits);
        setAppConfig(data.data.appConfig);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await Promise.all([
        fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group: 'feature_flags', value: flags }),
        }),
        fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group: 'rate_limits', value: rateLimits }),
        }),
        fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group: 'app_config', value: appConfig }),
        }),
      ]);
      setSaved(true);
      toast.success('Settings saved successfully');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  }

  function SaveButton() {
    return (
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All'}
      </button>
    );
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        </div>
        <SaveButton />
      </div>

      <div className="space-y-6">
        {/* Feature Flags */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Feature Flags</h2>
          </div>
          <div className="divide-y divide-slate-100 p-2">
            <SettingsToggle
              label="Maintenance Mode"
              description="Disables all studios. Shows maintenance message to users."
              checked={flags.maintenance_mode}
              onChange={(v) => setFlags({ ...flags, maintenance_mode: v })}
              dangerous
            />
            <SettingsToggle
              label="Registration Enabled"
              description="Allow new users to sign up."
              checked={flags.registration_enabled}
              onChange={(v) => setFlags({ ...flags, registration_enabled: v })}
            />
            <SettingsToggle
              label="Free Plan Enabled"
              description="Allow users to use the free tier."
              checked={flags.free_plan_enabled}
              onChange={(v) => setFlags({ ...flags, free_plan_enabled: v })}
            />
            <SettingsToggle
              label="Referral System"
              description="Enable invite friend, earn credits feature."
              checked={flags.referral_enabled}
              onChange={(v) => setFlags({ ...flags, referral_enabled: v })}
            />
            <SettingsToggle
              label="Daily Bonus"
              description="Give bonus credits for daily login."
              checked={flags.daily_bonus_enabled}
              onChange={(v) => setFlags({ ...flags, daily_bonus_enabled: v })}
            />
          </div>
        </div>

        {/* Rate Limits */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Rate Limits</h2>

          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Max Requests/Minute per User</p>
              <p className="text-xs text-slate-500">API rate limit for each user</p>
            </div>
            <input
              type="number"
              min={1}
              max={100}
              value={rateLimits.requests_per_minute}
              onChange={(e) => setRateLimits({ ...rateLimits, requests_per_minute: parseInt(e.target.value) || 10 })}
              className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-900">Daily Generation Limits by Plan</p>
            <div className="space-y-2">
              {PLANS.map(plan => (
                <div key={plan} className="flex items-center justify-between">
                  <label className="text-sm capitalize text-slate-600">{plan}</label>
                  <input
                    type="number"
                    min={0}
                    value={rateLimits.daily_generations[plan] || 0}
                    onChange={(e) => setRateLimits({
                      ...rateLimits,
                      daily_generations: { ...rateLimits.daily_generations, [plan]: parseInt(e.target.value) || 0 },
                    })}
                    className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* App Config */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">App Config</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Watermark Text</p>
                <p className="text-xs text-slate-500">Applied to free plan images</p>
              </div>
              <input
                type="text"
                value={appConfig.watermark_text}
                onChange={(e) => setAppConfig({ ...appConfig, watermark_text: e.target.value })}
                className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Default Locale</p>
                <p className="text-xs text-slate-500">Default language for new users</p>
              </div>
              <select
                value={appConfig.default_locale}
                onChange={(e) => setAppConfig({ ...appConfig, default_locale: e.target.value })}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ar">Arabic (ar)</option>
                <option value="en">English (en)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom save */}
      <div className="mt-6 flex justify-end">
        <SaveButton />
      </div>
    </AdminLayout>
  );
}
