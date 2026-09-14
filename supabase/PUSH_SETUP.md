# Notifiche a schermo bloccato — setup push (Supabase)

Questo abilita la notifica di fine recupero **anche a telefono bloccato**, tramite
Web Push. Serve una tantum. Tutto gratis (piano free Supabase).

## 1. Genera le chiavi VAPID
Sul tuo computer (serve Node):
```bash
npx web-push generate-vapid-keys
```
Ottieni una **Public Key** e una **Private Key** (stringhe base64url). Tienile da parte.

## 2. Crea il progetto Supabase
- Vai su https://supabase.com → New project (piano Free).
- Installa la CLI: `npm i -g supabase` e fai `supabase login`.
- Nella cartella del repo: `supabase link --project-ref <PROJECT_REF>`
  (il ref è nell'URL del progetto).

## 3. Imposta i segreti della funzione
```bash
supabase secrets set VAPID_PUBLIC_KEY="<public key>"
supabase secrets set VAPID_PRIVATE_KEY="<private key>"
supabase secrets set VAPID_SUBJECT="mailto:grmmrk@gmail.com"
```

## 4. Deploy della funzione
```bash
supabase functions deploy send-push --no-verify-jwt
```
`--no-verify-jwt` permette alla PWA di chiamarla senza login (invia solo notifiche,
nessun dato sensibile). L'URL sarà:
```
https://<PROJECT_REF>.supabase.co/functions/v1/send-push
```

## 5. Collega la PWA
Apri `js/config.js` e compila:
```js
export const PUSH = {
  functionUrl: 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
  vapidPublicKey: '<public key VAPID>',
};
```
Fai commit + push: il deploy su GitHub Pages aggiorna l'app.

## 6. Attiva e prova
- Nell'app: Profilo → Allenamento → attiva **Notifica-telecomando** (accetta il permesso).
- Avvia un esercizio, tocca **✓ Serie fatta**, **blocca lo schermo**.
- A fine recupero deve arrivare la notifica **anche da bloccato**.

## Limiti (onestà)
- **Recuperi ≤ ~150s**: la funzione attende il tempo del recupero prima di inviare;
  oltre ~150s il free tier potrebbe interrompersi. Per recuperi lunghi l'avviso
  potrebbe non arrivare a schermo bloccato.
- Se **salti** il recupero, la notifica programmata potrebbe comunque arrivare
  (arrivo "in ritardo"): la puoi ignorare.
- **iPhone**: i pulsanti nelle notifiche non esistono (limite iOS); il push può
  arrivare ma senza pulsanti d'azione.

Quando vorrai, sullo stesso Supabase possiamo aggiungere **login + sync tra
dispositivi** (i dati che seguono la persona).
