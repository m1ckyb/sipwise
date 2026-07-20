-- SipWise Local Mode — PostgreSQL Schema
-- Adapted from Supabase migrations for standalone PostgreSQL usage.
-- Loaded automatically by docker-entrypoint-initdb.d.

-- ============================================================
-- 1. Users table (replaces Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS sipwise_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 2. User Data (cloud sync payload)
-- ============================================================
CREATE TABLE IF NOT EXISTS sipwise_user_data (
  id UUID PRIMARY KEY REFERENCES sipwise_users(id) ON DELETE CASCADE,
  profile JSONB,
  drinks JSONB,
  presets JSONB,
  is_sober BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 3. Push Subscriptions (web push)
-- ============================================================
CREATE TABLE IF NOT EXISTS sipwise_push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id UUID REFERENCES sipwise_users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON sipwise_push_subscriptions(user_id);

-- ============================================================
-- 4. API Keys (for external integrations like Home Assistant)
-- ============================================================
CREATE TABLE IF NOT EXISTS sipwise_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES sipwise_users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON sipwise_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON sipwise_api_keys(key_hash);

-- ============================================================
-- 5. Idempotency Keys (API request deduplication)
-- ============================================================
CREATE TABLE IF NOT EXISTS sipwise_idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id UUID REFERENCES sipwise_users(id) ON DELETE CASCADE NOT NULL,
  response_body JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at
  ON sipwise_idempotency_keys(created_at);

-- ============================================================
-- 6. Rate Limits (in-database rate limiter)
-- ============================================================
CREATE TABLE IF NOT EXISTS sipwise_rate_limits (
  key TEXT PRIMARY KEY,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON sipwise_rate_limits(window_start);

-- ============================================================
-- 7. Error Logs (frontend APM)
-- ============================================================
CREATE TABLE IF NOT EXISTS sipwise_error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES sipwise_users(id) ON DELETE SET NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  source TEXT DEFAULT 'frontend',
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at
  ON sipwise_error_logs(created_at DESC);

-- ============================================================
-- 8. Audit Trail (security and compliance logging)
-- ============================================================
CREATE TABLE IF NOT EXISTS sipwise_audit_trail (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES sipwise_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id
  ON sipwise_audit_trail(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at
  ON sipwise_audit_trail(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_trail_action
  ON sipwise_audit_trail(action);

-- ============================================================
-- 9. Auto-update updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_push_subscriptions_updated_at
  BEFORE UPDATE ON sipwise_push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();
