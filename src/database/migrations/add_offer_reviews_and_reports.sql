-- AdsLife: offer ratings/feedback + user-facing fraud reports
-- Run once against the adslife database (dev first, prod only with explicit sign-off)

CREATE TABLE IF NOT EXISTS offer_reviews (
  id serial PRIMARY KEY,
  offer_id int NOT NULL,
  user_id int NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_offer_reviews_offer ON offer_reviews(offer_id);

CREATE TABLE IF NOT EXISTS offer_reports (
  id serial PRIMARY KEY,
  offer_id int NOT NULL,
  user_id int NOT NULL,
  reason varchar(40) NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_offer_reports_offer ON offer_reports(offer_id);
