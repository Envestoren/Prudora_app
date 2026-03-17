-- Midlertidig: sett alle eksisterende profiler til admin slik at du kan logge inn første gang.
-- Etterpå kan du fjerne admin-rettigheter fra enkeltbrukere i admin-panelet.
update public.profiles
set is_admin = true
where true;
