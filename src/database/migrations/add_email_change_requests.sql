-- OTP-based email change verification. A user requests a change to `new_email`,
-- an OTP is emailed to that address, and the change is applied once confirmed.
CREATE TABLE IF NOT EXISTS email_change_requests (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  new_email   VARCHAR(150) NOT NULL,
  otp         VARCHAR(6) NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_change_requests_user_active
  ON email_change_requests (user_id, used_at, expires_at);
