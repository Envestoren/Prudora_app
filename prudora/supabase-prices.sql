-- Prissystem: product_prices per butikk + admin-innstilling for approval
-- Kjør dette skriptet i Supabase SQL editor eller via MCP (apply_migration).

-- 1) Singleton settings
create table if not exists public.price_settings (
  id integer primary key default 1 check (id = 1),
  requires_price_approval boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.price_settings (id, requires_price_approval)
values (1, false)
on conflict (id) do nothing;

-- 2) Pris-historikk
create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  price_amount numeric not null,
  recorded_at timestamptz not null default now(),
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz
);

-- 3) Trigger: auto-godkjenn når approval er slått av
create or replace function public.product_prices_apply_approval_setting()
returns trigger
language plpgsql
as $$
declare
  requires boolean;
begin
  select ps.requires_price_approval into requires
  from public.price_settings ps
  where ps.id = 1
  limit 1;

  if requires is null then
    requires := false;
  end if;

  if requires then
    NEW.approval_status := 'pending';
    NEW.approved_by := null;
    NEW.approved_at := null;
  else
    NEW.approval_status := 'approved';
    NEW.approved_by := null;
    NEW.approved_at := now();
  end if;

  return NEW;
end;
$$;

drop trigger if exists product_prices_approval_setting_trigger on public.product_prices;
create trigger product_prices_approval_setting_trigger
before insert on public.product_prices
for each row
execute function public.product_prices_apply_approval_setting();

-- 4) Indekser
create index if not exists product_prices_product_store_approved_idx
  on public.product_prices (product_id, store_id, recorded_at desc)
  where approval_status = 'approved';

create index if not exists product_prices_approval_status_idx
  on public.product_prices (approval_status, recorded_at desc);

-- 5) RLS
alter table public.price_settings enable row level security;
alter table public.product_prices enable row level security;

-- 5a) Policies (Postgres støtter ikke CREATE POLICY IF NOT EXISTS)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'price_settings'
      and policyname = 'Read price settings'
  ) then
    create policy "Read price settings" on public.price_settings
      for select
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'price_settings'
      and policyname = 'Admin update price settings'
  ) then
    create policy "Admin update price settings" on public.price_settings
      for update
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_prices'
      and policyname = 'Read product prices (approved + admin)'
  ) then
    create policy "Read product prices (approved + admin)" on public.product_prices
      for select
      using (approval_status = 'approved' or public.is_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_prices'
      and policyname = 'Insert product prices for verified users'
  ) then
    create policy "Insert product prices for verified users" on public.product_prices
      for insert
      with check (
        auth.uid() is not null
        and user_id = auth.uid()
        and (
          select p.is_price_verified
          from public.profiles p
          where p.id = auth.uid()
        ) = true
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_prices'
      and policyname = 'Admin update product prices'
  ) then
    create policy "Admin update product prices" on public.product_prices
      for update
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

