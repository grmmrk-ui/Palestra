// Configurazione push a schermo bloccato (opzionale).
// Finché questi campi sono vuoti, la funzione push resta disattivata e l'app
// funziona come prima. Compilali dopo aver creato il progetto Supabase e la
// funzione (vedi supabase/PUSH_SETUP.md).
export const PUSH = {
  // URL della Edge Function, es: https://<project>.supabase.co/functions/v1/send-push
  functionUrl: '',
  // Chiave pubblica VAPID (base64url) generata con: npx web-push generate-vapid-keys
  vapidPublicKey: '',
};

// Sincronizzazione cloud tramite "codice di ripristino" (nessun login).
// Finché functionUrl è vuoto, la sync resta disattivata e l'app funziona come
// prima. Compila dopo aver creato la funzione (vedi supabase/CLOUD_SETUP.md).
export const CLOUD = {
  // URL della Edge Function, es: https://<project>.supabase.co/functions/v1/sync
  functionUrl: '',
};
