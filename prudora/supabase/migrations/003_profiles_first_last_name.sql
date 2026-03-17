-- Profiler: fornavn og etternavn separat (erstatter full_name).

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

-- Migrer eksisterende full_name til first_name/last_name (første ord = fornavn, resten = etternavn)
update public.profiles
set
  first_name = coalesce(nullif(trim(split_part(full_name, ' ', 1)), ''), ''),
  last_name = coalesce(nullif(trim(substring(full_name from position(' ' in full_name || ' ') + 1)), ''), '')
where full_name is not null and (first_name is null or last_name is null);

update public.profiles set first_name = coalesce(first_name, ''), last_name = coalesce(last_name, '');

-- Fjern gammel kolonne og sett not null
alter table public.profiles drop column if exists full_name;
alter table public.profiles alter column first_name set not null;
alter table public.profiles alter column last_name set not null;

-- Trigger: bruk first_name og last_name fra user_metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, age)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce((new.raw_user_meta_data->>'age')::int, 0)
  );
  return new;
end;
$$;
