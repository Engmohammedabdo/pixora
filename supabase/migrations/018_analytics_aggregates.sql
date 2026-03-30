-- Migration 018: Analytics aggregation tables for SaaS metrics
-- Apply via Supabase SQL Editor or scripts/apply-migrations.sh

-- Daily aggregated metrics (populated on-demand by analytics API)
CREATE TABLE IF NOT EXISTS daily_metrics (
  date DATE PRIMARY KEY,
  total_users INTEGER DEFAULT 0,
  new_signups INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  paying_users INTEGER DEFAULT 0,
  churned_users INTEGER DEFAULT 0,
  mrr_cents INTEGER DEFAULT 0,
  revenue_cents INTEGER DEFAULT 0,
  total_generations INTEGER DEFAULT 0,
  failed_generations INTEGER DEFAULT 0,
  credits_consumed INTEGER DEFAULT 0,
  credits_purchased INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(date DESC);

-- User events for timeline and engagement tracking
CREATE TABLE IF NOT EXISTS user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_events_user ON user_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_type ON user_events(event_type, created_at DESC);

-- Subscription events for churn and plan movement tracking
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_plan TEXT,
  to_plan TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_events_user ON subscription_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_events_type ON subscription_events(event_type, created_at DESC);

-- No RLS on analytics tables — accessed only via service_role key
