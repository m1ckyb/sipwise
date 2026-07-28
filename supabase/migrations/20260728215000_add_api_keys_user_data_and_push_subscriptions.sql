-- Migration: Cloud Sync, Push Notifications, API Keys, and Token Blacklist

-- ============================================================
-- 1. user_data table (Cloud Sync)
-- ============================================================
create table if not exists public.user_data (
  id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb,
  drinks jsonb,
  presets jsonb,
  is_sober boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_data enable row level security;

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

create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "Allow insert for push subscriptions"
  on public.push_subscriptions for insert
  with check (user_id is null or auth.uid() = user_id or auth.uid() is null);

create policy "Allow select access for owner"
  on public.push_subscriptions for select
  using (user_id is null or auth.uid() = user_id or auth.uid() is null);

create policy "Allow update access for owner"
  on public.push_subscriptions for update
  using (user_id is null or auth.uid() = user_id or auth.uid() is null)
  with check (user_id is null or auth.uid() = user_id or auth.uid() is null);

create policy "Allow delete access for owner"
  on public.push_subscriptions for delete
  using (user_id is null or auth.uid() = user_id or auth.uid() is null);

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
-- 3. api_keys table (Home Assistant / External Integrations)
-- ============================================================
create table if not exists public.api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  key_hash text unique,
  key_prefix text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_used_at timestamp with time zone
);

create index if not exists idx_api_keys_user_id on public.api_keys(user_id);
create index if not exists idx_api_keys_key_hash on public.api_keys(key_hash);

alter table public.api_keys enable row level security;

create policy "Users can read own api keys"
  on public.api_keys for select
  using (auth.uid() = user_id);

create policy "Users can insert own api keys"
  on public.api_keys for insert
  with check (auth.uid() = user_id);

create policy "Users can update own api keys"
  on public.api_keys for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own api keys"
  on public.api_keys for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 4. sipwise_token_blacklist (Session Invalidation)
-- ============================================================
create table if not exists public.sipwise_token_blacklist (
  token text primary key,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_token_blacklist_expires_at on public.sipwise_token_blacklist(expires_at);

-- ============================================================
-- 5. Additional Performance Indexes
-- ============================================================
create index if not exists idx_error_logs_user_id on public.error_logs(user_id);

-- ============================================================
-- 6. Cron Schedule for automated alerts
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Note: The user/admin will need to manually set or update the schedule
-- with their actual project reference and anon keys as needed.
