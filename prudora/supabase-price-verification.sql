-- Pris-verifisering for brukere i Prudora
-- Kjør dette skriptet i Supabase-prosjektet ditt (SQL editor).

alter table public.profiles
  add column if not exists is_price_verified boolean not null default false;

alter table public.profiles
  add column if not exists price_verification_requested_at timestamptz null;

