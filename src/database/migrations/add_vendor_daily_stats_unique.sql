-- POST /admin/sync-daily-stats does an INSERT ... ON CONFLICT (vendor_id, stat_date)
-- upsert, which requires an actual unique constraint on those columns —
-- without it Postgres throws "no unique or exclusion constraint matching
-- the ON CONFLICT specification" on every call.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_daily_stats_vendor_date
  ON vendor_daily_stats (vendor_id, stat_date);
