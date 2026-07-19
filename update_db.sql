ALTER TABLE public.user_data ADD COLUMN IF NOT EXISTS is_sober boolean default true;

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

-- Rate Limits Table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text primary key,
  request_count integer default 1,
  window_start timestamp with time zone default timezone('utc'::text, now()) not null
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON public.rate_limits(window_start);

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
