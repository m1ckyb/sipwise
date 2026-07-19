-- Supabase Managed Migration: Relational drinks schema, idempotency, and indexing

-- ============================================================
-- 1. Relational drinks table
-- ============================================================
create table if not exists public.drinks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'Drink',
  volume numeric not null check (volume > 0),
  abv numeric not null check (abv >= 0 and abv <= 100),
  calories numeric default null,
  timestamp timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Performance Index on user_id and timestamp
create index if not exists idx_drinks_user_id_timestamp on public.drinks(user_id, timestamp desc);

-- Enable RLS
alter table public.drinks enable row level security;

-- Row Level Security Policies for drinks table
create policy "Users can read own drinks"
  on public.drinks for select
  using (auth.uid() = user_id);

create policy "Users can insert own drinks"
  on public.drinks for insert
  with check (auth.uid() = user_id);

create policy "Users can update own drinks"
  on public.drinks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own drinks"
  on public.drinks for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 2. Idempotency Keys table for API request deduplication
-- ============================================================
create table if not exists public.idempotency_keys (
  key text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  response_body jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for expiring old idempotency keys
create index if not exists idx_idempotency_keys_created_at on public.idempotency_keys(created_at);

-- RLS for idempotency_keys
alter table public.idempotency_keys enable row level security;

create policy "Users can read own idempotency keys"
  on public.idempotency_keys for select
  using (auth.uid() = user_id);

create policy "Users can insert own idempotency keys"
  on public.idempotency_keys for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- 3. Atomic Stored Procedure: add_drink_atomic
-- ============================================================
create or replace function public.add_drink_atomic(
  p_user_id uuid,
  p_name text,
  p_volume numeric,
  p_abv numeric,
  p_calories numeric default null,
  p_timestamp timestamp with time zone default now()
) returns jsonb as $$
declare
  v_new_drink public.drinks%rowtype;
begin
  insert into public.drinks (user_id, name, volume, abv, calories, timestamp)
  values (p_user_id, coalesce(p_name, 'Drink'), p_volume, p_abv, p_calories, p_timestamp)
  returning * into v_new_drink;

  return row_to_json(v_new_drink)::jsonb;
end;
$$ language plpgsql security definer;

-- ============================================================
-- 4. One-time Backfill Trigger from user_data.drinks JSONB if present
-- ============================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_data') then
    insert into public.drinks (id, user_id, name, volume, abv, calories, timestamp)
    select 
      coalesce((d->>'id')::uuid, gen_random_uuid()),
      u.id,
      coalesce(d->>'name', 'Drink'),
      coalesce((d->>'volume')::numeric, 330),
      coalesce((d->>'abv')::numeric, 5),
      (d->>'calories')::numeric,
      case 
        when (d->>'timestamp')::numeric > 10000000000 then to_timestamp((d->>'timestamp')::double precision / 1000)
        else now()
      end
    from public.user_data u,
    jsonb_array_elements(u.drinks) d
    on conflict (id) do nothing;
  end if;
exception
  when others then null;
end $$;
