-- Butikker: kun admins kan lese/skrive (bruk current_user_is_admin()).
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  chain text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stores enable row level security;

create policy "Kun admins kan lese butikker"
  on public.stores for select
  using (public.current_user_is_admin());

create policy "Kun admins kan opprette butikker"
  on public.stores for insert
  with check (public.current_user_is_admin());

create policy "Kun admins kan oppdatere butikker"
  on public.stores for update
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Kun admins kan slette butikker"
  on public.stores for delete
  using (public.current_user_is_admin());
