# Prudora Admin

Admin-nettside for Prudora. Kun brukere med admin-rettigheter kan logge inn. Her kan du se alle brukere og gi/fjerne admin-rettigheter.

## Oppsett

1. **Kopier miljøvariabler**  
   Kopier `.env.example` til `.env` og fyll inn samme Supabase-URL og anon key som i hovedappen Prudora (fra `prudora/.env`):

   ```
   VITE_SUPABASE_URL=https://pfudwcsasmnjetbtrhxa.supabase.co
   VITE_SUPABASE_ANON_KEY=<din anon key>
   ```

2. **Kjør migrasjoner**  
   I Prudora-prosjektet må migrasjonen som legger til `is_admin` (og `email` på profiler) være kjørt mot Supabase. Kjør fra `prudora`:

   ```bash
   npx supabase db push
   ```
   eller kjør SQL-filene i `prudora/supabase/migrations/` manuelt i Supabase Dashboard → SQL Editor.

3. **Sett første admin**  
   Første gang må du gjøre én bruker til admin via Supabase. Gå til **Supabase Dashboard → SQL Editor** og kjør (bytt ut e-posten):

   ```sql
   UPDATE public.profiles
   SET is_admin = true
   WHERE id = (SELECT id FROM auth.users WHERE email = 'din-admin@epost.no');
   ```

4. **Start admin-nettsiden**

   ```bash
   npm install
   npm run dev
   ```

Åpne URL-en som Vite viser (f.eks. http://localhost:5173). Logg inn med admin-kontoen. Vanlige brukere får melding om at de ikke har tilgang.

## Bygg for produksjon

```bash
 npm run build
 ```

Statiske filer ligger i `dist/`. Deploy til valgfri statisk hosting (Netlify, Vercel, etc.).
