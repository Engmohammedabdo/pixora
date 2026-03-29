-- Phase C: Gamification schema
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_date TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT true;

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type)
);
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own achievements" ON achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System insert achievements" ON achievements FOR INSERT WITH CHECK (true);

CREATE TABLE IF NOT EXISTS saved_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  studio TEXT NOT NULL,
  is_favorite BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE saved_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own prompts" ON saved_prompts FOR ALL USING (auth.uid() = user_id);

ALTER TABLE generations ADD COLUMN IF NOT EXISTS user_rating INTEGER;
