-- Opprett tabeller og RLS for handlelister i Supabase

-- 1) Tabell for handlelister
create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  store_id uuid references public.stores(id),
  created_at timestamptz not null default now()
);

alter table public.shopping_lists enable row level security;

create policy if not exists "Bruker kan lese egne lister"
  on public.shopping_lists
  for select
  using (auth.uid() = user_id);

create policy if not exists "Bruker kan opprette lister"
  on public.shopping_lists
  for insert
  with check (auth.uid() = user_id);

create policy if not exists "Bruker kan oppdatere egne lister"
  on public.shopping_lists
  for update
  using (auth.uid() = user_id);

create policy if not exists "Bruker kan slette egne lister"
  on public.shopping_lists
  for delete
  using (auth.uid() = user_id);


-- 2) Tabell for varer i handleliste
create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null default 1,
  position integer not null default 0,
  is_purchased boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.shopping_list_items enable row level security;

create policy if not exists "Les egne listevarer"
  on public.shopping_list_items
  for select
  using (
    exists (
      select 1
      from public.shopping_lists l
      where l.id = list_id
        and l.user_id = auth.uid()
    )
  );

create policy if not exists "Opprett varer på egne lister"
  on public.shopping_list_items
  for insert
  with check (
    exists (
      select 1
      from public.shopping_lists l
      where l.id = list_id
        and l.user_id = auth.uid()
    )
  );

create policy if not exists "Oppdater varer på egne lister"
  on public.shopping_list_items
  for update
  using (
    exists (
      select 1
      from public.shopping_lists l
      where l.id = list_id
        and l.user_id = auth.uid()
    )
  );

create policy if not exists "Slett varer på egne lister"
  on public.shopping_list_items
  for delete
  using (
    exists (
      select 1
      from public.shopping_lists l
      where l.id = list_id
        and l.user_id = auth.uid()
    )
  );

