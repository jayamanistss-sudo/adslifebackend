-- AdsLife: Missing indexes identified in security/performance audit
-- Run once against the adslife database

-- users
CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_is_active      ON users(is_active);

-- offers
CREATE INDEX IF NOT EXISTS idx_offers_vendor        ON offers(vendor_id);
CREATE INDEX IF NOT EXISTS idx_offers_active_expiry ON offers(is_active, valid_until);
CREATE INDEX IF NOT EXISTS idx_offers_featured      ON offers(is_featured);

-- user_interactions
CREATE INDEX IF NOT EXISTS idx_ui_offer_date ON user_interactions(offer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ui_user       ON user_interactions(user_id);

-- vendor_followers
CREATE UNIQUE INDEX IF NOT EXISTS idx_vf_pair ON vendor_followers(vendor_id, user_id);

-- saved_offers
CREATE INDEX IF NOT EXISTS idx_so_user  ON saved_offers(user_id);
CREATE INDEX IF NOT EXISTS idx_so_offer ON saved_offers(offer_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, is_read);

-- vendor_applications
CREATE INDEX IF NOT EXISTS idx_va_user_status ON vendor_applications(user_id, status);

-- payments
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- user_fcm_tokens
CREATE INDEX IF NOT EXISTS idx_fcm_user ON user_fcm_tokens(user_id);

-- referrals
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);

-- group_deal_members
CREATE UNIQUE INDEX IF NOT EXISTS idx_gdm_pair ON group_deal_members(deal_id, user_id);

-- leaderboard
CREATE INDEX IF NOT EXISTS idx_leaderboard_period_score ON leaderboard(period, score DESC);

-- vendors
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_city   ON vendors(city);
