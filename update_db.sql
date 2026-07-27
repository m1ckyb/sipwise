ALTER TABLE public.user_data ADD COLUMN IF NOT EXISTS is_sober boolean default true;

-- Ensure api_keys table columns exist
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_hash text;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_prefix text;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS last_used_at timestamp with time zone;

-- Relational drinks table & performance index
CREATE TABLE IF NOT EXISTS public.drinks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'Drink',
  volume numeric not null check (volume > 0),
  abv numeric not null check (abv >= 0 and abv <= 100),
  calories numeric default null,
  timestamp timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

CREATE INDEX IF NOT EXISTS idx_drinks_user_id_timestamp ON public.drinks(user_id, timestamp desc);
ALTER TABLE public.drinks ENABLE ROW LEVEL SECURITY;

-- Idempotency Keys table for request deduplication
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  response_body jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON public.idempotency_keys(created_at);
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Rate Limits Table & Function
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text primary key,
  request_count integer default 1,
  window_start timestamp with time zone default timezone('utc'::text, now()) not null
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON public.rate_limits(window_start);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max_requests integer default 60,
  p_window_seconds integer default 60
) RETURNS jsonb AS $$
DECLARE
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_record public.rate_limits%rowtype;
  v_allowed boolean := true;
  v_current_count integer := 1;
BEGIN
  SELECT * INTO v_record FROM public.rate_limits WHERE key = p_key FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (key, request_count, window_start)
    VALUES (p_key, 1, v_now);
    v_current_count := 1;
    v_allowed := true;
  ELSE
    IF (EXTRACT(epoch FROM (v_now - v_record.window_start))) > p_window_seconds THEN
      UPDATE public.rate_limits
      SET request_count = 1, window_start = v_now
      WHERE key = p_key;
      v_current_count := 1;
      v_allowed := true;
    ELSE
      IF v_record.request_count >= p_max_requests THEN
        v_allowed := false;
        v_current_count := v_record.request_count;
      ELSE
        UPDATE public.rate_limits
        SET request_count = request_count + 1
        WHERE key = p_key;
        v_current_count := v_record.request_count + 1;
        v_allowed := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'count', v_current_count,
    'max', p_max_requests
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Error Logs Table for APM Stack Traces
CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  error_message text not null,
  stack_trace text,
  source text default 'frontend',
  context jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs(created_at desc);
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'error_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON public.error_logs(user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sipwise_error_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_sipwise_error_logs_user_id ON public.sipwise_error_logs(user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sipwise_token_blacklist (
  token text primary key,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON public.sipwise_token_blacklist(expires_at);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- IMPORTANT: You MUST replace 'YOUR_PROJECT_REF' and 'YOUR_ANON_KEY' below
-- with your actual Supabase project reference and anon key for automated alerts to work!
-- Otherwise, the sober notifications will never be sent.
SELECT cron.schedule(
  'check-bac-alerts',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-alerts',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
