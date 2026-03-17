-- Profiler: navn, alder og kobling til auth.users.
-- E-post lagres i auth.users (Supabase Auth).
--
-- Aktiver e-postbekreftelse i Supabase:
-- Dashboard → Authentication → Providers → Email → "Confirm email" = ON.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  age int not null check (age >= 0 and age <= 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: opprett profil når en ny bruker registreres (navn og alder fra user_metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, age)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'age')::int, 0)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS: brukere kan lese og oppdatere sin egen profil.
alter table public.profiles enable row level security;

create policy "Brukere kan lese egen profil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Brukere kan oppdatere egen profil"
  on public.profiles for update
  using (auth.uid() = id);

-- Service role kan sette inn ved behov (f.eks. hvis trigger feiler)
create policy "Brukere kan sette inn egen profil"
  on public.profiles for insert
  with check (auth.uid() = id);
