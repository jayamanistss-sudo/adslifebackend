-- Vendor open/close hours, stored as a JSON-in-text blob (TypeORM `simple-json`
-- column type, same pattern as Offer.images) — keyed mon..sun, each
-- {open: "HH:mm", close: "HH:mm", closed: bool}.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS hours text;
