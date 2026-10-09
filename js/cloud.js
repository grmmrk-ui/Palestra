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
  data.syncedAt = new Date().toISOString();
  await call('push', { code: cloudCode(), data });
  await st.setCloudMeta({ lastSyncAt: data.syncedAt });
  return true;
}

// Sync automatica "vince l'ultimo dispositivo": se sul cloud c'è una versione
// più recente dell'ultima sincronizzata qui, la importa; altrimenti carica.
// Ritorna true se i dati locali sono cambiati (serve un render).
// "Modifiche locali non ancora caricate": persistito per sopravvivere alla chiusura.
const isDirty = () => { try { return localStorage.getItem('palestra.dirty') === '1'; } catch (e) { return true; } };
const setDirty = (v) => { try { v ? localStorage.setItem('palestra.dirty', '1') : localStorage.removeItem('palestra.dirty'); } catch (e) {} };
let _busy = false;
export async function autoSync() {
  if (!cloudActive() || _busy) return false;
  _busy = true;
  try {
    const out = await call('pull', { code: cloudCode() });
    const remote = out && out.data;
    if (remote && remote.syncedAt && remote.syncedAt > cloudLastSync()) {
      const code = cloudCode();
      await st.importBackup(remote);
      await st.setCloudMeta({ code, lastSyncAt: remote.syncedAt });
      return true;
    }
    if (!remote || isDirty()) { await pushBackup(); setDirty(false); }
    return false;
  } catch (e) {
    return false; // offline: riproverà al prossimo evento
  } finally {
    _busy = false;
  }
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

// Callback registrata da app.js: ridisegna dopo che arrivano dati più nuovi.
let onRemoteApplied = () => {};
export const setOnRemoteApplied = (fn) => { onRemoteApplied = fn; };

// Auto-upload con debounce dopo una modifica dei dati.
let _t = null;
export function scheduleCloudSync() {
  if (!cloudActive()) return;
  setDirty(true);
  clearTimeout(_t);
  _t = setTimeout(() => { autoSync().then((changed) => { if (changed) onRemoteApplied(); }); }, 6000);
}
