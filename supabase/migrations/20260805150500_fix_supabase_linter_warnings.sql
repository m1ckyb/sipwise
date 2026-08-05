-- Migration to fix Supabase database linter warnings/security recommendations

-- 1. Fix mutable search paths on functions by explicitly setting search_path
alter function public.handle_updated_at() set search_path = public, pg_temp;
alter function public.check_rate_limit(text, integer, integer) set search_path = public, pg_temp;
alter function public.add_drink_atomic(uuid, text, numeric, numeric, numeric, timestamp with time zone) set search_path = public, pg_temp;

-- 2. Revoke execute permission on SECURITY DEFINER functions from public/anon/authenticated roles
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.add_drink_atomic(uuid, text, numeric, numeric, numeric, timestamp with time zone) from public, anon, authenticated;


-- 4. Drop overly permissive RLS policy on push_subscriptions if it exists
drop policy if exists "Allow insert access for all" on public.push_subscriptions;
