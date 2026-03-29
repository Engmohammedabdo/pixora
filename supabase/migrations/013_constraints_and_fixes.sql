-- M15: Change credit_transactions FK to SET NULL (preserve audit trail)
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- M18: Update monthly reset to log free-user resets
-- (Applied via the reset_monthly_credits function update)

-- L12: CHECK constraints
ALTER TABLE profiles ADD CONSTRAINT check_plan_id
  CHECK (plan_id IN ('free', 'starter', 'pro', 'business', 'agency'))
  NOT VALID;

ALTER TABLE generations ADD CONSTRAINT check_studio
  CHECK (studio IN ('creator', 'photoshoot', 'campaign', 'plan', 'storyboard', 'analysis', 'voiceover', 'edit', 'prompt-builder', 'video'))
  NOT VALID;
