-- Migration 002: Brand Kits table

CREATE TABLE brand_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#6366F1',
  secondary_color TEXT DEFAULT '#06B6D4',
  accent_color TEXT DEFAULT '#F59E0B',
  font_primary TEXT DEFAULT 'Cairo',
  font_secondary TEXT DEFAULT 'Tajawal',
  brand_voice TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own brand kits"
  ON brand_kits FOR ALL
  USING (auth.uid() = user_id);

-- Ensure only one default per user
CREATE OR REPLACE FUNCTION ensure_single_default_brand_kit()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE brand_kits
    SET is_default = false
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_kit_single_default
  BEFORE INSERT OR UPDATE ON brand_kits
  FOR EACH ROW EXECUTE FUNCTION ensure_single_default_brand_kit();

-- Index
CREATE INDEX idx_brand_kits_user_id ON brand_kits(user_id);
