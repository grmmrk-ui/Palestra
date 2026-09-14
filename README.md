# Palestra 🏋️

App PWA (mobile-first, offline) per monitorare gli allenamenti in palestra:
calendario, sessioni, esercizi con serie/ripetizioni/riposo, cardio, note e peso corporeo.

**Zero costi**: nessun build step, nessuna dipendenza a runtime. HTML/CSS/JS puro
+ IndexedDB per i dati locali. Si ospita gratis (GitHub Pages) e si installa sul telefono.

## Provare in locale

```bash
python3 -m http.server 8099
# apri http://localhost:8099
```

Su iPhone/Android: apri l'URL nel browser → *Aggiungi a Home* per installarla come app.

## Struttura

```
index.html            shell + registrazione service worker
app.css               stile (temi chiaro/scuro)
sw.js                 service worker (funziona offline)
manifest.webmanifest  metadati PWA
icons/                icone app
js/
  db.js       wrapper IndexedDB (schema store)
  seed.js     scheda iniziale Push/Pull/Gambe
  state.js    stato in memoria + operazioni (sessioni, serie, peso, streak)
  views.js    render delle schermate
  app.js      router + eventi + timer
supabase/schema.sql   schema Postgres per la sincronizzazione cloud (step successivo)
```

## Modello dati

Due livelli separati:

- **Pianificato** (scheda): `programs → days → planned_exercises`
- **Registrato** (diario): `sessions → logged_exercises → logged_sets`, più `bodyweight`

Tenerli distinti conserva lo storico anche cambiando scheda, ed è la base per i progressi.

## Prossimi passi

1. **Sync cloud** con Supabase (account gratuito): auth + Postgres, i dati si allineano
   tra telefoni. Schema in `supabase/schema.sql`.
2. Modifica scheda dall'app (aggiungere/riordinare esercizi).
3. Grafici progressi per esercizio (volume, carico massimo).
4. Notifiche push per il promemoria peso.
