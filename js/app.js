import * as st from './state.js';
import { S } from './state.js';
import * as V from './views.js';
import { isoDate, fmtDuration, toast, parseISO, ACCENTS } from './util.js';

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const hud = document.getElementById('hud');

let calYM = { y: new Date().getFullYear(), m: new Date().getMonth() };
let restState = null; // { endsAt }
let wakeLock = null;
let audioCtx = null;

/* ---------- theme ---------- */
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}
async function cycleTheme() {
  const cur = S.settings.theme || 'system';
  const next = cur === 'system' ? 'light' : cur === 'light' ? 'dark' : 'system';
  await st.patchSettings({ theme: next });
  applyTheme(next);
  render();
}

function applyAccent(key) {
  const a = ACCENTS[key] || ACCENTS.coral;
  const root = document.documentElement;
  root.style.setProperty('--effort', a.main);
  root.style.setProperty('--grad', a.grad);
}

/* ---------- keep screen on (Wake Lock) ---------- */
async function acquireWake() {
  try {
    if ((S.settings.workout || {}).keepScreenOn === false) return;
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { /* non supportato o negato */ }
}
async function releaseWake() {
  try { if (wakeLock) { await wakeLock.release(); wakeLock = null; } } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentExercise()) acquireWake();
});

/* ---------- audio: solo bip (Web Audio, si sovrappone alla musica) ---------- */
// Nessun elemento media, nessuna Media Session: non tocca Spotify o altri player.
function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}
function beep() {
  try {
    if ((S.settings.workout || {}).sound === false) return;
    ensureAudio();
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.18;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.18);
    const o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain();
    o2.type = 'sine'; o2.frequency.value = 1200; g2.gain.value = 0.18;
    o2.connect(g2); g2.connect(audioCtx.destination);
    o2.start(audioCtx.currentTime + 0.2); o2.stop(audioCtx.currentTime + 0.4);
  } catch (e) {}
}
/* ---------- notifica recupero (Notification Triggers, senza server) ---------- */
const triggerSupported = typeof window !== 'undefined' && 'Notification' in window
  && window.Notification.prototype && 'showTrigger' in window.Notification.prototype
  && 'TimestampTrigger' in window;

function notifyEnabled() {
  return (S.settings.workout || {}).notify === true
    && 'Notification' in window && Notification.permission === 'granted';
}
async function swReg() {
  try { return await navigator.serviceWorker?.ready; } catch (e) { return null; }
}
async function clearRestNotification() {
  const reg = await swReg();
  if (!reg) return;
  try {
    const ns = await reg.getNotifications({ tag: 'palestra-rest', includeTriggered: true });
    ns.forEach((n) => n.close());
  } catch (e) {}
}
async function scheduleRestNotification(endsAt, label) {
  if (!notifyEnabled() || !triggerSupported) return;
  const reg = await swReg();
  if (!reg) return;
  try {
    await clearRestNotification();
    await reg.showNotification('Recupero finito 💪', {
      tag: 'palestra-rest', body: label, requireInteraction: true,
      vibrate: [200, 100, 200], icon: './icons/icon-192.png', badge: './icons/icon-192.png',
      showTrigger: new TimestampTrigger(endsAt), data: { type: 'rest' },
    });
  } catch (e) {}
}
function startRest(sec, label) {
  restState = { endsAt: Date.now() + sec * 1000 };
  scheduleRestNotification(restState.endsAt, label);
}

/* ---------- routing ---------- */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/');
  return { base: parts[0] || 'calendar', args: parts.slice(1) };
}

const TABS = [
  { id: 'calendar', ic: '▦', label: 'Calendario' },
  { id: 'today', ic: '●', label: 'Oggi' },
  { id: 'weight', ic: '⚖', label: 'Peso' },
  { id: 'profile', ic: '☰', label: 'Profilo' },
];

function renderTabs(active) {
  tabbar.hidden = false;
  tabbar.innerHTML = TABS.map((t) =>
    `<a href="#/${t.id}" class="${t.id === active ? 'on' : ''}"><span class="ic">${t.ic}</span>${t.label}</a>`
  ).join('');
}

function render() {
  const { base, args } = route();
  let html = '';
  let activeTab = base;
  switch (base) {
    case 'calendar': html = V.renderCalendar(calYM); break;
    case 'today': html = V.renderToday(); break;
    case 'weight': html = V.renderWeight(); break;
    case 'profile': html = V.renderProfile(); break;
    case 'session': html = V.renderSession(args[0]); activeTab = 'calendar'; break;
    case 'exercise': html = V.renderExercise(args[0]); activeTab = ''; break;
    case 'edit': html = V.renderEditProgram(); activeTab = 'profile'; break;
    case 'edit-day': html = V.renderEditDay(args[0]); activeTab = 'profile'; break;
    case 'edit-ex': html = V.renderEditExercise(args[0], args[1]); activeTab = 'profile'; break;
    default: location.hash = '#/calendar'; return;
  }
  app.innerHTML = html;
  renderTabs(activeTab);
  window.scrollTo(0, 0);
  manageWorkoutChrome();
}

/* ---------- workout guided mode (HUD + lockscreen) ---------- */
function currentExercise() {
  const { base, args } = route();
  if (base !== 'exercise') return null;
  return st.logExById(args[0]);
}
function nextExerciseOf(e) {
  const list = st.logExOfSession(e.sessionId);
  const i = list.findIndex((x) => x.id === e.id);
  return i >= 0 ? list[i + 1] : null;
}

function manageWorkoutChrome() {
  const e = currentExercise();
  if (!e || e.kind === 'cardio') {
    hud.hidden = true;
    app.classList.remove('has-hud');
    tabbar.hidden = false;
    releaseWake();
    return;
  }
  // guided mode active
  tabbar.hidden = true;
  hud.hidden = false;
  app.classList.add('has-hud');
  acquireWake();
  renderHud(e);
}

function renderHud(e) {
  const sets = st.setsOfLogEx(e.id);
  const cur = sets.find((s) => !s.done);
  if (restState) {
    hud.innerHTML = `
      <div class="phase">
        <div><div class="lab">Recupero</div><div class="sub">poi serie ${cur ? cur.index : '—'} di ${sets.length}</div></div>
        <div class="big tnum" data-rest>${fmtDuration(Math.max(0, Math.round((restState.endsAt - Date.now()) / 1000)))}</div>
      </div>
      <button class="hud-btn resting" data-action="advance">Salta recupero →</button>`;
  } else if (cur) {
    hud.innerHTML = `
      <div class="phase">
        <div><div class="lab">In corso</div><div class="sub">${esc(e.name)}</div></div>
        <div class="big tnum">${cur.index}<span style="font-size:22px;color:var(--muted)">/${sets.length}</span></div>
      </div>
      <button class="hud-btn" data-action="advance">✓ Serie ${cur.index} fatta</button>`;
  } else {
    const next = nextExerciseOf(e);
    hud.innerHTML = `
      <div class="phase">
        <div><div class="lab">Esercizio completato ✓</div><div class="sub">${esc(e.name)}</div></div>
      </div>
      <button class="hud-btn finish" data-action="advance">${next ? 'Prossimo esercizio →' : 'Torna alla sessione →'}</button>`;
  }
}

async function advanceWorkout() {
  const e = currentExercise();
  if (!e) return;
  ensureAudio();
  if (restState) { restState = null; clearRestNotification(); render(); return; }
  const sets = st.setsOfLogEx(e.id);
  const cur = sets.find((s) => !s.done);
  if (cur) {
    await ensureStarted(cur.id);
    await st.patchSet(cur.id, { done: true });
    const remaining = st.setsOfLogEx(e.id).filter((s) => !s.done);
    if (remaining.length) {
      const sec = cur.restSec ?? e.restSec;
      if (sec) startRest(sec, `${e.name} · serie ${remaining[0].index} di ${sets.length}`);
    }
    render();
    return;
  }
  const next = nextExerciseOf(e);
  const sess = S.sessions.find((x) => x.id === e.sessionId);
  location.hash = next ? `#/exercise/${next.id}` : `#/session/${sess.date}`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- ticker (session elapsed + rest countdown) ---------- */
function tick() {
  const el = app.querySelector('[data-elapsed]');
  if (el) {
    const start = Number(el.getAttribute('data-elapsed'));
    el.textContent = fmtDuration((Date.now() - start) / 1000);
  }
  if (restState) {
    const rem = Math.round((restState.endsAt - Date.now()) / 1000);
    if (rem <= 0) {
      restState = null;
      clearRestNotification(); // l'app è in primo piano: evita il popup doppio
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      beep();
      toast('Recupero finito 💪');
      const e = currentExercise();
      if (e) renderHud(e); else { const r = document.querySelector('[data-rest]'); if (r) r.textContent = '0:00'; }
    } else {
      const r = document.querySelector('[data-rest]');
      if (r) r.textContent = fmtDuration(rem);
    }
  }
}

/* ---------- helpers ---------- */
const num = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
};

async function ensureStarted(setId) {
  const set = S.logSets.find((x) => x.id === setId);
  if (!set) return;
  const le = st.logExById(set.logExerciseId);
  const s = S.sessions.find((x) => x.id === le.sessionId);
  if (s && !s.startedAt) await st.patchSession(s.id, { startedAt: Date.now(), status: 'active' });
}

/* ---------- event delegation ---------- */
document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  const id = t.dataset.id;

  switch (a) {
    case 'theme': await cycleTheme(); break;
    case 'go': location.hash = t.dataset.href; break;
    case 'cal-prev': calYM = shiftMonth(calYM, -1); render(); break;
    case 'cal-next': calYM = shiftMonth(calYM, +1); render(); break;

    case 'start-session': {
      await st.startSession(t.dataset.date);
      render();
      break;
    }
    case 'end-session': {
      await st.endSession(id);
      toast('Allenamento completato ✓');
      render();
      break;
    }
    case 'reopen': {
      const s = st.sessionByDate(t.dataset.date);
      if (s) await st.patchSession(s.id, { status: 'active', endedAt: null });
      render();
      break;
    }
    case 'toggle-set': {
      const set = S.logSets.find((x) => x.id === id);
      if (!set) break;
      const nowDone = !set.done;
      await ensureStarted(id);
      await st.patchSet(id, { done: nowDone });
      if (nowDone && set.kind !== 'cardio') {
        const le = st.logExById(set.logExerciseId);
        const sec = set.restSec ?? (le && le.restSec);
        if (sec) startRest(sec, `${le ? le.name : 'Esercizio'} · recupero`);
      }
      render();
      break;
    }
    case 'rest-start': {
      restState = { endsAt: Date.now() + Number(t.dataset.sec) * 1000 };
      break;
    }
    case 'advance': await advanceWorkout(); break;
    case 'add-weight': {
      const kg = num(document.getElementById('wkg').value);
      const date = document.getElementById('wdate').value || isoDate();
      if (kg == null) { toast('Inserisci un peso'); break; }
      await st.addBodyweight(date, kg);
      toast('Pesata salvata ⚖️');
      render();
      break;
    }
    case 'del-weight': await st.deleteBodyweight(id); render(); break;
    case 'toggle-sound': {
      const cur = (S.settings.workout || {}).sound !== false;
      await st.patchSettings({ workout: { ...(S.settings.workout || {}), sound: !cur } });
      render();
      break;
    }
    case 'toggle-screen': {
      const cur = (S.settings.workout || {}).keepScreenOn !== false;
      const nv = !cur;
      await st.patchSettings({ workout: { ...(S.settings.workout || {}), keepScreenOn: nv } });
      if (!nv) releaseWake(); else if (currentExercise()) acquireWake();
      render();
      break;
    }
    case 'toggle-notify': {
      const cur = (S.settings.workout || {}).notify === true;
      if (!cur) {
        if (!('Notification' in window)) { toast('Notifiche non supportate sul dispositivo'); break; }
        let perm = Notification.permission;
        if (perm === 'default') perm = await Notification.requestPermission();
        if (perm !== 'granted') { toast('Permesso notifiche negato'); break; }
        await st.patchSettings({ workout: { ...(S.settings.workout || {}), notify: true } });
        toast(triggerSupported ? 'Notifiche recupero attive' : 'Attive, ma questo browser non le programma da bloccato');
      } else {
        await st.patchSettings({ workout: { ...(S.settings.workout || {}), notify: false } });
        clearRestNotification();
      }
      render();
      break;
    }

    /* ---- editor scheda ---- */
    case 'add-day': {
      const d = await st.addDay('Nuovo giorno', '');
      location.hash = `#/edit-day/${d.id}`;
      break;
    }
    case 'del-day': {
      if (confirm('Eliminare questo giorno e i suoi esercizi?')) { await st.deleteDay(id); render(); }
      break;
    }
    case 'add-ex': location.hash = `#/edit-ex/${id}/new`; break;
    case 'ex-up': await st.movePlanned(id, -1); render(); break;
    case 'ex-down': await st.movePlanned(id, +1); render(); break;
    case 'del-ex': if (confirm('Eliminare l\'esercizio?')) { await st.deletePlanned(id); render(); } break;
    case 'del-ex-back': {
      if (confirm('Eliminare l\'esercizio?')) { await st.deletePlanned(id); location.hash = `#/edit-day/${t.dataset.day}`; }
      break;
    }
    case 'save-ex': {
      const val = (i) => (document.getElementById(i)?.value ?? '').trim();
      const int = (i, d) => { const n = parseInt(val(i), 10); return isNaN(n) ? d : n; };
      const kind = document.querySelector('input[name="ex-kind"]:checked')?.value || 'strength';
      const data = { name: val('ex-name'), muscle: val('ex-muscle'), kind, restSec: int('ex-rest', 90) };
      if (!data.name) { toast('Dai un nome all\'esercizio'); break; }
      if (kind === 'cardio') {
        data.targetDurationSec = int('ex-dur', 10) * 60; data.targetSets = 1; data.targetReps = 0; data.targetWeight = 0;
      } else {
        data.targetSets = int('ex-sets', 3); data.targetReps = int('ex-reps', 10);
        data.targetWeight = num(val('ex-weight')) ?? 0; data.targetDurationSec = 0;
      }
      const day = t.dataset.day;
      if (t.dataset.id === 'new') await st.addPlanned(day, data);
      else await st.updatePlanned(t.dataset.id, data);
      toast('Salvato ✓');
      location.hash = `#/edit-day/${day}`;
      break;
    }
    case 'toggle-weighin': {
      await st.patchSettings({ weighIn: { ...S.settings.weighIn, enabled: !S.settings.weighIn.enabled } });
      render();
      break;
    }
    case 'set-theme': {
      await st.patchSettings({ theme: t.dataset.theme });
      applyTheme(t.dataset.theme);
      render();
      break;
    }
    case 'set-accent': {
      await st.patchSettings({ accent: t.dataset.key });
      applyAccent(t.dataset.key);
      render();
      break;
    }
  }
});

document.addEventListener('change', async (ev) => {
  const t = ev.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action, id = t.dataset.id, v = ev.target.value;

  switch (a) {
    case 'set-weight': await ensureStarted(id); await st.patchSet(id, { weight: num(v) }); break;
    case 'set-reps': await ensureStarted(id); await st.patchSet(id, { reps: num(v) }); break;
    case 'set-rest': { const n = parseInt(v, 10); await st.patchSet(id, { restSec: isNaN(n) ? null : n }); break; }
    case 'cardio-min': await ensureStarted(id); await st.patchSet(id, { durationSec: (num(v) || 0) * 60 }); break;
    case 'cardio-dist': await st.patchSet(id, { distance: num(v) }); break;
    case 'ex-note': await st.patchLogEx(id, { note: v }); break;
    case 'weighin-day':
      await st.patchSettings({ weighIn: { ...S.settings.weighIn, weekday: Number(v) } });
      render();
      break;

    /* ---- editor scheda ---- */
    case 'rename-program': await st.renameProgram(v.trim() || 'Programma'); break;
    case 'rename-day': await st.updateDay(id, { name: v.trim() || 'Giorno' }); render(); break;
    case 'day-muscles': await st.updateDay(id, { muscles: v.trim() }); break;
    case 'assign-weekday': await st.setWeekday(Number(t.dataset.wd), v || null); render(); break;

    /* ---- profilo personale ---- */
    case 'prof-name': await st.patchSettings({ profile: { ...(S.settings.profile || {}), name: v.trim() } }); break;
    case 'prof-goal': await st.patchSettings({ profile: { ...(S.settings.profile || {}), goal: v } }); break;
    case 'prof-height': {
      const cm = parseInt(v, 10);
      await st.patchSettings({ profile: { ...(S.settings.profile || {}), heightCm: isNaN(cm) ? null : cm } });
      break;
    }
  }
});

function shiftMonth({ y, m }, delta) {
  m += delta;
  if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
  return { y, m };
}

/* ---------- boot ---------- */
window.addEventListener('hashchange', render);

(async function () {
  try {
    await st.boot();
    applyTheme(S.settings.theme || 'system');
    applyAccent(S.settings.accent || 'coral');
    if (!location.hash) location.hash = '#/calendar';
    render();
    setInterval(tick, 1000);
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><div class="em">⚠️</div>Errore di avvio.<br><small>${e.message}</small></div>`;
    console.error(e);
  }
})();
