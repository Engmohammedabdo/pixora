-- Migration 009: Missing indexes and policies

-- M10: Index on stripe_customer_id for webhook lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription_id ON profiles(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- M14: credit_transactions INSERT policy (for service role via RPC already works, but explicit)
-- Note: inserts happen via deduct_credits SECURITY DEFINER function or service_role key (webhooks)
-- This policy allows the deduct_credits function to work properly
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service insert transactions' AND tablename = 'credit_transactions') THEN
    CREATE POLICY "Service insert transactions" ON credit_transactions FOR INSERT WITH CHECK (true);
  END IF;
END
$$;

-- M15: Change credit_transactions user_id to RESTRICT (preserve audit trail)
-- Note: This is a breaking change if users are deleted. For now, add a comment.
-- To apply: ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;
-- ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
-- Skipped for now to avoid breaking existing data.

-- Generations: add DELETE policy (allows users to delete their own)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users delete own generations' AND tablename = 'generations') THEN
    CREATE POLICY "Users delete own generations" ON generations FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

-- M7: Add updated_at to brand_kits
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Trigger for brand_kits updated_at
CREATE OR REPLACE FUNCTION update_brand_kits_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brand_kits_updated_at ON brand_kits;
CREATE TRIGGER brand_kits_updated_at
  BEFORE UPDATE ON brand_kits
  FOR EACH ROW EXECUTE FUNCTION update_brand_kits_updated_at();

-- Index on credit_transactions.type for analytics queries
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(type);
