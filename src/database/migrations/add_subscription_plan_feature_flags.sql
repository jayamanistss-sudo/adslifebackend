ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS feature_flags JSON DEFAULT '[]';
