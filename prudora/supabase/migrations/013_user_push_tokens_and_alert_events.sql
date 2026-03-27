-- Tabeller for push-token og sendt-varsel historikk.

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  unique (expo_push_token)
);

create table if not exists public.user_price_alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  alert_id uuid not null references public.user_product_price_alerts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete restrict,
  product_price_id uuid not null references public.product_prices (id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique (alert_id, product_price_id)
);

create index if not exists user_push_tokens_user_id_idx
  on public.user_push_tokens (user_id);

create index if not exists user_price_alert_events_user_id_idx
  on public.user_price_alert_events (user_id);

alter table public.user_push_tokens enable row level security;
alter table public.user_price_alert_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_push_tokens' and policyname='user_push_tokens_select_own'
  ) then
    create policy "user_push_tokens_select_own"
      on public.user_push_tokens for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_push_tokens' and policyname='user_push_tokens_insert_own'
  ) then
    create policy "user_push_tokens_insert_own"
      on public.user_push_tokens for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_push_tokens' and policyname='user_push_tokens_update_own'
  ) then
    create policy "user_push_tokens_update_own"
      on public.user_push_tokens for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_push_tokens' and policyname='user_push_tokens_delete_own'
  ) then
    create policy "user_push_tokens_delete_own"
      on public.user_push_tokens for delete
      using (auth.uid() = user_id);
  end if;
end $$;
