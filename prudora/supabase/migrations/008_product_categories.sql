-- Kategorier for matprodukter (kun admins).
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_categories enable row level security;

create policy "Kun admins kan lese kategorier"
  on public.product_categories for select
  using (public.current_user_is_admin());

create policy "Kun admins kan opprette kategorier"
  on public.product_categories for insert
  with check (public.current_user_is_admin());

create policy "Kun admins kan oppdatere kategorier"
  on public.product_categories for update
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy "Kun admins kan slette kategorier"
  on public.product_categories for delete
  using (public.current_user_is_admin());
