# Palestra — note per lo sviluppo

App PWA per il tracking degli allenamenti in palestra. **Mobile-first, offline, zero costi.**

## Principi

- **Nessun build step, nessuna dipendenza a runtime.** HTML/CSS/JS puro con moduli ES nativi.
  Non introdurre bundler/framework/npm senza motivo forte: la semplicità è una feature.
- **Local-first.** I dati stanno in IndexedDB (`js/db.js`). La sincronizzazione cloud
  (Supabase) è un layer futuro; schema pronto in `supabase/schema.sql`.
- **Priorità del prodotto: l'allenamento.** Il resto (peso, cloud) viene dopo.

## Architettura

| File | Ruolo |
|------|-------|
| `index.html` | shell + registrazione service worker |
| `app.css` | stile completo, temi chiaro/scuro via CSS custom properties |
| `sw.js` | service worker, cache app-shell (bump `CACHE` a ogni release) |
| `js/db.js` | wrapper IndexedDB (store + indici) |
| `js/seed.js` | scheda iniziale Push/Pull/Gambe (solo il piano, niente storico finto) |
| `js/state.js` | stato in memoria `S` + tutte le operazioni (getter/ops) |
| `js/views.js` | render delle schermate → stringhe HTML |
| `js/app.js` | router (hash), event delegation, timer |

### Modello dati (due livelli separati)

- **Pianificato:** `programs → days → planned` (con `weekdayPlan` sul programma)
- **Registrato:** `sessions → logExercises → logSets`, più `bodyweight`, `settings`

Le sessioni sono **copie indipendenti** del piano al momento della creazione:
modificare la scheda NON riscrive lo storico. Mantenere questa proprietà.

## Convenzioni

- Interazioni via `data-action` + delegation in `js/app.js` (no listener sparsi).
- Ogni doc ha `id` string (`uid()`); le ops mutano `S` e persistono, poi `render()`.
- UI in italiano. Palette: coral `#FF5A3C` (sforzo), teal `#12A594` (recupero).
- Dopo modifiche allo schema store: gestire la migrazione in `db.js` (`DB_VERSION`).

## Verifica locale

```bash
python3 -m http.server 8099   # http://localhost:8099
```

Test end-to-end con Playwright (chromium in `/opt/pw-browsers`) come già fatto:
lanciare l'app, cliccare i flussi, raccogliere errori console.

## Deploy

GitHub Pages via Actions (`.github/workflows/pages.yml`), a ogni push su branch di lavoro.
Repo pubblico richiesto per Pages gratis.
