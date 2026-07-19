ALTER TABLE public.user_data ADD COLUMN IF NOT EXISTS is_sober boolean default true;

-- Add performance indexes for foreign key lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);

-- Add key_hash and key_prefix columns to api_keys if table exists
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_keys') THEN
    ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_hash text;
    ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_prefix text;
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);
  END IF;
END $$;

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
