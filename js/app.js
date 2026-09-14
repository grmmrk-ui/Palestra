import * as st from './state.js';
import { S } from './state.js';
import * as V from './views.js';
import { isoDate, fmtDuration, toast, parseISO } from './util.js';

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

let calYM = { y: new Date().getFullYear(), m: new Date().getMonth() };
let restState = null; // { endsAt }

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

/* ---------- routing ---------- */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [base, arg] = h.split('/');
  return { base: base || 'calendar', arg };
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
  const { base, arg } = route();
  let html = '';
  let activeTab = base;
  switch (base) {
    case 'calendar': html = V.renderCalendar(calYM); break;
    case 'today': html = V.renderToday(); break;
    case 'weight': html = V.renderWeight(); break;
    case 'profile': html = V.renderProfile(); break;
    case 'session': html = V.renderSession(arg); activeTab = 'calendar'; break;
    case 'exercise': html = V.renderExercise(arg); activeTab = ''; break;
    default: location.hash = '#/calendar'; return;
  }
  app.innerHTML = html;
  renderTabs(activeTab);
  window.scrollTo(0, 0);
}

/* ---------- ticker (session elapsed + rest countdown) ---------- */
function tick() {
  const el = app.querySelector('[data-elapsed]');
  if (el) {
    const start = Number(el.getAttribute('data-elapsed'));
    el.textContent = fmtDuration((Date.now() - start) / 1000);
  }
  const rest = app.querySelector('[data-rest]');
  if (rest && restState) {
    const rem = Math.round((restState.endsAt - Date.now()) / 1000);
    if (rem <= 0) {
      rest.textContent = '0:00';
      restState = null;
      if (navigator.vibrate) navigator.vibrate(200);
      toast('Riposo finito 💪');
    } else {
      rest.textContent = fmtDuration(rem);
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
        if (le && le.restSec) restState = { endsAt: Date.now() + le.restSec * 1000 };
      }
      render();
      break;
    }
    case 'rest-start': {
      restState = { endsAt: Date.now() + Number(t.dataset.sec) * 1000 };
      break;
    }
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
    case 'toggle-weighin': {
      await st.patchSettings({ weighIn: { ...S.settings.weighIn, enabled: !S.settings.weighIn.enabled } });
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
    case 'cardio-min': await ensureStarted(id); await st.patchSet(id, { durationSec: (num(v) || 0) * 60 }); break;
    case 'cardio-dist': await st.patchSet(id, { distance: num(v) }); break;
    case 'ex-note': await st.patchLogEx(id, { note: v }); break;
    case 'weighin-day':
      await st.patchSettings({ weighIn: { ...S.settings.weighIn, weekday: Number(v) } });
      render();
      break;
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
    if (!location.hash) location.hash = '#/calendar';
    render();
    setInterval(tick, 1000);
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><div class="em">⚠️</div>Errore di avvio.<br><small>${e.message}</small></div>`;
    console.error(e);
  }
})();
