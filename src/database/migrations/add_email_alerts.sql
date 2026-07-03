-- Add email_alerts preference to users table
-- Run this migration on the server before deploying the email alerts feature

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_alerts BOOLEAN NOT NULL DEFAULT true;
