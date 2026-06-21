-- vendor_applications was missing columns the app already writes to (address,
-- website, gst_number, description, lat, lng, logo_url, plan_id), causing
-- POST /vendor-apply/submit to fail with "column ... does not exist".
ALTER TABLE vendor_applications
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS website varchar(255),
  ADD COLUMN IF NOT EXISTS gst_number varchar(50),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS lng numeric(10,7),
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS plan_id integer;
