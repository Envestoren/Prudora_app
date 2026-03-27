-- Slett egen konto uten å slette prisdata.
-- Beholder produkt- og pris-historikk ved å anonymisere brukerreferanser.

-- product_prices.user_id må kunne settes til null slik at historiske priser beholdes.
alter table public.product_prices
  alter column user_id drop not null;

alter table public.product_prices
  drop constraint if exists product_prices_user_id_fkey;

alter table public.product_prices
  add constraint product_prices_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- Slett innlogget bruker:
-- 1) Nuller brukerreferanser som ellers kan blokkere sletting
-- 2) Sletter auth-bruker (cascader til profiler/varseltabeller)
create or replace function public.delete_my_account_preserve_prices()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.product_prices
  set user_id = null
  where user_id = uid;

  update public.products
  set submitted_by = null
  where submitted_by = uid;

  update public.products
  set approved_by = null
  where approved_by = uid;

  delete from auth.users
  where id = uid;
end;
$$;

revoke all on function public.delete_my_account_preserve_prices() from public;
grant execute on function public.delete_my_account_preserve_prices() to authenticated;
