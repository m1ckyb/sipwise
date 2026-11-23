-- Fix overly permissive error_logs INSERT RLS policy (prevent anonymous user_id spoofing)
drop policy if exists "Anyone can insert error logs" on public.error_logs;
create policy "Users insert own or anonymous error logs"
  on public.error_logs for insert
  with check (
    (auth.uid() is not null and auth.uid() = user_id)
    or (auth.uid() is null and user_id is null)
  );

-- Replace check_rate_limit with atomic INSERT ... ON CONFLICT DO UPDATE to eliminate 23505 TOCTOU race
create or replace function public.check_rate_limit(
  p_key text,
  p_max_requests integer default 60,
  p_window_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_cutoff timestamptz := v_now - make_interval(secs => p_window_seconds);
  v_count integer;
  v_window_start timestamptz;
begin
  insert into public.rate_limits (key, request_count, window_start)
  values (p_key, 1, v_now)
  on conflict (key) do update set
    request_count = case
      when public.rate_limits.window_start < v_cutoff then 1
      else public.rate_limits.request_count + 1
    end,
    window_start = case
      when public.rate_limits.window_start < v_cutoff then v_now
      else public.rate_limits.window_start
    end
  returning request_count, window_start into v_count, v_window_start;

  return jsonb_build_object(
    'allowed', v_count <= p_max_requests,
    'count', v_count,
    'remaining', greatest(0, p_max_requests - v_count),
    'reset_at', extract(epoch from (v_window_start + make_interval(secs => p_window_seconds)))
  );
end;
$$;
