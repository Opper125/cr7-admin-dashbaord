-- ================================================================
-- CR7 GAME STORE v2.0 — COMPLETE DATABASE SCHEMA
-- Supabase PostgreSQL
-- Safe to re-run: IF NOT EXISTS · CREATE OR REPLACE · DROP IF EXISTS
-- Tables: 24 | Functions: 11 | Triggers: 8 | Policies: 42 | Indexes: 58+
-- ================================================================

-- ================================================================
-- EXTENSIONS
-- ================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- TABLE: users
-- ================================================================
CREATE TABLE IF NOT EXISTS users (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT          NOT NULL,
  username              TEXT          NOT NULL UNIQUE,
  email                 TEXT          NOT NULL UNIQUE,
  password_hash         TEXT          NOT NULL,
  balance_mmk           NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (balance_mmk >= 0),
  balance_usd           NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (balance_usd >= 0),
  total_spent_mmk       NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_spent_usd       NUMERIC(15,4) NOT NULL DEFAULT 0,
  preferred_currency    TEXT          NOT NULL DEFAULT 'MMK' CHECK (preferred_currency IN ('MMK','USD')),
  is_banned             BOOLEAN       NOT NULL DEFAULT FALSE,
  balance_locked        BOOLEAN       NOT NULL DEFAULT FALSE,
  balance_locked_reason TEXT,
  profile_picture_url   TEXT,
  last_login_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: user_sessions
-- ================================================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT        NOT NULL UNIQUE,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  ip_address    TEXT,
  user_agent    TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: admin_sessions
-- ================================================================
CREATE TABLE IF NOT EXISTS admin_sessions (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token TEXT        NOT NULL UNIQUE,
  ip_address    TEXT,
  user_agent    TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: settings  (enforced single-row — see trigger below)
-- ================================================================
CREATE TABLE IF NOT EXISTS settings (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_name            TEXT          NOT NULL DEFAULT 'CR7 Game Store',
  logo_url             TEXT,
  live_text            TEXT          NOT NULL DEFAULT 'Welcome to CR7 Game Store!',
  maintenance_mode     BOOLEAN       NOT NULL DEFAULT FALSE,
  maintenance_message  TEXT          NOT NULL DEFAULT 'Site is under maintenance. Please come back later.',
  mmk_rate             NUMERIC(12,2) NOT NULL DEFAULT 4500,
  mmk_profit_percent   NUMERIC(6,3)  NOT NULL DEFAULT 5,
  usd_profit_percent   NUMERIC(6,3)  NOT NULL DEFAULT 3,
  min_deposit_mmk      NUMERIC(15,2) NOT NULL DEFAULT 1000,
  max_deposit_mmk      NUMERIC(15,2) NOT NULL DEFAULT 1000000,
  min_deposit_usd      NUMERIC(12,4) NOT NULL DEFAULT 1,
  max_deposit_usd      NUMERIC(12,4) NOT NULL DEFAULT 1000,
  deposit_note_mmk     TEXT          NOT NULL DEFAULT '',
  deposit_note_usd     TEXT          NOT NULL DEFAULT '',
  vpn_block_enabled    BOOLEAN       NOT NULL DEFAULT TRUE,
  registration_enabled BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: news
-- ================================================================
CREATE TABLE IF NOT EXISTS news (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        TEXT          NOT NULL,
  content      TEXT,
  media_link   TEXT,
  social_links JSONB         NOT NULL DEFAULT '[]',
  has_claim    BOOLEAN       NOT NULL DEFAULT FALSE,
  claim_mmk    NUMERIC(15,2) NOT NULL DEFAULT 0,
  claim_usd    NUMERIC(12,4) NOT NULL DEFAULT 0,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: news_claims
-- ================================================================
CREATE TABLE IF NOT EXISTS news_claims (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  news_id    UUID        NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(news_id, user_id)
);

-- ================================================================
-- TABLE: payment_methods
-- (must exist before deposits for FK)
-- ================================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT        NOT NULL,
  address    TEXT        NOT NULL,
  note       TEXT,
  currency   TEXT        NOT NULL DEFAULT 'MMK' CHECK (currency IN ('MMK','USD')),
  icon_url   TEXT,
  qr_url     TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order INT         NOT NULL DEFAULT 99,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: banners
-- (category_id FK added after custom_categories is created)
-- ================================================================
CREATE TABLE IF NOT EXISTS banners (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        TEXT        NOT NULL DEFAULT 'home' CHECK (type IN ('home','category')),
  url         TEXT        NOT NULL,
  category_id UUID,
  guide_video TEXT,
  guide_text  TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INT         NOT NULL DEFAULT 99,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: custom_pages
-- ================================================================
CREATE TABLE IF NOT EXISTS custom_pages (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT        NOT NULL,
  page_type  TEXT        NOT NULL DEFAULT 'normal' CHECK (page_type IN ('normal','game_account')),
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order INT         NOT NULL DEFAULT 99,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: custom_categories
-- ================================================================
CREATE TABLE IF NOT EXISTS custom_categories (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id    UUID        NOT NULL REFERENCES custom_pages(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  icon_url   TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order INT         NOT NULL DEFAULT 99,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: custom_products
-- ================================================================
CREATE TABLE IF NOT EXISTS custom_products (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id   UUID          NOT NULL REFERENCES custom_categories(id) ON DELETE CASCADE,
  name          TEXT          NOT NULL,
  amount        TEXT,
  price_mmk     NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (price_mmk >= 0),
  price_usd     NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (price_usd >= 0),
  delivery_time TEXT          NOT NULL DEFAULT 'Instant',
  stock         INT           NOT NULL DEFAULT 0 CHECK (stock >= 0),
  icon_url      TEXT,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order    INT           NOT NULL DEFAULT 99,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: input_tables  (custom order input fields per category)
-- ================================================================
CREATE TABLE IF NOT EXISTS input_tables (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID        NOT NULL REFERENCES custom_categories(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  placeholder TEXT,
  is_required BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INT         NOT NULL DEFAULT 99,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: game_accounts
-- ================================================================
CREATE TABLE IF NOT EXISTS game_accounts (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id          UUID          REFERENCES custom_pages(id) ON DELETE SET NULL,
  game_name        TEXT          NOT NULL,
  description      TEXT,
  game_version     TEXT,
  linked_platforms JSONB         NOT NULL DEFAULT '[]',
  price_mmk        NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (price_mmk >= 0),
  price_usd        NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (price_usd >= 0),
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  is_sold          BOOLEAN       NOT NULL DEFAULT FALSE,
  sold_to_user_id  UUID          REFERENCES users(id) ON DELETE SET NULL,
  sold_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: game_account_images
-- ================================================================
CREATE TABLE IF NOT EXISTS game_account_images (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_account_id UUID        NOT NULL REFERENCES game_accounts(id) ON DELETE CASCADE,
  image_url       TEXT        NOT NULL,
  sort_order      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: game_account_contacts
-- ================================================================
CREATE TABLE IF NOT EXISTS game_account_contacts (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_account_id UUID        NOT NULL REFERENCES game_accounts(id) ON DELETE CASCADE,
  social_name     TEXT        NOT NULL,
  contact_value   TEXT        NOT NULL,
  sort_order      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: user_locations
-- ================================================================
CREATE TABLE IF NOT EXISTS user_locations (
  id           UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID             NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  city         TEXT,
  country      TEXT,
  country_code TEXT,
  region       TEXT,
  ip_address   TEXT,
  is_vpn       BOOLEAN          NOT NULL DEFAULT FALSE,
  is_online    BOOLEAN          NOT NULL DEFAULT TRUE,
  last_seen    TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: balance_transactions  (immutable audit trail — no deletes)
-- ================================================================
CREATE TABLE IF NOT EXISTS balance_transactions (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           TEXT          NOT NULL
                   CHECK (type IN ('debit','credit','refund','deposit','admin_credit','admin_debit','bonus')),
  amount         NUMERIC(15,4) NOT NULL CHECK (amount >= 0),
  currency       TEXT          NOT NULL DEFAULT 'MMK' CHECK (currency IN ('MMK','USD')),
  balance_after  NUMERIC(15,4) NOT NULL,
  description    TEXT,
  reference_id   UUID,
  reference_type TEXT
                   CHECK (reference_type IN ('order','deposit','admin','news','system') OR reference_type IS NULL),
  performed_by   TEXT          NOT NULL DEFAULT 'system'
                   CHECK (performed_by IN ('system','admin','function')),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: balance_audit_log  (suspicious / admin actions only)
-- ================================================================
CREATE TABLE IF NOT EXISTS balance_audit_log (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID          REFERENCES users(id) ON DELETE CASCADE,
  action       TEXT          NOT NULL
                 CHECK (action IN (
                   'balance_locked','balance_unlocked',
                   'suspicious_detected','balance_auto_locked',
                   'direct_edit_attempt','admin_reset'
                 )),
  old_value    NUMERIC(15,4),
  new_value    NUMERIC(15,4),
  currency     TEXT,
  performed_by TEXT          NOT NULL DEFAULT 'system',
  reason       TEXT,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: orders
-- ================================================================
CREATE TABLE IF NOT EXISTS orders (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_type      TEXT          NOT NULL
                    CHECK (order_type IN ('g2bulk_topup','product','custom','game_account')),
  product_name    TEXT,
  category_name   TEXT,
  game_code       TEXT,
  player_id       TEXT,
  player_name     TEXT,
  server_id       TEXT,
  price_amount    NUMERIC(15,4) NOT NULL CHECK (price_amount >= 0),
  price_currency  TEXT          NOT NULL DEFAULT 'MMK' CHECK (price_currency IN ('MMK','USD')),
  api_price_usd   NUMERIC(15,6),
  g2bulk_order_id TEXT,
  status          TEXT          NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','completed','failed','refunded','cancelled')),
  is_refunded     BOOLEAN       NOT NULL DEFAULT FALSE,
  message         TEXT,
  custom_inputs   JSONB,
  callback_url    TEXT,
  completed_at    TIMESTAMPTZ,
  refunded_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: deposits
-- ================================================================
CREATE TABLE IF NOT EXISTS deposits (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount            NUMERIC(15,4) NOT NULL CHECK (amount > 0),
  currency          TEXT          NOT NULL DEFAULT 'MMK' CHECK (currency IN ('MMK','USD')),
  payment_method_id UUID          REFERENCES payment_methods(id) ON DELETE SET NULL,
  receipt_url       TEXT,
  notes             TEXT,
  status            TEXT          NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected')),
  admin_notes       TEXT,
  processed_by_ip   TEXT,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: feedback
-- ================================================================
CREATE TABLE IF NOT EXISTS feedback (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID        REFERENCES custom_categories(id) ON DELETE SET NULL,
  rating      INT         NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  message     TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: g2bulk_order_cache
-- ================================================================
CREATE TABLE IF NOT EXISTS g2bulk_order_cache (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  g2bulk_order_id TEXT        NOT NULL UNIQUE,
  game_code       TEXT,
  last_status     TEXT,
  raw_response    JSONB,
  last_checked    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: webhook_logs  (G2Bulk callbacks & any external webhooks)
-- ================================================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source           TEXT        NOT NULL DEFAULT 'g2bulk',
  event_type       TEXT,
  payload          JSONB,
  raw_headers      JSONB,
  processed        BOOLEAN     NOT NULL DEFAULT FALSE,
  processing_error TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- TABLE: admin_activity_logs  (who did what in admin panel)
-- ================================================================
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  action      TEXT        NOT NULL,
  target_type TEXT        CHECK (target_type IN (
                'user','order','deposit','setting','banner','news',
                'payment','product','category','page','game_account','other'
              )),
  target_id   UUID,
  details     JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- DEFERRED FK: banners.category_id → custom_categories(id)
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_banners_category'
      AND table_name = 'banners'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE banners
      ADD CONSTRAINT fk_banners_category
      FOREIGN KEY (category_id) REFERENCES custom_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ================================================================
-- FUNCTION: update_updated_at_column
-- ================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ================================================================
-- FUNCTION: ensure_single_settings_row
-- Prevents inserting a second row into settings
-- ================================================================
CREATE OR REPLACE FUNCTION ensure_single_settings_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM settings) >= 1 THEN
    RAISE EXCEPTION 'Only one settings row is allowed. Use UPDATE instead of INSERT.';
  END IF;
  RETURN NEW;
END;
$$;

-- ================================================================
-- FUNCTION: deduct_balance_mmk  (SECURITY DEFINER)
-- Inserts transaction FIRST so balance_security trigger
-- can see it (same DB transaction = visible to trigger).
-- ================================================================
CREATE OR REPLACE FUNCTION deduct_balance_mmk(
  p_user_id        UUID,
  p_amount         NUMERIC,
  p_description    TEXT DEFAULT '',
  p_reference_type TEXT DEFAULT 'order',
  p_reference_id   UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current NUMERIC;
  v_new     NUMERIC;
  v_locked  BOOLEAN;
  v_tx_id   UUID := uuid_generate_v4();
BEGIN
  SELECT balance_mmk, balance_locked
  INTO v_current, v_locked
  FROM users WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  IF v_locked THEN
    RETURN json_build_object('success', false, 'error', 'Balance is locked');
  END IF;
  IF v_current < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  v_new := v_current - p_amount;

  -- Insert transaction BEFORE balance update (trigger sees this record)
  INSERT INTO balance_transactions(
    id, user_id, type, amount, currency, balance_after,
    description, reference_type, reference_id, performed_by
  ) VALUES (
    v_tx_id, p_user_id, 'debit', p_amount, 'MMK', v_new,
    p_description, p_reference_type, p_reference_id, 'function'
  );

  UPDATE users
  SET balance_mmk = v_new, updated_at = NOW()
  WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'new_balance', v_new, 'tx_id', v_tx_id);
END;
$$;

-- ================================================================
-- FUNCTION: add_balance_mmk  (SECURITY DEFINER)
-- ================================================================
CREATE OR REPLACE FUNCTION add_balance_mmk(
  p_user_id          UUID,
  p_amount           NUMERIC,
  p_description      TEXT DEFAULT '',
  p_transaction_type TEXT DEFAULT 'credit',
  p_reference_id     UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current NUMERIC;
  v_new     NUMERIC;
  v_tx_id   UUID := uuid_generate_v4();
BEGIN
  SELECT balance_mmk INTO v_current
  FROM users WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new := v_current + p_amount;

  -- Insert transaction BEFORE balance update
  INSERT INTO balance_transactions(
    id, user_id, type, amount, currency, balance_after,
    description, reference_id, performed_by
  ) VALUES (
    v_tx_id, p_user_id, p_transaction_type, p_amount, 'MMK', v_new,
    p_description, p_reference_id, 'function'
  );

  UPDATE users
  SET balance_mmk = v_new, updated_at = NOW()
  WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'new_balance', v_new, 'tx_id', v_tx_id);
END;
$$;

-- ================================================================
-- FUNCTION: deduct_balance_usd  (SECURITY DEFINER)
-- ================================================================
CREATE OR REPLACE FUNCTION deduct_balance_usd(
  p_user_id        UUID,
  p_amount         NUMERIC,
  p_description    TEXT DEFAULT '',
  p_reference_type TEXT DEFAULT 'order',
  p_reference_id   UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current NUMERIC;
  v_new     NUMERIC;
  v_locked  BOOLEAN;
  v_tx_id   UUID := uuid_generate_v4();
BEGIN
  SELECT balance_usd, balance_locked
  INTO v_current, v_locked
  FROM users WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  IF v_locked THEN
    RETURN json_build_object('success', false, 'error', 'Balance is locked');
  END IF;
  IF v_current < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  v_new := v_current - p_amount;

  -- Insert transaction BEFORE balance update
  INSERT INTO balance_transactions(
    id, user_id, type, amount, currency, balance_after,
    description, reference_type, reference_id, performed_by
  ) VALUES (
    v_tx_id, p_user_id, 'debit', p_amount, 'USD', v_new,
    p_description, p_reference_type, p_reference_id, 'function'
  );

  UPDATE users
  SET balance_usd = v_new, updated_at = NOW()
  WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'new_balance', v_new, 'tx_id', v_tx_id);
END;
$$;

-- ================================================================
-- FUNCTION: add_balance_usd  (SECURITY DEFINER)
-- ================================================================
CREATE OR REPLACE FUNCTION add_balance_usd(
  p_user_id          UUID,
  p_amount           NUMERIC,
  p_description      TEXT DEFAULT '',
  p_transaction_type TEXT DEFAULT 'credit',
  p_reference_id     UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current NUMERIC;
  v_new     NUMERIC;
  v_tx_id   UUID := uuid_generate_v4();
BEGIN
  SELECT balance_usd INTO v_current
  FROM users WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new := v_current + p_amount;

  -- Insert transaction BEFORE balance update
  INSERT INTO balance_transactions(
    id, user_id, type, amount, currency, balance_after,
    description, reference_id, performed_by
  ) VALUES (
    v_tx_id, p_user_id, p_transaction_type, p_amount, 'USD', v_new,
    p_description, p_reference_id, 'function'
  );

  UPDATE users
  SET balance_usd = v_new, updated_at = NOW()
  WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'new_balance', v_new, 'tx_id', v_tx_id);
END;
$$;

-- ================================================================
-- FUNCTION: check_balance_integrity  (SECURITY DEFINER)
-- BUG FIX: removed nested DECLARE inside IF block (invalid PL/pgSQL)
-- All DECLARE vars moved to top-level DECLARE section.
-- Uses 30-second window so API round-trips from direct updates
-- (deposit approve etc.) have time to insert their transaction.
-- ================================================================
CREATE OR REPLACE FUNCTION check_balance_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mmk_diff   NUMERIC;
  v_usd_diff   NUMERIC;
  v_suspicious BOOLEAN := FALSE;
  v_warning    TEXT;
  v_tx_count   INT;
  v_recent_mmk NUMERIC;
  v_recent_usd NUMERIC;
BEGIN
  v_mmk_diff := NEW.balance_mmk - OLD.balance_mmk;
  v_usd_diff := NEW.balance_usd - OLD.balance_usd;

  -- Only inspect when balance goes UP
  IF v_mmk_diff > 0 OR v_usd_diff > 0 THEN

    -- Check credit/deposit transactions in the last 30 seconds
    -- (30-second window handles SECURITY DEFINER functions that insert
    --  the transaction record BEFORE the UPDATE, AND also covers direct
    --  API updates where the transaction is inserted shortly after).
    SELECT
      COUNT(*),
      COALESCE(SUM(
        CASE WHEN currency = 'MMK'
                  AND type IN ('credit','deposit','admin_credit','refund','bonus')
             THEN amount ELSE 0 END
      ), 0),
      COALESCE(SUM(
        CASE WHEN currency = 'USD'
                  AND type IN ('credit','deposit','admin_credit','refund','bonus')
             THEN amount ELSE 0 END
      ), 0)
    INTO v_tx_count, v_recent_mmk, v_recent_usd
    FROM balance_transactions
    WHERE user_id = NEW.id
      AND created_at > NOW() - INTERVAL '30 seconds';

    -- Flag suspicious only when balance increased but no matching transaction exists
    -- AND the increase is non-trivial (> 1 to skip rounding artifacts)
    IF (v_mmk_diff > 1    AND v_recent_mmk < v_mmk_diff * 0.5) OR
       (v_usd_diff > 0.01 AND v_recent_usd < v_usd_diff * 0.5)
    THEN
      v_suspicious := TRUE;
      v_warning := format(
        'Suspicious balance increase: MMK +%s (credited_tx: %s), USD +%s (credited_tx: %s)',
        v_mmk_diff, v_recent_mmk, v_usd_diff, v_recent_usd
      );
    END IF;
  END IF;

  IF v_suspicious THEN
    INSERT INTO balance_audit_log(
      user_id, action, old_value, new_value, currency, performed_by, reason
    ) VALUES (
      NEW.id, 'suspicious_detected',
      OLD.balance_mmk, NEW.balance_mmk, 'MMK', 'trigger', v_warning
    );

    INSERT INTO balance_audit_log(
      user_id, action, old_value, new_value, currency, performed_by, reason
    ) VALUES (
      NEW.id, 'balance_auto_locked',
      OLD.balance_usd, NEW.balance_usd, 'USD', 'trigger', v_warning
    );

    -- Auto-lock the account
    NEW.balance_locked        := TRUE;
    NEW.balance_locked_reason := 'Auto-locked: ' || v_warning;
  END IF;

  RETURN NEW;
END;
$$;

-- ================================================================
-- FUNCTION: update_total_spent_on_order_complete
-- Auto-updates users.total_spent_* when an order is completed
-- or reverses when an order is refunded.
-- ================================================================
CREATE OR REPLACE FUNCTION update_total_spent_on_order_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Order transitioned TO completed
  IF NEW.status = 'completed' AND OLD.status <> 'completed' AND NOT NEW.is_refunded THEN
    IF NEW.price_currency = 'MMK' THEN
      UPDATE users
      SET total_spent_mmk = total_spent_mmk + NEW.price_amount,
          updated_at = NOW()
      WHERE id = NEW.user_id;
    ELSE
      UPDATE users
      SET total_spent_usd = total_spent_usd + NEW.price_amount,
          updated_at = NOW()
      WHERE id = NEW.user_id;
    END IF;
    NEW.completed_at := NOW();
  END IF;

  -- Order transitioned to refunded (was completed)
  IF NEW.is_refunded = TRUE AND OLD.is_refunded = FALSE
     AND OLD.status = 'completed'
  THEN
    IF NEW.price_currency = 'MMK' THEN
      UPDATE users
      SET total_spent_mmk = GREATEST(0, total_spent_mmk - NEW.price_amount),
          updated_at = NOW()
      WHERE id = NEW.user_id;
    ELSE
      UPDATE users
      SET total_spent_usd = GREATEST(0, total_spent_usd - NEW.price_amount),
          updated_at = NOW()
      WHERE id = NEW.user_id;
    END IF;
    NEW.refunded_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

-- ================================================================
-- FUNCTION: get_admin_overview_stats  (SECURITY DEFINER)
-- Returns all key dashboard metrics in one query.
-- ================================================================
CREATE OR REPLACE FUNCTION get_admin_overview_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_users       INT;
  v_active_users_30d  INT;
  v_banned_users      INT;
  v_locked_users      INT;
  v_total_orders      INT;
  v_pending_orders    INT;
  v_completed_orders  INT;
  v_failed_orders     INT;
  v_pending_deposits  INT;
  v_revenue_mmk       NUMERIC;
  v_revenue_usd       NUMERIC;
  v_online_users_30m  INT;
  v_total_deposits_approved INT;
BEGIN
  SELECT COUNT(*)      INTO v_total_users       FROM users;
  SELECT COUNT(*)      INTO v_banned_users       FROM users WHERE is_banned = TRUE;
  SELECT COUNT(*)      INTO v_locked_users       FROM users WHERE balance_locked = TRUE;
  SELECT COUNT(DISTINCT user_id)
                       INTO v_active_users_30d
    FROM user_sessions
    WHERE is_active = TRUE AND created_at > NOW() - INTERVAL '30 days';
  SELECT COUNT(*)      INTO v_total_orders       FROM orders;
  SELECT COUNT(*)      INTO v_pending_orders     FROM orders WHERE status = 'pending';
  SELECT COUNT(*)      INTO v_completed_orders   FROM orders WHERE status = 'completed';
  SELECT COUNT(*)      INTO v_failed_orders      FROM orders WHERE status = 'failed';
  SELECT COUNT(*)      INTO v_pending_deposits   FROM deposits WHERE status = 'pending';
  SELECT COUNT(*)      INTO v_total_deposits_approved FROM deposits WHERE status = 'approved';
  SELECT COALESCE(SUM(price_amount), 0) INTO v_revenue_mmk
    FROM orders WHERE status = 'completed' AND price_currency = 'MMK';
  SELECT COALESCE(SUM(price_amount), 0) INTO v_revenue_usd
    FROM orders WHERE status = 'completed' AND price_currency = 'USD';
  SELECT COUNT(*)      INTO v_online_users_30m
    FROM user_locations
    WHERE is_online = TRUE AND last_seen > NOW() - INTERVAL '30 minutes';

  RETURN json_build_object(
    'total_users',            v_total_users,
    'active_users_30d',       v_active_users_30d,
    'banned_users',           v_banned_users,
    'locked_users',           v_locked_users,
    'total_orders',           v_total_orders,
    'pending_orders',         v_pending_orders,
    'completed_orders',       v_completed_orders,
    'failed_orders',          v_failed_orders,
    'pending_deposits',       v_pending_deposits,
    'approved_deposits',      v_total_deposits_approved,
    'total_revenue_mmk',      v_revenue_mmk,
    'total_revenue_usd',      v_revenue_usd,
    'online_users_30m',       v_online_users_30m
  );
END;
$$;

-- ================================================================
-- FUNCTION: cleanup_expired_sessions
-- Call periodically (e.g. cron) or trigger manually.
-- Returns count of sessions deactivated.
-- ================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_n     INT;
BEGIN
  UPDATE user_sessions  SET is_active = FALSE
  WHERE is_active = TRUE AND expires_at < NOW();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  UPDATE admin_sessions SET is_active = FALSE
  WHERE is_active = TRUE AND expires_at < NOW();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  -- Mark users offline if not seen in last 30 minutes
  UPDATE user_locations SET is_online = FALSE
  WHERE is_online = TRUE AND last_seen < NOW() - INTERVAL '30 minutes';

  RETURN v_count;
END;
$$;

-- ================================================================
-- FUNCTION: refund_order  (SECURITY DEFINER)
-- Safe order refund: validates state, credits balance, updates order.
-- Usage: SELECT refund_order('<order_uuid>', 'reason text');
-- ================================================================
CREATE OR REPLACE FUNCTION refund_order(
  p_order_id   UUID,
  p_admin_note TEXT DEFAULT 'Admin refund'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  RECORD;
  v_result JSON;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;
  IF v_order.is_refunded THEN
    RETURN json_build_object('success', false, 'error', 'Order already refunded');
  END IF;
  IF v_order.status NOT IN ('completed','failed','processing','pending') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot refund order with status: ' || v_order.status
    );
  END IF;

  -- Credit the balance back
  IF v_order.price_currency = 'MMK' THEN
    SELECT add_balance_mmk(
      v_order.user_id, v_order.price_amount,
      p_admin_note, 'refund', p_order_id
    ) INTO v_result;
  ELSE
    SELECT add_balance_usd(
      v_order.user_id, v_order.price_amount,
      p_admin_note, 'refund', p_order_id
    ) INTO v_result;
  END IF;

  UPDATE orders
  SET is_refunded = TRUE,
      status      = 'refunded',
      message     = p_admin_note,
      refunded_at = NOW(),
      updated_at  = NOW()
  WHERE id = p_order_id;

  RETURN json_build_object(
    'success', true,
    'order_id', p_order_id,
    'balance_result', v_result
  );
END;
$$;

-- ================================================================
-- TRIGGERS  (DROP first for idempotent re-runs)
-- ================================================================

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS users_balance_security ON users;
CREATE TRIGGER users_balance_security
  BEFORE UPDATE ON users
  FOR EACH ROW
  WHEN (OLD.balance_mmk IS DISTINCT FROM NEW.balance_mmk
     OR OLD.balance_usd IS DISTINCT FROM NEW.balance_usd)
  EXECUTE FUNCTION check_balance_integrity();

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS orders_update_total_spent ON orders;
CREATE TRIGGER orders_update_total_spent
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_total_spent_on_order_complete();

DROP TRIGGER IF EXISTS custom_products_updated_at ON custom_products;
CREATE TRIGGER custom_products_updated_at
  BEFORE UPDATE ON custom_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS game_accounts_updated_at ON game_accounts;
CREATE TRIGGER game_accounts_updated_at
  BEFORE UPDATE ON game_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS settings_updated_at ON settings;
CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS settings_single_row ON settings;
CREATE TRIGGER settings_single_row
  BEFORE INSERT ON settings
  FOR EACH ROW EXECUTE FUNCTION ensure_single_settings_row();

-- ================================================================
-- ROW LEVEL SECURITY — enable on all tables
-- ================================================================
ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_audit_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits               ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback               ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_claims            ENABLE ROW LEVEL SECURITY;
ALTER TABLE g2bulk_order_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE news                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners                ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods        ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_pages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE input_tables           ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_account_images    ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_account_contacts  ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- RLS POLICIES — drop all existing first (idempotent)
-- ================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------
-- SENSITIVE TABLES: service_role only (no public/anon access)
-- ----------------------------------------------------------------

CREATE POLICY "srole_all_users"
  ON users FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_user_sessions"
  ON user_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_admin_sessions"
  ON admin_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_user_locations"
  ON user_locations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_balance_tx"
  ON balance_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_balance_audit"
  ON balance_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_orders"
  ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_deposits"
  ON deposits FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_feedback"
  ON feedback FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_news_claims"
  ON news_claims FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_g2bulk_cache"
  ON g2bulk_order_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_webhook_logs"
  ON webhook_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srole_all_admin_activity_logs"
  ON admin_activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------
-- PUBLIC-READABLE TABLES: service_role full + anon/authenticated SELECT
-- ----------------------------------------------------------------

-- settings
CREATE POLICY "srole_all_settings"
  ON settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_settings"
  ON settings FOR SELECT TO anon, authenticated USING (true);

-- news
CREATE POLICY "srole_all_news"
  ON news FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_news"
  ON news FOR SELECT TO anon, authenticated USING (is_active = true);

-- banners
CREATE POLICY "srole_all_banners"
  ON banners FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_banners"
  ON banners FOR SELECT TO anon, authenticated USING (is_active = true);

-- payment_methods
CREATE POLICY "srole_all_payment_methods"
  ON payment_methods FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_payment_methods"
  ON payment_methods FOR SELECT TO anon, authenticated USING (is_active = true);

-- custom_pages
CREATE POLICY "srole_all_custom_pages"
  ON custom_pages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_custom_pages"
  ON custom_pages FOR SELECT TO anon, authenticated USING (is_active = true);

-- custom_categories
CREATE POLICY "srole_all_custom_categories"
  ON custom_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_custom_categories"
  ON custom_categories FOR SELECT TO anon, authenticated USING (is_active = true);

-- custom_products
CREATE POLICY "srole_all_custom_products"
  ON custom_products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_custom_products"
  ON custom_products FOR SELECT TO anon, authenticated USING (is_active = true);

-- input_tables
CREATE POLICY "srole_all_input_tables"
  ON input_tables FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_input_tables"
  ON input_tables FOR SELECT TO anon, authenticated USING (true);

-- game_accounts
CREATE POLICY "srole_all_game_accounts"
  ON game_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_game_accounts"
  ON game_accounts FOR SELECT TO anon, authenticated
  USING (is_active = true AND is_sold = false);

-- game_account_images
CREATE POLICY "srole_all_ga_images"
  ON game_account_images FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_ga_images"
  ON game_account_images FOR SELECT TO anon, authenticated USING (true);

-- game_account_contacts
CREATE POLICY "srole_all_ga_contacts"
  ON game_account_contacts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "public_read_ga_contacts"
  ON game_account_contacts FOR SELECT TO anon, authenticated USING (true);

-- ================================================================
-- INDEXES
-- ================================================================

-- users
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username       ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created        ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_banned         ON users(is_banned) WHERE is_banned = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_balance_locked ON users(balance_locked) WHERE balance_locked = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_leaderboard    ON users(total_spent_mmk DESC);

-- user_sessions
CREATE INDEX IF NOT EXISTS idx_sessions_token       ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user        ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active      ON user_sessions(is_active, expires_at) WHERE is_active = TRUE;

-- admin_sessions
CREATE INDEX IF NOT EXISTS idx_admin_sess_token     ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sess_active    ON admin_sessions(is_active, expires_at) WHERE is_active = TRUE;

-- user_locations
CREATE INDEX IF NOT EXISTS idx_loc_user             ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_loc_online           ON user_locations(is_online, last_seen DESC) WHERE is_online = TRUE;
CREATE INDEX IF NOT EXISTS idx_loc_last_seen        ON user_locations(last_seen DESC);

-- balance_transactions
CREATE INDEX IF NOT EXISTS idx_bal_tx_user          ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bal_tx_type          ON balance_transactions(type);
CREATE INDEX IF NOT EXISTS idx_bal_tx_created       ON balance_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bal_tx_user_created  ON balance_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bal_tx_reference     ON balance_transactions(reference_id, reference_type)
  WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bal_tx_window        ON balance_transactions(user_id, created_at DESC, type)
  WHERE type IN ('credit','deposit','admin_credit','refund','bonus');

-- balance_audit_log
CREATE INDEX IF NOT EXISTS idx_audit_user           ON balance_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created        ON balance_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action         ON balance_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_suspicious     ON balance_audit_log(action, created_at DESC)
  WHERE action IN ('suspicious_detected','balance_auto_locked');

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_user          ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created       ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_created  ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_status   ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_g2bulk        ON orders(g2bulk_order_id) WHERE g2bulk_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_type          ON orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_game_code     ON orders(game_code) WHERE game_code IS NOT NULL;

-- deposits
CREATE INDEX IF NOT EXISTS idx_dep_user             ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_dep_status           ON deposits(status);
CREATE INDEX IF NOT EXISTS idx_dep_created          ON deposits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dep_pending          ON deposits(status, created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_dep_payment_method   ON deposits(payment_method_id) WHERE payment_method_id IS NOT NULL;

-- news
CREATE INDEX IF NOT EXISTS idx_news_active          ON news(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_created         ON news(created_at DESC);

-- news_claims
CREATE INDEX IF NOT EXISTS idx_news_claims_news     ON news_claims(news_id);
CREATE INDEX IF NOT EXISTS idx_news_claims_user     ON news_claims(user_id);

-- banners
CREATE INDEX IF NOT EXISTS idx_banners_type         ON banners(type, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_banners_category     ON banners(category_id) WHERE category_id IS NOT NULL;

-- payment_methods
CREATE INDEX IF NOT EXISTS idx_pm_active_sort       ON payment_methods(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_pm_currency          ON payment_methods(currency, is_active);

-- custom_pages
CREATE INDEX IF NOT EXISTS idx_cp_sort              ON custom_pages(sort_order);
CREATE INDEX IF NOT EXISTS idx_cp_active            ON custom_pages(is_active, sort_order);

-- custom_categories
CREATE INDEX IF NOT EXISTS idx_cc_page              ON custom_categories(page_id);
CREATE INDEX IF NOT EXISTS idx_cc_page_sort         ON custom_categories(page_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cc_active            ON custom_categories(is_active, page_id);

-- custom_products
CREATE INDEX IF NOT EXISTS idx_cprod_category       ON custom_products(category_id);
CREATE INDEX IF NOT EXISTS idx_cprod_active         ON custom_products(is_active, category_id);
CREATE INDEX IF NOT EXISTS idx_cprod_stock          ON custom_products(stock) WHERE stock > 0;
CREATE INDEX IF NOT EXISTS idx_cprod_sort           ON custom_products(category_id, sort_order);

-- input_tables
CREATE INDEX IF NOT EXISTS idx_inputs_category      ON input_tables(category_id, sort_order);

-- game_accounts
CREATE INDEX IF NOT EXISTS idx_ga_page              ON game_accounts(page_id);
CREATE INDEX IF NOT EXISTS idx_ga_active_sold       ON game_accounts(is_active, is_sold);
CREATE INDEX IF NOT EXISTS idx_ga_sold              ON game_accounts(is_sold, sold_to_user_id) WHERE is_sold = TRUE;
CREATE INDEX IF NOT EXISTS idx_ga_created           ON game_accounts(created_at DESC);

-- game_account_images
CREATE INDEX IF NOT EXISTS idx_ga_img_account       ON game_account_images(game_account_id, sort_order);

-- game_account_contacts
CREATE INDEX IF NOT EXISTS idx_ga_con_account       ON game_account_contacts(game_account_id, sort_order);

-- feedback
CREATE INDEX IF NOT EXISTS idx_fb_user              ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_fb_category          ON feedback(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fb_active            ON feedback(is_active, created_at DESC);

-- g2bulk_order_cache
CREATE INDEX IF NOT EXISTS idx_g2bc_order           ON g2bulk_order_cache(order_id);
CREATE INDEX IF NOT EXISTS idx_g2bc_g2id            ON g2bulk_order_cache(g2bulk_order_id);

-- webhook_logs
CREATE INDEX IF NOT EXISTS idx_wh_created           ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wh_source_processed  ON webhook_logs(source, processed);

-- admin_activity_logs
CREATE INDEX IF NOT EXISTS idx_aal_created          ON admin_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aal_target           ON admin_activity_logs(target_type, target_id);

-- ================================================================
-- INITIAL DATA: Settings row (safe — inserts only if table empty)
-- ================================================================
INSERT INTO settings (
  site_name, live_text,
  mmk_rate, mmk_profit_percent, usd_profit_percent,
  min_deposit_mmk, max_deposit_mmk,
  min_deposit_usd, max_deposit_usd,
  deposit_note_mmk, deposit_note_usd,
  vpn_block_enabled, registration_enabled
)
SELECT
  'CR7 Game Store',
  'Welcome to CR7 Game Store! 🎮',
  4500, 5, 3,
  1000, 1000000,
  1, 1000,
  'Please transfer the exact amount and upload a clear receipt photo.',
  'Please transfer the exact amount and upload a clear receipt photo.',
  TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM settings);

-- ================================================================
-- NOTE: Image uploads use IMGBB API (env var: IMGBB_API_KEY).
-- Only image URLs are stored in Supabase. No storage buckets needed.
-- ================================================================

-- ================================================================
-- SCHEMA SUMMARY
-- ================================================================
-- Tables (24):
--   users, user_sessions, admin_sessions, settings
--   news, news_claims, banners, payment_methods
--   custom_pages, custom_categories, custom_products, input_tables
--   game_accounts, game_account_images, game_account_contacts
--   user_locations, balance_transactions, balance_audit_log
--   orders, deposits, feedback
--   g2bulk_order_cache, webhook_logs, admin_activity_logs
--
-- Functions (11):
--   update_updated_at_column, ensure_single_settings_row
--   deduct_balance_mmk, add_balance_mmk
--   deduct_balance_usd, add_balance_usd
--   check_balance_integrity (FIXED: no nested DECLARE)
--   update_total_spent_on_order_complete
--   get_admin_overview_stats, cleanup_expired_sessions, refund_order
--
-- Triggers (8):
--   users_updated_at, users_balance_security
--   orders_updated_at, orders_update_total_spent
--   custom_products_updated_at, game_accounts_updated_at
--   settings_updated_at, settings_single_row
--
-- RLS Policies (42): service_role full on all 24 tables
--                    anon/authenticated SELECT on 11 public tables
--
-- Indexes (58): covering all FK columns, search fields, and common filters
-- ================================================================
