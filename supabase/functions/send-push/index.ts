// Supabase Edge Function: invia una Web Push dopo `delaySec` secondi.
// Riceve { subscription, delaySec, payload } dalla PWA e, all'ora giusta,
// invia la notifica al dispositivo — che arriva anche a schermo bloccato.
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt
// Segreti: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (vedi PUSH_SETUP.md)
//
// Nota sul free tier: la funzione "aspetta" il tempo del recupero prima di
// inviare, quindi i recuperi sono limitati a ~150s (limite di durata).
import webpush from 'npm:web-push@3.6.7';

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:you@example.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

  try {
    const { subscription, delaySec, payload } = await req.json();
    if (!subscription || !subscription.endpoint) {
      return new Response(JSON.stringify({ error: 'subscription mancante' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const wait = Math.min(Math.max(1, Number(delaySec) || 1), 150);
    await new Promise((r) => setTimeout(r, wait * 1000));
    await webpush.sendNotification(subscription, JSON.stringify(payload ?? {}));
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
