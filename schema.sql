-- ============================================================
--  AdsLife Database Schema
--  Generated from PHP/NestJS source analysis
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`           VARCHAR(100) NOT NULL,
  `email`          VARCHAR(150) NOT NULL UNIQUE,
  `phone`          VARCHAR(20),
  `password_hash`  VARCHAR(255),
  `role`           ENUM('user','vendor','admin') NOT NULL DEFAULT 'user',
  `google_id`      VARCHAR(100),
  `avatar_url`     TEXT,
  `city`           VARCHAR(100),
  `lat`            DECIMAL(10,8),
  `lng`            DECIMAL(11,8),
  `coins`          INT UNSIGNED NOT NULL DEFAULT 0,
  `streak_days`    INT UNSIGNED NOT NULL DEFAULT 0,
  `is_active`      TINYINT(1) NOT NULL DEFAULT 1,
  `last_login`     DATE,
  `login_count`    INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed admin user (password: Admin@123)
INSERT IGNORE INTO `users` (name, email, password_hash, role)
VALUES ('Admin', 'admin@adslife.in', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- ── Vendors ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `vendors` (
  `id`                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`             INT UNSIGNED NOT NULL UNIQUE,
  `business_name`       VARCHAR(200) NOT NULL,
  `category`            VARCHAR(100),
  `city`                VARCHAR(100),
  `address`             TEXT,
  `lat`                 DECIMAL(10,8),
  `lng`                 DECIMAL(11,8),
  `phone`               VARCHAR(20),
  `website`             VARCHAR(255),
  `gst_number`          VARCHAR(50),
  `logo_url`            TEXT,
  `description`         TEXT,
  `status`              ENUM('pending_review','approved','rejected','suspended') NOT NULL DEFAULT 'pending_review',
  `review_note`         TEXT,
  `subscription_plan`   VARCHAR(50) DEFAULT 'free',
  `plan_expires_at`     DATETIME,
  `total_followers`     INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Subscription Plans ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`          VARCHAR(100) NOT NULL,
  `slug`          VARCHAR(50) NOT NULL UNIQUE,
  `price`         DECIMAL(10,2) NOT NULL DEFAULT 0,
  `duration_days` INT NOT NULL DEFAULT 30,
  `max_offers`    INT NOT NULL DEFAULT 5,
  `features`      JSON,
  `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `subscription_plans` (name, slug, price, duration_days, max_offers, features)
VALUES
  ('Free',       'free',       0,    30,  5,  '["5 offers","Basic analytics"]'),
  ('Starter',    'starter',    499,  30,  20, '["20 offers","Analytics","Priority listing"]'),
  ('Pro',        'pro',        999,  30,  50, '["50 offers","Advanced analytics","Spotlight eligible","Banner ads"]'),
  ('Enterprise', 'enterprise', 2999, 30, 999, '["Unlimited offers","Full analytics","Dedicated support","Featured placement"]');

-- ── Offers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `offers` (
  `id`                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `vendor_id`            INT UNSIGNED NOT NULL,
  `title`                VARCHAR(300) NOT NULL,
  `description`          TEXT,
  `category`             VARCHAR(100) DEFAULT 'general',
  `image_url`            TEXT,
  `coupon_code`          VARCHAR(100),
  `redeem_url`           TEXT,
  `discount_percent`     DECIMAL(5,2) DEFAULT 0,
  `original_price`       DECIMAL(12,2),
  `offer_price`          DECIMAL(12,2),
  `max_redemptions`      INT UNSIGNED DEFAULT 0,
  `current_redemptions`  INT UNSIGNED DEFAULT 0,
  `views`                INT UNSIGNED DEFAULT 0,
  `clicks`               INT UNSIGNED DEFAULT 0,
  `saves`                INT UNSIGNED DEFAULT 0,
  `shares`               INT UNSIGNED DEFAULT 0,
  `is_active`            TINYINT(1) NOT NULL DEFAULT 1,
  `is_featured`          TINYINT(1) NOT NULL DEFAULT 0,
  `valid_from`           DATETIME,
  `valid_until`          DATETIME,
  `created_at`           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE CASCADE,
  INDEX (`vendor_id`), INDEX (`category`), INDEX (`is_active`), INDEX (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Categories ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(100) NOT NULL,
  `slug`        VARCHAR(100) NOT NULL UNIQUE,
  `icon`        VARCHAR(100),
  `sort_order`  INT DEFAULT 0,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `categories` (name, slug, icon, sort_order) VALUES
  ('Food & Dining',    'food-dining',    'utensils',      1),
  ('Fashion',          'fashion',        'shirt',         2),
  ('Electronics',      'electronics',    'smartphone',    3),
  ('Beauty',           'beauty',         'sparkles',      4),
  ('Travel',           'travel',         'plane',         5),
  ('Entertainment',    'entertainment',  'film',          6),
  ('Grocery',          'grocery',        'shopping-cart', 7),
  ('Health',           'health',         'heart',         8),
  ('Sports',           'sports',         'dumbbell',      9),
  ('General',          'general',        'tag',           10);

-- ── User Interactions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `user_interactions` (
  `id`         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT UNSIGNED NOT NULL,
  `offer_id`   INT UNSIGNED NOT NULL,
  `action`     ENUM('view','click','save','redeem','share','skip') NOT NULL,
  `category`   VARCHAR(100),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (`user_id`), INDEX (`offer_id`), INDEX (`action`), INDEX (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Saved Offers ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `saved_offers` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT UNSIGNED NOT NULL,
  `offer_id`   INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_user_offer` (`user_id`, `offer_id`),
  INDEX (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── User Preferences ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `user_preferences` (
  `id`                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`               INT UNSIGNED NOT NULL UNIQUE,
  `preferred_categories`  JSON,
  `preferred_vendors`     JSON,
  `max_distance_km`       INT DEFAULT 15,
  `updated_at`            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── User Streaks ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `user_streaks` (
  `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`          INT UNSIGNED NOT NULL UNIQUE,
  `current_streak`   INT UNSIGNED DEFAULT 0,
  `longest_streak`   INT UNSIGNED DEFAULT 0,
  `last_active_date` DATE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Notifications ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT UNSIGNED NOT NULL,
  `title`      VARCHAR(255) NOT NULL,
  `body`       TEXT,
  `type`       VARCHAR(50) DEFAULT 'push',
  `offer_id`   INT UNSIGNED,
  `is_read`    TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (`user_id`), INDEX (`is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── FCM Tokens ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `user_fcm_tokens` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT UNSIGNED NOT NULL,
  `token`      TEXT NOT NULL,
  `platform`   VARCHAR(20) DEFAULT 'web',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_token` (`token`(255)),
  INDEX (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Coin Transactions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `coin_transactions` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`       INT UNSIGNED NOT NULL,
  `action`        VARCHAR(50) NOT NULL,
  `coins_earned`  INT DEFAULT 0,
  `coins_spent`   INT DEFAULT 0,
  `balance_after` INT DEFAULT 0,
  `description`   VARCHAR(255),
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (`user_id`), INDEX (`action`), INDEX (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Badges ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `badges` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`            VARCHAR(100) NOT NULL,
  `description`     TEXT,
  `icon`            VARCHAR(100),
  `condition_type`  VARCHAR(50) NOT NULL,
  `condition_value` INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `badges` (name, description, icon, condition_type, condition_value) VALUES
  ('First Save',      'Saved your first offer',         'bookmark',  'saves',       1),
  ('Saver',           'Saved 10 offers',                'bookmarks', 'saves',      10),
  ('Super Saver',     'Saved 50 offers',                'star',      'saves',      50),
  ('Redeemer',        'Redeemed 5 offers',              'gift',      'redemptions', 5),
  ('Deal Hunter',     'Redeemed 20 offers',             'zap',       'redemptions',20),
  ('Week Warrior',    '7-day streak',                   'flame',     'streak',      7),
  ('Month Master',    '30-day streak',                  'trophy',    'streak',      30),
  ('Early Adopter',   'One of the first 100 users',     'rocket',    'user_id_lte',100);

-- ── User Badges ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `user_badges` (
  `id`        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`   INT UNSIGNED NOT NULL,
  `badge_id`  INT UNSIGNED NOT NULL,
  `earned_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_user_badge` (`user_id`, `badge_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Spin Wheel Prizes ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `spin_wheel_prizes` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `label`       VARCHAR(100) NOT NULL,
  `coins_value` INT UNSIGNED DEFAULT 0,
  `coupon_code` VARCHAR(100),
  `color_hex`   VARCHAR(7) DEFAULT '#FF6200',
  `probability` DECIMAL(5,4) NOT NULL DEFAULT 0.1000
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `spin_wheel_prizes` (label, coins_value, coupon_code, color_hex, probability) VALUES
  ('5 Coins',        5,   NULL,         '#FF6200', 0.3000),
  ('10 Coins',      10,   NULL,         '#FF8C00', 0.2500),
  ('25 Coins',      25,   NULL,         '#FFA500', 0.1500),
  ('50 Coins',      50,   NULL,         '#FFD700', 0.1000),
  ('100 Coins',    100,   NULL,         '#32CD32', 0.0500),
  ('Free Coupon',    0,   'SPIN10',     '#1E90FF', 0.0800),
  ('Better Luck',    0,   NULL,         '#C0C0C0', 0.0700);

-- ── User Spins ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `user_spins` (
  `id`       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`  INT UNSIGNED NOT NULL,
  `prize_id` INT UNSIGNED NOT NULL,
  `spun_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (`user_id`), INDEX (`spun_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Payments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `payments` (
  `id`                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`             INT UNSIGNED NOT NULL,
  `order_id`            VARCHAR(100) NOT NULL UNIQUE,
  `payment_session_id`  VARCHAR(255),
  `cashfree_payment_id` VARCHAR(100),
  `amount`              DECIMAL(12,2) NOT NULL,
  `status`              ENUM('pending','paid','failed','refunded') DEFAULT 'pending',
  `purpose`             VARCHAR(100),
  `reference_id`        INT UNSIGNED,
  `reference_type`      VARCHAR(50),
  `paid_at`             DATETIME,
  `created_at`          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Leaderboard ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `leaderboard` (
  `id`      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `period`  ENUM('weekly','monthly','alltime') NOT NULL DEFAULT 'monthly',
  `score`   INT UNSIGNED DEFAULT 0,
  `city`    VARCHAR(100),
  UNIQUE KEY `uq_user_period` (`user_id`, `period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Vendor Followers ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `vendor_followers` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT UNSIGNED NOT NULL,
  `vendor_id`  INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_follow` (`user_id`, `vendor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Offer Impressions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `offer_impressions` (
  `id`         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `offer_id`   INT UNSIGNED NOT NULL,
  `user_id`    INT UNSIGNED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (`offer_id`), INDEX (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Vendor Daily Stats ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `vendor_daily_stats` (
  `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `vendor_id`    INT UNSIGNED NOT NULL,
  `stat_date`    DATE NOT NULL,
  `impressions`  INT UNSIGNED DEFAULT 0,
  `clicks`       INT UNSIGNED DEFAULT 0,
  `saves`        INT UNSIGNED DEFAULT 0,
  `redemptions`  INT UNSIGNED DEFAULT 0,
  UNIQUE KEY `uq_vendor_date` (`vendor_id`, `stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Fraud Flags ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `fraud_flags` (
  `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `entity_type`      ENUM('vendor','offer') NOT NULL,
  `entity_id`        INT UNSIGNED NOT NULL,
  `flag_reason`      TEXT,
  `confidence_score` INT DEFAULT 0,
  `status`           ENUM('pending','reviewed','dismissed') DEFAULT 'pending',
  `review_note`      TEXT,
  `created_at`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_entity` (`entity_type`, `entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Group Deals ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `group_deals` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `offer_id`    INT UNSIGNED NOT NULL,
  `min_members` INT UNSIGNED NOT NULL DEFAULT 5,
  `status`      ENUM('active','fulfilled','expired') DEFAULT 'active',
  `expires_at`  DATETIME NOT NULL,
  `created_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `group_deal_members` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `deal_id`    INT UNSIGNED NOT NULL,
  `user_id`    INT UNSIGNED NOT NULL,
  `joined_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_deal_user` (`deal_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Support Tickets ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `support_tickets` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT UNSIGNED NOT NULL,
  `subject`    VARCHAR(255) NOT NULL,
  `message`    TEXT NOT NULL,
  `category`   VARCHAR(100) DEFAULT 'general',
  `status`     ENUM('open','answered','closed') DEFAULT 'open',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `support_replies` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `ticket_id`  INT UNSIGNED NOT NULL,
  `user_id`    INT UNSIGNED NOT NULL,
  `message`    TEXT NOT NULL,
  `is_staff`   TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Banner Ads ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `banner_ad_requests` (
  `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `vendor_id`    INT UNSIGNED NOT NULL,
  `image_url`    TEXT NOT NULL,
  `target_url`   TEXT,
  `position`     VARCHAR(50) DEFAULT 'top',
  `duration_days`INT DEFAULT 7,
  `status`       ENUM('pending','approved','rejected','expired') DEFAULT 'pending',
  `review_note`  TEXT,
  `expires_at`   DATETIME,
  `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Spotlight Requests ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `spotlight_requests` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `vendor_id`     INT UNSIGNED NOT NULL,
  `offer_id`      INT UNSIGNED,
  `message`       TEXT,
  `duration_days` INT DEFAULT 7,
  `status`        ENUM('pending','approved','rejected') DEFAULT 'pending',
  `starts_at`     DATETIME,
  `ends_at`       DATETIME,
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── A/B Tests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ab_tests` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `vendor_id`       INT UNSIGNED NOT NULL,
  `name`            VARCHAR(200) NOT NULL,
  `offer_id_a`      INT UNSIGNED NOT NULL,
  `offer_id_b`      INT UNSIGNED NOT NULL,
  `winner_offer_id` INT UNSIGNED,
  `status`          ENUM('running','concluded','cancelled') DEFAULT 'running',
  `ends_at`         DATETIME,
  `concluded_at`    DATETIME,
  `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Site Settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `site_settings` (
  `id`    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `key`   VARCHAR(100) NOT NULL UNIQUE,
  `value` TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `site_settings` (`key`, `value`) VALUES
  ('app_name',           'AdsLife'),
  ('maintenance_mode',   '0'),
  ('min_app_version',    '1.0.0'),
  ('coins_enabled',      '1'),
  ('spin_enabled',       '1');

-- ── Share Events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `share_events` (
  `id`         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT UNSIGNED NOT NULL,
  `offer_id`   INT UNSIGNED NOT NULL,
  `platform`   VARCHAR(50) DEFAULT 'general',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (`user_id`), INDEX (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Vendor Applications ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `vendor_applications` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`       INT UNSIGNED NOT NULL,
  `business_name` VARCHAR(200) NOT NULL,
  `category`      VARCHAR(100),
  `city`          VARCHAR(100),
  `address`       TEXT,
  `phone`         VARCHAR(20),
  `website`       VARCHAR(255),
  `gst_number`    VARCHAR(50),
  `description`   TEXT,
  `status`        ENUM('pending','approved','rejected') DEFAULT 'pending',
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
