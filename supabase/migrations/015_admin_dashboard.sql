-- Migration 015: Admin Dashboard Support
-- Apply via Supabase SQL Editor or scripts/apply-migrations.sh

-- System Settings (key-value store for admin overrides)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'admin'
);

-- Seed defaults
INSERT INTO system_settings (key, value) VALUES
  ('studio_config', '{}'),
  ('model_config', '{"enabled": ["gemini", "gpt", "flux"], "fallback_order": ["gemini", "gpt", "flux"]}'),
  ('prompt_overrides', '{}'),
  ('feature_flags', '{"maintenance_mode": false, "registration_enabled": true, "free_plan_enabled": true, "referral_enabled": true, "daily_bonus_enabled": true}'),
  ('rate_limits', '{"requests_per_minute": 10, "daily_generations": {"free": 10, "starter": 50, "pro": 100, "business": 200, "agency": 500}}'),
  ('app_config', '{"watermark_text": "PyraSuite", "default_locale": "ar"}')
ON CONFLICT (key) DO NOTHING;

-- Admin Logs (audit trail)
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);

-- Ban support on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- No RLS on admin tables — accessed only via service_role key
