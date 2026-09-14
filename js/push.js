// Client Web Push: sottoscrizione + richiesta di notifica temporizzata al server.
// Best-effort: se non configurato o non supportato, non fa nulla (l'app continua
// a funzionare con HUD/bip a schermo acceso).
import { PUSH } from './config.js';

export const pushConfigured = () => !!(PUSH && PUSH.functionUrl && PUSH.vapidPublicKey);

function urlB64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

let _sub = null;
export async function ensurePushSubscription() {
  if (!pushConfigured()) return null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (Notification.permission !== 'granted') return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    _sub = await reg.pushManager.getSubscription();
    if (!_sub) {
      _sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(PUSH.vapidPublicKey),
      });
    }
    return _sub;
  } catch (e) { return null; }
}

// Chiede al server di inviare una notifica push fra `delaySec` secondi.
export async function schedulePush(delaySec, payload) {
  if (!pushConfigured()) return;
  try {
    const sub = _sub || (await ensurePushSubscription());
    if (!sub) return;
    await fetch(PUSH.functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        delaySec: Math.min(Math.max(1, Math.round(delaySec)), 150),
        payload,
      }),
    });
  } catch (e) { /* best-effort */ }
}
