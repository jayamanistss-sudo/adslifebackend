-- AdsLife: notification template pool + search activity tracking
-- Run once against the adslife database (dev first, prod only with explicit sign-off)

-- user_interactions: allow logging a search with no associated offer
ALTER TABLE user_interactions ALTER COLUMN offer_id DROP NOT NULL;
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS search_term varchar(255);

-- notification_templates: pool of message variants (hand-written + AI-generated)
CREATE TABLE IF NOT EXISTS notification_templates (
  id               serial PRIMARY KEY,
  type             varchar(40) NOT NULL,
  title            varchar(150) NOT NULL,
  body             text NOT NULL,
  route            varchar(100) NOT NULL DEFAULT '/feed',
  language         varchar(10) NOT NULL DEFAULT 'ta',
  is_ai_generated  boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_templates_type_active ON notification_templates(type, is_active);
