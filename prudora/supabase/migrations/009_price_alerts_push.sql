-- Prisvarsler (produktabonnement) + push-token + dedup-events
-- Kjør via Supabase CLI eller SQL Editor.

-- 1) Globale innstillinger per bruker
create table if not exists public.user_price_alert_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  global_percent_drop numeric,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 2) Hvilke butikker varsler gjelder for (tom liste = ingen butikker → ingen varsler)
create table if not exists public.user_price_alert_store_filters (
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

-- 3) Abonnement per produkt + valgfrie overstyringer
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

-- 4) Expo push tokens
create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  unique (expo_push_token)
);

-- 5) Dedup: én sending per (abonnement, pris-rad)
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

create index if not exists user_push_tokens_user_id_idx on public.user_push_tokens (user_id);
create index if not exists user_product_price_alerts_user_idx on public.user_product_price_alerts (user_id);
create index if not exists user_product_price_alerts_product_idx on public.user_product_price_alerts (product_id);
create index if not exists user_price_alert_events_user_id_idx on public.user_price_alert_events (user_id);

-- RLS
alter table public.user_price_alert_settings enable row level security;
alter table public.user_price_alert_store_filters enable row level security;
alter table public.user_product_price_alerts enable row level security;
alter table public.user_push_tokens enable row level security;
alter table public.user_price_alert_events enable row level security;

-- Policies: bruker ser/kun egne rader (events kun server-side via service role — ingen brukerpolicies)
create policy "user_price_alert_settings_select_own"
  on public.user_price_alert_settings for select
  using (auth.uid() = user_id);

create policy "user_price_alert_settings_insert_own"
  on public.user_price_alert_settings for insert
  with check (auth.uid() = user_id);

create policy "user_price_alert_settings_update_own"
  on public.user_price_alert_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_price_alert_settings_delete_own"
  on public.user_price_alert_settings for delete
  using (auth.uid() = user_id);

create policy "user_price_alert_store_filters_select_own"
  on public.user_price_alert_store_filters for select
  using (auth.uid() = user_id);

create policy "user_price_alert_store_filters_insert_own"
  on public.user_price_alert_store_filters for insert
  with check (auth.uid() = user_id);

create policy "user_price_alert_store_filters_delete_own"
  on public.user_price_alert_store_filters for delete
  using (auth.uid() = user_id);

create policy "user_product_price_alerts_select_own"
  on public.user_product_price_alerts for select
  using (auth.uid() = user_id);

create policy "user_product_price_alerts_insert_own"
  on public.user_product_price_alerts for insert
  with check (auth.uid() = user_id);

create policy "user_product_price_alerts_update_own"
  on public.user_product_price_alerts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_product_price_alerts_delete_own"
  on public.user_product_price_alerts for delete
  using (auth.uid() = user_id);

create policy "user_push_tokens_select_own"
  on public.user_push_tokens for select
  using (auth.uid() = user_id);

create policy "user_push_tokens_insert_own"
  on public.user_push_tokens for insert
  with check (auth.uid() = user_id);

create policy "user_push_tokens_update_own"
  on public.user_push_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_push_tokens_delete_own"
  on public.user_push_tokens for delete
  using (auth.uid() = user_id);

-- user_price_alert_events: brukere kan lese egne events (for Expo Go polling-fallback)
create policy "user_price_alert_events_select_own"
  on public.user_price_alert_events for select
  using (auth.uid() = user_id);
