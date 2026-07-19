-- Supabase Managed Migration: In-Database Rate Limiting and Error Logging

-- ============================================================
-- 1. Rate Limits Table & Stored Procedure
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
-- 2. Error Logs Table for APM Stack Traces
-- ============================================================
create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  error_message text not null,
  stack_trace text,
  source text default 'frontend',
  context jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_error_logs_created_at on public.error_logs(created_at desc);

alter table public.error_logs enable row level security;

create policy "Anyone can insert error logs"
  on public.error_logs for insert
  with check (auth.uid() = user_id or user_id is null or auth.uid() is null);

create policy "Users read own error logs"
  on public.error_logs for select
  using (auth.uid() = user_id);
