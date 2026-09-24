# Sincronizzazione cloud — setup (Supabase)

Abilita il **backup cloud con codice di ripristino**: i dati vengono caricati
sul cloud e si recuperano su un altro telefono inserendo il codice. Nessun
login. Tutto gratis (piano free Supabase). Serve una configurazione una tantum.

## 1. Crea il progetto Supabase
- Vai su https://supabase.com → **New project** (piano Free). Segna il
  **Project ref** (è nell'URL, es. `abcd1234...`).
- Installa la CLI: `npm i -g supabase` e `supabase login`.
- Nella cartella del repo: `supabase link --project-ref <PROJECT_REF>`.

## 2. Crea la tabella
- Supabase → **SQL Editor** → incolla il contenuto di
  [`cloud_vaults.sql`](./cloud_vaults.sql) → **Run**.

## 3. Deploy della funzione
```bash
supabase functions deploy sync --no-verify-jwt
```
`--no-verify-jwt` permette alla PWA di chiamarla senza login. La funzione usa
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (già disponibili in automatico),
quindi **non** serve impostare segreti.

L'URL sarà:
```
https://<PROJECT_REF>.supabase.co/functions/v1/sync
```

## 4. Collega la PWA
Apri `js/config.js` e compila:
```js
export const CLOUD = {
  functionUrl: 'https://<PROJECT_REF>.supabase.co/functions/v1/sync',
};
```
Fai commit + push: GitHub Pages aggiorna l'app.

## 5. Attiva e usa
- Nell'app: **Profilo → App → Sincronizzazione cloud → ☁️ Attiva sync**.
- L'app genera un **codice di ripristino** (es. `ABCD-EFGH-JKLM-NPQR`):
  **salvalo** (note, email a te stesso…). È l'unica chiave.
- Da lì i dati si sincronizzano da soli dopo ogni modifica.
- Su un altro telefono: **Profilo → App → Ho un codice / Ripristina da codice**,
  inserisci il codice e recuperi tutto.

## Note (onestà)
- **Il codice è l'unica chiave**: se lo perdi, non è recuperabile e perdi
  l'accesso alla copia cloud. Chi ha il codice può leggere e scrivere i dati.
- Le **foto/video** non sono incluse (come nel backup file), per tenere i dati
  leggeri.
- Modello **last-write-wins**: se usi due telefoni contemporaneamente sullo
  stesso codice, l'ultimo che sincronizza sovrascrive. Per un uso sequenziale
  (un telefono per volta) è tutto coerente.
- Puoi cambiare i dati anche offline: vengono caricati appena torni online e
  fai una modifica (o tocchi "↻ Ora").
