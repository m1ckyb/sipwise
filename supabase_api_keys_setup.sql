-- SQL commands to run in your Supabase SQL Editor.
-- Run this file to set up the API Keys table for external integrations (e.g. Home Assistant)

-- ============================================================
-- 1. api_keys table
-- ============================================================

create table if not exists public.api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  key_hash text unique not null,
  key_prefix text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_used_at timestamp with time zone
);

-- Performance & Security Indexes
create index if not exists idx_api_keys_user_id on public.api_keys(user_id);
create index if not exists idx_api_keys_key_hash on public.api_keys(key_hash);

-- Enable Row Level Security
alter table public.api_keys enable row level security;

-- Users can only read and manage their own API keys
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
-- 2. Developer / User Instructions
-- ============================================================
-- After running this script:
-- 1. Create an API key in the `api_keys` table for your user account.
--    You can generate a random string to use as the `key`.
-- 2. Use this `key` in the `x-api-key` header of your HTTP requests to the Edge Function.
