-- Produkter: strekkode + admin-godkjenning
-- Kjør dette skriptet i Supabase-prosjektet ditt (SQL editor).
--
-- Mål:
-- - Legg til unik strekkode per produkt
-- - Nye produkter fra app settes til approval_status = 'pending'
-- - Admin kan godkjenne/avvise i prudora-admin
--
-- Merk:
-- - Dette skriptet forsøker å være trygt å kjøre flere ganger (IF NOT EXISTS der mulig).
-- - Policies opprettes bare dersom RLS er aktivert på tabellen.

-- 1) Nye kolonner
alter table public.products
  add column if not exists barcode text null;

alter table public.products
  add column if not exists approval_status text not null default 'approved';

alter table public.products
  add column if not exists submitted_by uuid null references auth.users(id);

alter table public.products
  add column if not exists submitted_at timestamptz not null default now();

alter table public.products
  add column if not exists approved_by uuid null references auth.users(id);

alter table public.products
  add column if not exists approved_at timestamptz null;

-- 2) Unik indeks på barcode (bare når barcode ikke er null)
create unique index if not exists products_barcode_uniq
  on public.products (barcode)
  where barcode is not null;

-- 3) Valider approval_status (enkel CHECK)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_approval_status_check'
  ) then
    alter table public.products
      add constraint products_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- 4) Helper: sjekk admin basert på profiles.is_admin
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((
    select p.is_admin
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

-- 5) RLS policies (kun hvis RLS er aktivert)
do $$
declare
  rls_enabled boolean;
begin
  select c.relrowsecurity
  into rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'products';

  if rls_enabled then
    -- Lesing: alle kan lese godkjente produkter
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'Read approved products'
    ) then
      create policy "Read approved products"
        on public.products
        for select
        using (approval_status = 'approved');
    end if;

    -- Insert: innloggede brukere kan opprette kun pending-produkter
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'Insert pending products'
    ) then
      create policy "Insert pending products"
        on public.products
        for insert
        with check (
          auth.uid() is not null
          and approval_status = 'pending'
          and submitted_by = auth.uid()
        );
    end if;

    -- Update: kun admin kan oppdatere produkter (inkl. godkjenning/strekkode)
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'Admin update products'
    ) then
      create policy "Admin update products"
        on public.products
        for update
        using (public.is_admin());
    end if;

    -- Delete: kun admin
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and policyname = 'Admin delete products'
    ) then
      create policy "Admin delete products"
        on public.products
        for delete
        using (public.is_admin());
    end if;
  end if;
end $$;

