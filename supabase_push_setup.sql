-- SQL commands to run in your Supabase SQL Editor.
-- Run this file to set up both Cloud Sync and Push Notification support.

-- ============================================================
-- 1. user_data table (Cloud Sync)
-- ============================================================

-- Create table if it doesn't already exist
create table if not exists public.user_data (
  id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb,
  drinks jsonb,
  presets jsonb,
  is_sober boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.user_data enable row level security;

-- Users can only read and write their own row
create policy "Users can read own data"
  on public.user_data for select
  using (auth.uid() = id);

create policy "Users can insert own data"
  on public.user_data for insert
  with check (auth.uid() = id);

create policy "Users can update own data"
  on public.user_data for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can delete own data"
  on public.user_data for delete
  using (auth.uid() = id);


-- ============================================================
-- 2. push_subscriptions table (Push Notifications)
-- ============================================================

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Performance Index
create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions(user_id);

-- Enable Row Level Security
alter table public.push_subscriptions enable row level security;

-- Restrict inserts to authenticated users only (prevents anonymous spam)
create policy "Allow insert for authenticated users only"
  on public.push_subscriptions for insert
  with check (auth.uid() is not null and auth.uid() = user_id);

-- Allow users to manage their own subscriptions
create policy "Allow select access for owner"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Allow update access for owner"
  on public.push_subscriptions for update
  using (auth.uid() = user_id);

create policy "Allow delete access for owner"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);


-- ============================================================
-- 3. Auto-update triggers
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger set_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row
  execute function public.handle_updated_at();


-- ============================================================
-- Developer notes
-- ============================================================
-- To send a push notification from Supabase Edge Functions or a Node.js backend:
--
-- const webpush = require('web-push');
-- webpush.setVapidDetails(
--   'mailto:your-email@example.com',
--   process.env.VITE_VAPID_PUBLIC_KEY,   // from your .env / GitHub secret
--   process.env.VAPID_PRIVATE_KEY        // keep this server-side ONLY, never in .env committed to git
-- );
-- webpush.sendNotification(subscriptionObj, JSON.stringify({
--   title: 'Sober Alert!',
--   body: 'Your estimated BAC is now back to 0.00%. You are sober!'
-- }));

-- ============================================================
-- 4. Set up periodic check for Sober Alerts via pg_cron
-- ============================================================
-- To automatically check user BACs and send alerts, enable pg_cron 
-- and schedule the `check-alerts` edge function to run every 5 minutes.
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- -- IMPORTANT: You MUST replace 'YOUR_PROJECT_REF' and 'YOUR_ANON_KEY' below
-- -- with your actual Supabase project reference and anon key for automated alerts to work!
-- -- Otherwise, the sober notifications will never be sent.
-- SELECT cron.schedule(
--   'check-bac-alerts',
--   '*/5 * * * *', -- Every 5 minutes
--   $$
--   SELECT net.http_post(
--     url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-alerts',
--     headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
--     body:='{}'::jsonb
--   ) as request_id;
--   $$
-- );
