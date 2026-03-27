-- Produktabonnement med varselgrenser per bruker og produkt.
-- Stotter prosentnedgang, absolutt prisnedgang i kroner, eller begge.

create table if not exists public.user_product_price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  enabled boolean not null default true,
  percent_drop numeric,
  absolute_drop_kr numeric,
  threshold_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists user_product_price_alerts_user_idx
  on public.user_product_price_alerts (user_id);

create index if not exists user_product_price_alerts_product_idx
  on public.user_product_price_alerts (product_id);

alter table public.user_product_price_alerts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_product_price_alerts'
      and policyname = 'user_product_price_alerts_select_own'
  ) then
    create policy "user_product_price_alerts_select_own"
      on public.user_product_price_alerts for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_product_price_alerts'
      and policyname = 'user_product_price_alerts_insert_own'
  ) then
    create policy "user_product_price_alerts_insert_own"
      on public.user_product_price_alerts for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_product_price_alerts'
      and policyname = 'user_product_price_alerts_update_own'
  ) then
    create policy "user_product_price_alerts_update_own"
      on public.user_product_price_alerts for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_product_price_alerts'
      and policyname = 'user_product_price_alerts_delete_own'
  ) then
    create policy "user_product_price_alerts_delete_own"
      on public.user_product_price_alerts for delete
      using (auth.uid() = user_id);
  end if;
end $$;
