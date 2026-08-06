-- Migration: Security hardening — token blacklist hash + push_subscriptions RLS fix
-- Addresses: SEC-002 (raw JWT in blacklist), DB-002 (permissive RLS on push_subscriptions)

-- ============================================================
-- 1. Rename token → token_hash in sipwise_token_blacklist
--    Stores SHA-256(JWT) instead of the raw token string.
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'sipwise_token_blacklist' and column_name = 'token'
  ) then
    alter table public.sipwise_token_blacklist rename column token to token_hash;
  end if;
end $$;

-- Truncate existing blacklist rows — they used raw tokens and cannot be migrated
-- (old sessions will simply need to be re-logged-out if users were logged in)
truncate table public.sipwise_token_blacklist;

-- ============================================================
-- 2. Fix push_subscriptions RLS: remove all unauthenticated access
--    The original policies allowed auth.uid() IS NULL (i.e., anonymous users).
-- ============================================================
drop policy if exists "Allow insert for push subscriptions" on public.push_subscriptions;
drop policy if exists "Allow select access for owner" on public.push_subscriptions;
drop policy if exists "Allow update access for owner" on public.push_subscriptions;
drop policy if exists "Allow delete access for owner" on public.push_subscriptions;
-- Also drop the policy added by the linter fix migration in case it still exists
drop policy if exists "Allow insert access for all" on public.push_subscriptions;

create policy "Authenticated users can insert own subscription"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can read own subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can update own subscriptions"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);
