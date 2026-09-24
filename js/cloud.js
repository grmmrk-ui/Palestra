// Sincronizzazione cloud tramite "codice di ripristino" (nessun login).
// Il backup completo (lo stesso di Esporta/Ripristina) viene caricato su una
// Edge Function Supabase, indicizzato dal codice segreto. Su un altro
// dispositivo, inserendo il codice, si recuperano i dati.
// Best-effort: se non configurato non fa nulla e l'app resta identica.
import { CLOUD } from './config.js';
import * as st from './state.js';

export const cloudConfigured = () => !!(CLOUD && CLOUD.functionUrl);
export const cloudCode = () => (st.S.settings.cloud && st.S.settings.cloud.code) || '';
export const cloudActive = () => cloudConfigured() && !!cloudCode();
export const cloudLastSync = () => (st.S.settings.cloud && st.S.settings.cloud.lastSyncAt) || '';

// Codice leggibile: 4 gruppi da 4 caratteri, senza simboli ambigui.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateCode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < 16; i++) {
    s += ALPHABET[bytes[i] % ALPHABET.length];
    if (i % 4 === 3 && i < 15) s += '-';
  }
  return s; // es. ABCD-EFGH-JKLM-NPQR
}

// Normalizza un codice inserito a mano (maiuscole, con trattini ogni 4).
export function normalizeCode(raw) {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.match(/.{1,4}/g)?.join('-') || '';
}

async function call(action, body) {
  const res = await fetch(CLOUD.functionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) throw new Error(`cloud ${action} ${res.status}`);
  return res.json();
}

// Carica il backup corrente sul cloud sotto il codice attivo.
export async function pushBackup() {
  if (!cloudActive()) return false;
  const data = await st.exportBackup();
  await call('push', { code: cloudCode(), data });
  await st.setCloudMeta({ lastSyncAt: new Date().toISOString() });
  return true;
}

// Recupera il backup dal cloud per un dato codice e lo importa in locale.
export async function pullBackup(code) {
  if (!cloudConfigured()) throw new Error('Sync non configurata');
  const c = normalizeCode(code);
  const out = await call('pull', { code: c });
  if (!out || !out.data) return false; // nessun backup per quel codice
  await st.importBackup(out.data);
  await st.setCloudMeta({ code: c, lastSyncAt: new Date().toISOString() });
  return true;
}

// Attiva la sync: genera un codice, salva e fa il primo upload.
export async function enableCloud() {
  const code = generateCode();
  await st.setCloudMeta({ code });
  await pushBackup();
  return code;
}

export async function disableCloud() {
  await st.setCloudMeta({ code: '', lastSyncAt: '' });
}

// Auto-upload con debounce dopo una modifica dei dati.
let _t = null;
export function scheduleCloudSync() {
  if (!cloudActive()) return;
  clearTimeout(_t);
  _t = setTimeout(() => { pushBackup().catch(() => {}); }, 6000);
}
