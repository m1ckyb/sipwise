-- SQL commands to run in your Supabase SQL Editor.
-- Run this file to set up the API Keys table for external integrations (e.g. Home Assistant)

-- ============================================================
-- 1. api_keys table
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

-- Migration for existing databases: ensure all required columns exist
alter table public.api_keys add column if not exists key_hash text;
alter table public.api_keys add column if not exists key_prefix text;
alter table public.api_keys add column if not exists last_used_at timestamp with time zone;

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
-- 2. In-Database Rate Limiter RPC
-- ============================================================
create table if not exists public.rate_limits (
  key text primary key,
  request_count integer default 1,
  window_start timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_rate_limits_window_start on public.rate_limits(window_start);

create or replace function public.check_rate_limit(
  p_key text,
  p_max_requests integer default 60,
  p_window_seconds integer default 60
) returns jsonb as $$
declare
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_record public.rate_limits%rowtype;
  v_allowed boolean := true;
  v_current_count integer := 1;
begin
  select * into v_record from public.rate_limits where key = p_key for update;

  if not found then
    insert into public.rate_limits (key, request_count, window_start)
    values (p_key, 1, v_now);
    v_current_count := 1;
    v_allowed := true;
  else
    if (extract(epoch from (v_now - v_record.window_start))) > p_window_seconds then
      update public.rate_limits
      set request_count = 1, window_start = v_now
      where key = p_key;
      v_current_count := 1;
      v_allowed := true;
    else
      if v_record.request_count >= p_max_requests then
        v_allowed := false;
        v_current_count := v_record.request_count;
      else
        update public.rate_limits
        set request_count = request_count + 1
        where key = p_key;
        v_current_count := v_record.request_count + 1;
        v_allowed := true;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'count', v_current_count,
    'max', p_max_requests
  );
end;
$$ language plpgsql security definer;


-- ============================================================
-- 2. Developer / User Instructions
-- ============================================================
-- After running this script:
-- 1. Create an API key in the `api_keys` table for your user account.
--    You can generate a random string to use as the `key`.
-- 2. Use this `key` in the `x-api-key` header of your HTTP requests to the Edge Function.
