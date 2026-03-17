# Produktkravdokument: Prudora
**Norsk app for sammenligning av matvarepriser**

---

## 1. Oversikt
[cite_start]Prudora er en mobilapplikasjon for det norske markedet som gjør det mulig for forbrukere å sammenligne dagligvarepriser på tvers av alle store butikkjeder[cite: 4, 5]. [cite_start]Appen er stedsbevisst, viser nærliggende butikker, og lar brukere bygge handlelister samt følge prisendringer over tid[cite: 6, 7].

| Versjon | [cite_start]1.0 (MVP) [cite: 1] |
| :--- | :--- |
| **Dato** | [cite_start]Mars 2026 [cite: 1] |
| [cite_start]**Plattform** | iOS og Android (React Native / Expo) [cite: 1] |
| **Backend** | [cite_start]Supabase [cite: 1] |

---

## 2. Mål og suksesskriterier

### 2.1 Produktmål
* [cite_start]Hjelpe norske forbrukere med å spare penger ved å gjøre prisdata transparent og sammenlignbart[cite: 10].
* [cite_start]Bygge en fellesskapsdrevet prisdatabase gjennom verifiserte brukerbidrag[cite: 11].
* [cite_start]Gi rettidige varsler om vesentielle prisendringer på produkter brukerne bryr seg om[cite: 11].

### 2.2 Suksesskriterier for MVP (3 måneder)
| Målepunkt | Mål | Måling |
| :--- | :--- | :--- |
| Registrerte brukere | 200 | [cite_start]Supabase auth-telling [cite: 13] |
| Ukentlig aktive brukere | 30% av registrerte | [cite_start]App-analyse [cite: 13] |
| Opprettede handlelister | 100 | [cite_start]Database-telling [cite: 13] |
| Prisbidrag (skanninger) | 2.000 | [cite_start]Skannlogg-telling [cite: 13] |

---

## 3. Teknologistabel
* [cite_start]**Frontend:** React Native (Expo)[cite: 18].
* [cite_start]**Backend / DB:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)[cite: 18].
* [cite_start]**IDE:** Cursor[cite: 18].
* [cite_start]**Varsler:** Expo Push Notifications[cite: 18].
* [cite_start]**Strekkodeskanning:** `expo-camera` / `expo-barcode-scanner`[cite: 18].
* [cite_start]**Lokasjon:** `expo-location`[cite: 19].
* [cite_start]**Versjonering:** Github[cite: 18].
* [cite_start]**Prisskraping:** Separat backend-tjeneste (data konsumeres via Supabase)[cite: 19].

---

## 4. Funksjonsspesifikasjon

### 4.1 Autentisering og Profil
* [cite_start]**Innlogging:** Brukere kan opprette konto og logge inn med e-post og passord via Supabase Auth[cite: 22].
* [cite_start]**Krav:** E-postverifisering, tilbakestilling av passord og vedvarende sesjoner[cite: 24, 26, 27].
* [cite_start]**Profil:** Visning av navn, e-post og verifiseringsstatus (merke for verifisert/ikke-verifisert)[cite: 32, 33].
* [cite_start]**Verifisering:** Krever manuell admin-godkjenning for status som verifisert bidragsyter[cite: 28].

### 4.2 Butikker og Produkter
* [cite_start]**Favorittbutikker:** Brukere kan merke butikker fra kjeder som Rema 1000, Kiwi, Coop, Meny m.fl. som favoritter[cite: 38, 40].
* [cite_start]**Lokasjon:** Viser nærliggende butikker sortert etter avstand ved hjelp av GPS[cite: 41].
* [cite_start]**Søk:** Produktsøk via fritekst med autofullfør eller strekkodesøk (EAN)[cite: 47, 48].
* [cite_start]**Kategorier:** Produkter er delt inn i kategorier som Meieri, Brød, Kjøtt, etc[cite: 47].

### 4.3 Handleliste og Sammenligning
* [cite_start]**Handleliste:** Mulighet for flere navngitte lister (f.eks. "Ukentlig", "Fest") med lagring i Supabase[cite: 55].
* [cite_start]**Sammenligning:** Rangerer butikker fra billigst til dyrest basert på totalpris for valgt liste[cite: 57, 60].
* [cite_start]**Detaljer:** Viser prisoversikt per vare og indikerer hvis varer mangler prisdata i en butikk[cite: 61, 62].

### 4.4 Prisbidrag og Historikk
* [cite_start]**Skanning:** Verifiserte brukere kan skanne strekkoder i butikk og sende inn hyllepris[cite: 65, 68].
* [cite_start]**Historikk:** Linjediagram som viser prisutvikling per butikk over tid (minimum 4 uker)[cite: 73, 75].
* [cite_start]**Endring:** Indikerer uke-over-uke-endring i både NOK og prosent[cite: 74].

### 4.5 Prisvarsler
* [cite_start]**Abonnement:** Brukere kan abonnere på spesifikke produkter[cite: 80].
* [cite_start]**Terskler:** Varsel sendes når prisendring overskrider en valgt prosent eller kronebeløp[cite: 81].
* [cite_start]**Push:** Bruker Expo Push Notifications for varsling[cite: 82].

---

## 5. Skjermkart
| Skjerm | Beskrivelse |
| :--- | :--- |
| **Splash / Onboarding** | [cite_start]App-intro, innlogging og registrering[cite: 94]. |
| **Hjem / Dashboard** | [cite_start]Tilgang til handlelister og nærliggende butikker[cite: 94]. |
| **Produktdetalj** | [cite_start]Priser på tvers av butikker og historikkdiagram[cite: 94]. |
| **Prissammenligning** | [cite_start]Butikkrangering med totaloversikt[cite: 94]. |
| **Skanner** | [cite_start]Kameravisning for strekkoder og prisinntasting[cite: 94]. |

---

## 6. Ikke-funksjonelle krav
* [cite_start]**Ytelse:** Prissammenligning skal returnere resultater innen 2 sekunder for opptil 30 varer[cite: 96].
* [cite_start]**Sikkerhet:** API-kall autentiseres via Supabase RLS[cite: 97].
* [cite_start]**Dataferskhet:** Prisdata bør ikke være eldre enn 7 dager; utdatert data markeres[cite: 98].
* [cite_start]**Personvern:** Lokasjonsdata lagres ikke på server utover sesjonen[cite: 100].

---

## 7. Risikoer og tiltak
| Risiko | Konsekvens | Tiltak |
| :--- | :--- | :--- |
| Begrenset prisdata | Ufullstendige sammenligninger | [cite_start]Manuell utfylling av topp 200 produkter[cite: 111]. |
| Feilaktige brukerpriser | Dårlige data i databasen | [cite_start]Manuell gjennomgangskø og automatisk flagging ved >30% avvik[cite: 111]. |
| Feil butikklokasjon | Dårlige forslag | [cite_start]Bruk av Google Maps/OSM og tillate brukerkorrigering[cite: 111]. |

---

## 8. Utenfor omfang (MVP)
* [cite_start]Automatisert prisskraping-backend (scraperen bygges som separat prosjekt)[cite: 103].
* [cite_start]BankID-verifisering og betalingsløsninger[cite: 104, 105].
* [cite_start]Frakoblet modus og sosiale funksjoner[cite: 106, 107].
* [cite_start]Nettversjon og støtte for engelsk språk[cite: 108, 109].