-- Admin-rettigheter: is_admin på profiles. Nye brukere er vanlige brukere.
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- E-post på profil (for admin-liste; synkroniseres fra auth.users ved registrering)
alter table public.profiles
  add column if not exists email text;

-- Trigger: sett også email ved ny bruker
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, age, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce((new.raw_user_meta_data->>'age')::int, 0),
    new.email
  );
  return new;
end;
$$;

-- Admins kan lese alle profiler (for brukerliste i admin-panel)
create policy "Admins kan lese alle profiler"
  on public.profiles for select
  using (
    (select p.is_admin from public.profiles p where p.id = auth.uid()) = true
  );

-- Admins kan oppdatere is_admin på andre profiler (kun denne kolonnen bør endres av admin-panel)
-- Vi tillater at admins oppdaterer alle profiler; appen begrenser til kun is_admin.
create policy "Admins kan oppdatere alle profiler"
  on public.profiles for update
  using (
    (select p.is_admin from public.profiles p where p.id = auth.uid()) = true
  )
  with check (
    (select p.is_admin from public.profiles p where p.id = auth.uid()) = true
  );

-- Sikre at kun admins kan sette is_admin = true (forhindrer at vanlige brukere gjør seg selv til admin)
create or replace function public.check_is_admin_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Hvis noen prøver å sette is_admin = true, må den som oppdaterer selv være admin
  if new.is_admin = true and (old.is_admin = false or old.is_admin is null) then
    if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
      raise exception 'Kun admins kan gi admin-rettigheter';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_check_admin_update
  before update on public.profiles
  for each row execute procedure public.check_is_admin_update();

-- Første admin må settes manuelt i Supabase (SQL Editor), f.eks.:
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'din-admin@epost.no');
