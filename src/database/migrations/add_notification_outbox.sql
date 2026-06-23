-- Retry queue for push notifications that failed for transient reasons
-- (OAuth/network/FCM-side errors) — picked up by PushOutboxService's cron.
CREATE TABLE IF NOT EXISTS notification_outbox (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,
  type        VARCHAR(50) NOT NULL DEFAULT 'push',
  data        JSONB,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  INTEGER,
  updated_by  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
  ON notification_outbox (status, is_active, attempts);
