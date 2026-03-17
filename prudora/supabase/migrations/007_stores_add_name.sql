-- Butikknavn (f.eks. Coop Extra "Brekkeveien")
alter table public.stores add column if not exists name text;
