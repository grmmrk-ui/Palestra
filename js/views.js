// Screen renderers. Each returns an HTML string. Interactivity via data-action.
import * as st from './state.js';
import { S } from './state.js';
import { esc, isoDate, parseISO, fmtDay, fmtDuration, fmtNum, WD, MONTHS, weekdayMon, ACCENTS, GOALS, APP_VERSION, FEEDBACK_EMAIL } from './util.js';

/* ---------------- Calendar ---------------- */
export function renderCalendar(ym) {
  const today = isoDate();
  const now = new Date();
  const y = ym.y, m = ym.m;
  const first = new Date(y, m, 1);
  const startOffset = weekdayMon(first);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const { workouts, avgSec } = st.monthStats(y, m);
  const streak = st.streak();

  let cells = '';
  for (let i = 0; i < startOffset; i++) cells += `<div class="day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayId = st.dayIdForDate(iso);
    const sess = st.sessionByDate(iso);
    const done = sess && sess.status === 'done';
    let cls = 'day';
    if (dayId) cls += ' train'; else cls += ' rest';
    if (done) cls += ' done';
    if (iso === today) cls += ' today';
    const dot = (dayId || sess) ? '<i></i>' : '';
    cells += `<a class="${cls}" href="#/session/${iso}"><span>${d}</span>${dot}</a>`;
  }

  const todayDayId = st.dayIdForDate(today);
  const todayChip = todayDayId
    ? `<span class="chip effort">Oggi · ${esc(st.dayById(todayDayId).name)}</span>`
    : `<span class="chip rest">Oggi · Riposo</span>`;

  return `
  <div class="screen-head">
    <div><div class="kick">${esc(st.activeProgram().name)}</div><h1>Calendario</h1></div>
    <button class="iconbtn" data-action="theme" aria-label="Cambia tema">◐</button>
  </div>

  <div class="streak">
    <div><div class="big tnum">${streak}</div><small>giorni di fila</small></div>
    <div class="sep"></div>
    <div><div class="big tnum">${workouts}</div><small>allenamenti / mese</small></div>
    <div class="flame">${streak >= 3 ? '🔥' : '💪'}</div>
  </div>

  <div class="card pad">
    <div class="cal-nav">
      <button data-action="cal-prev" aria-label="Mese precedente">‹</button>
      <div class="m">${MONTHS[m]} ${y}</div>
      <button data-action="cal-next" aria-label="Mese successivo">›</button>
    </div>
    <div class="weekdays">${WD.map((w) => `<span>${w[0]}</span>`).join('')}</div>
    <div class="grid">${cells}</div>
    <div class="legend">
      <b style="--sw:var(--effort)">Allenamento</b>
      <b style="--sw:var(--rest-soft)">Riposo</b>
      <b style="--sw:var(--rest)">Completato</b>
    </div>
  </div>

  <div class="row spread" style="margin-top:16px">${todayChip}
    <a class="chip ghost" href="#/today" style="text-decoration:none">Vai a oggi ›</a></div>

  ${avgSec ? `<div class="tiles" style="margin-top:16px">
    <div class="tile"><div class="k">Durata media</div><div class="v tnum">${fmtDuration(avgSec)}</div></div>
    <div class="tile"><div class="k">Questo mese</div><div class="v tnum">${workouts}<small> sess.</small></div></div>
  </div>` : ''}
  `;
}

/* ---------------- Today ---------------- */
export function renderToday() {
  const iso = isoDate();
  const dayId = st.dayIdForDate(iso);
  const due = st.weighInDue();
  const weighInBanner = due ? weighInPrompt() : '';

  if (!dayId) {
    return `
    <div class="screen-head"><div><div class="kick">${fmtDay(iso)}</div><h1>Oggi</h1></div>
      <button class="iconbtn" data-action="theme">◐</button></div>
    <div class="banner rest">
      <div class="lab">${fmtDay(iso)}</div>
      <div class="nm">Riposo</div>
      <div class="meta"><span>Recupero programmato · nessun allenamento</span></div>
    </div>
    ${weighInBanner}
    <p class="muted" style="text-align:center;margin-top:24px">Goditi il recupero 🌙<br>Il muscolo cresce mentre riposi.</p>
    <a class="btn ghost" href="#/calendar" style="margin-top:16px;display:block;text-align:center;text-decoration:none">Vedi calendario</a>`;
  }
  return sessionScreen(iso, { tab: true, weighInBanner });
}

/* ---------------- Session (shared by Today + calendar tap) ---------------- */
export function renderSession(iso) {
  const dayId = st.dayIdForDate(iso);
  const back = `<button class="backbtn" data-action="go" data-href="#/calendar">‹ Calendario</button>`;
  if (!dayId && !st.sessionByDate(iso)) {
    return `${back}
    <div class="banner rest"><div class="lab">${fmtDay(iso)}</div><div class="nm">Riposo</div>
      <div class="meta"><span>Giorno di recupero</span></div></div>`;
  }
  return back + sessionScreen(iso, { tab: false });
}

function sessionScreen(iso, { tab, weighInBanner = '' }) {
  const s = st.sessionByDate(iso);
  const dayId = st.dayIdForDate(iso);
  const day = st.dayById(dayId);
  const started = s && s.startedAt && s.status !== 'done';
  const done = s && s.status === 'done';
  const prog = s ? st.sessionProgress(s.id) : { total: 0, done: 0, exCount: 0 };

  const head = tab
    ? `<div class="screen-head"><div><div class="kick">${fmtDay(iso)}</div><h1>Oggi</h1></div>
        <button class="iconbtn" data-action="theme">◐</button></div>`
    : '';

  const meta = `${esc(day.muscles)} · ${st.plannedForDay(dayId).length} esercizi`;
  const banner = `
    <div class="banner">
      <div class="lab">${fmtDay(iso)}${done ? ' · Completato ✓' : ''}</div>
      <div class="nm">${esc(day.name)}</div>
      <div class="meta"><span>${esc(meta)}</span>${
        s && (done || started) ? `<span>· ${prog.done}/${prog.total} serie</span>` : ''
      }</div>
    </div>`;

  // timer / action
  let control = '';
  if (done) {
    control = `<div class="timer"><div><div class="rest-lab">Durata</div></div>
      <div class="clock tnum">${fmtDuration(s.durationSec)}</div></div>`;
  } else if (started) {
    control = `<div class="timer"><div><div class="rest-lab">In corso</div><div class="faint" style="font-size:11px;color:#AEB8C4">tocca gli esercizi per registrare</div></div>
      <div class="clock tnum" data-elapsed="${s.startedAt}">0:00</div></div>`;
  }

  // exercise list
  let list = '';
  if (s) {
    const exs = st.logExOfSession(s.id);
    list = exs.map((e) => {
      const sets = st.setsOfLogEx(e.id);
      const allDone = sets.length && sets.every((x) => x.done);
      const someDone = sets.some((x) => x.done);
      const label = e.kind === 'cardio'
        ? `${Math.round((e.targetDurationSec || 0) / 60)} min`
        : `${e.targetSets}×${e.targetReps}`;
      const tick = e.kind === 'cardio'
        ? `<div class="tick ${allDone ? 'done' : 'cardio'}">${allDone ? '✓' : '⏱'}</div>`
        : `<div class="tick ${allDone ? 'done' : someDone ? 'now' : ''}">${allDone ? '✓' : someDone ? '▶' : ''}</div>`;
      return `<a class="exrow ${someDone && !allDone ? 'active' : ''}" href="#/exercise/${e.id}">
        ${tick}
        <div class="info"><div class="n">${esc(e.name)}</div><div class="g">${esc(e.muscle)}${e.note ? ' · 📝' : ''}</div></div>
        <div class="sets tnum">${label}</div><div class="chev">›</div></a>`;
    }).join('');
  } else {
    list = st.plannedForDay(dayId).map((p) => {
      const label = p.kind === 'cardio' ? `${Math.round((p.targetDurationSec || 0) / 60)} min` : `${p.targetSets}×${p.targetReps}`;
      return `<div class="exrow"><div class="tick"></div>
        <div class="info"><div class="n">${esc(p.name)}</div><div class="g">${esc(p.muscle)}</div></div>
        <div class="sets tnum">${label}</div></div>`;
    }).join('');
  }

  // primary button
  let btn = '';
  if (done) {
    btn = `<button class="btn ghost" data-action="reopen" data-date="${iso}" style="margin-top:16px">Riapri sessione</button>`;
  } else if (started) {
    btn = `<button class="btn rest" data-action="end-session" data-id="${s.id}" style="margin-top:16px">Termina allenamento</button>`;
  } else {
    btn = `<button class="btn" data-action="start-session" data-date="${iso}" style="margin-top:16px">${s ? 'Continua' : 'Inizia'} allenamento</button>`;
  }

  // riavvia (solo se la sessione esiste, cioè ci sono dati registrati)
  const restartBtn = s
    ? `<button class="btn ghost" data-action="restart-session" data-date="${iso}" style="margin-top:10px;color:var(--effort)">↻ Riavvia allenamento</button>`
    : '';

  return `${head}${weighInBanner}${banner}${control}
    <div class="card pad" style="padding-top:4px;padding-bottom:4px">${list}</div>
    ${btn}${restartBtn}`;
}

/* ---------------- Exercise detail ---------------- */
export function renderExercise(id) {
  const e = st.logExById(id);
  if (!e) return `<div class="empty-state">Esercizio non trovato.</div>`;
  const s = S.sessions.find((x) => x.id === e.sessionId);
  const sets = st.setsOfLogEx(e.id);
  const back = `<button class="backbtn" data-action="go" data-href="#/session/${s.date}">‹ ${esc(s.dayName || 'Sessione')}</button>`;
  const doneCount = sets.filter((x) => x.done).length;

  if (e.kind === 'cardio') {
    const c = sets[0];
    return `${back}
    <div class="screen-head"><div><div class="kick">Cardio</div><h1 style="font-size:28px">${esc(e.name)}</h1></div></div>
    <div class="card pad">
      <div class="inline">
        <div class="field"><label>Durata (min)</label>
          <input type="number" inputmode="decimal" value="${c.durationSec ? Math.round(c.durationSec / 60) : ''}"
            data-action="cardio-min" data-id="${c.id}" placeholder="10"></div>
        <div class="field"><label>Distanza (km)</label>
          <input type="number" inputmode="decimal" value="${c.distance ?? ''}"
            data-action="cardio-dist" data-id="${c.id}" placeholder="—"></div>
      </div>
      ${noteField(e)}
    </div>
    <button class="btn ${c.done ? 'rest' : ''}" data-action="toggle-set" data-id="${c.id}" style="margin-top:16px">
      ${c.done ? 'Registrato ✓ — annulla' : 'Registra cardio'}</button>`;
  }

  const rows = sets.map((x) => `
    <div class="setrow ${x.done ? 'done' : (doneCount === x.index - 1 && !x.done ? 'now' : '')}">
      <div class="idx">${x.index}</div>
      <input type="number" inputmode="decimal" value="${x.weight ?? ''}" data-action="set-weight" data-id="${x.id}" aria-label="Peso serie ${x.index}">
      <input type="number" inputmode="numeric" value="${x.reps ?? ''}" data-action="set-reps" data-id="${x.id}" aria-label="Ripetizioni serie ${x.index}">
      <input type="number" inputmode="numeric" value="${x.restSec ?? ''}" data-action="set-rest" data-id="${x.id}" aria-label="Recupero serie ${x.index}">
      <button class="mark" data-action="toggle-set" data-id="${x.id}" aria-label="Completa serie ${x.index}">${x.done ? '✓' : '○'}</button>
    </div>`).join('');

  return `${back}
  <div class="screen-head"><div><div class="kick">${esc(e.muscle)}</div><h1 style="font-size:28px">${esc(e.name)}</h1></div>
    <span class="chip effort">${doneCount}/${sets.length} serie</span></div>
  <p class="muted" style="margin:-8px 2px 14px;font-size:13px">Obiettivo ${e.targetSets}×${e.targetReps}${e.targetWeight ? ` @ ${fmtNum(e.targetWeight)} kg` : ''} · recupero base ${e.restSec}s</p>

  <div id="media-card" hidden style="margin-bottom:14px">
    <div id="media-list" data-planned="${e.plannedId || ''}" data-readonly="1" data-hero="1"></div>
  </div>

  <div class="card pad">
    <div class="setrow head"><span></span><span>Peso</span><span>Reps</span><span>Rec (s)</span><span></span></div>
    <div class="setgrid">${rows}</div>
  </div>
  <p class="muted" style="margin:10px 2px 0;font-size:12px">Usa il pulsantone in basso per farti guidare, oppure correggi i valori qui sopra a mano.</p>

  <div class="card pad" style="margin-top:14px">${noteField(e)}</div>`;
}

function noteField(e) {
  return `<div class="field" style="margin-bottom:0"><label>Note esercizio</label>
    <textarea data-action="ex-note" data-id="${e.id}" placeholder="Sensazioni, tecnica, dolori…">${esc(e.note || '')}</textarea></div>`;
}

/* ---------------- Weight ---------------- */
export function renderWeight() {
  const list = st.bodyweightSorted();
  const last = list.slice(-1)[0];
  const prev = list.slice(-2)[0];
  const delta = last && prev ? (last.kg - prev.kg) : null;
  const w = S.settings.weighIn;
  const iso = isoDate();
  const h = (S.settings.profile || {}).heightCm;
  let bmiLine = '';
  if (h && last) {
    const bmi = last.kg / ((h / 100) ** 2);
    const cat = bmi < 18.5 ? 'sottopeso' : bmi < 25 ? 'normopeso' : bmi < 30 ? 'sovrappeso' : 'obesità';
    bmiLine = `<div class="card pad" style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
      <span class="muted" style="font-size:13px">BMI (altezza ${h} cm)</span>
      <span><b class="tnum" style="font-family:'Barlow Condensed';font-size:20px">${fmtNum(Math.round(bmi * 10) / 10)}</b>
        <span class="chip rest" style="margin-left:6px">${cat}</span></span></div>`;
  }

  return `
  <div class="screen-head"><div><div class="kick">Composizione</div><h1>Peso</h1></div>
    <button class="iconbtn" data-action="theme">◐</button></div>

  <div class="tiles">
    <div class="tile"><div class="k">Ultimo peso</div><div class="v tnum">${last ? fmtNum(last.kg) : '—'}<small> kg</small></div></div>
    <div class="tile"><div class="k">Variazione</div><div class="v tnum" style="${delta != null ? `color:${delta <= 0 ? 'var(--rest)' : 'var(--effort)'}` : ''}">${
      delta == null ? '—' : (delta > 0 ? '+' : '') + fmtNum(Math.round(delta * 10) / 10)}<small>${delta != null ? ' kg' : ''}</small></div></div>
  </div>
  ${bmiLine}

  ${list.length >= 2 ? `<div class="card chartwrap">${sparkline(list)}</div>` : `
    <div class="card empty-state"><div class="em">⚖️</div>Registra almeno due pesate<br>per vedere l'andamento.</div>`}

  <div class="card pad" style="margin-top:14px">
    <div class="inline">
      <div class="field" style="margin-bottom:0"><label>Peso di oggi (kg)</label>
        <input type="number" inputmode="decimal" id="wkg" placeholder="es. 78,5"></div>
      <div class="field" style="margin-bottom:0;max-width:130px"><label>Data</label>
        <input type="date" id="wdate" value="${iso}"></div>
    </div>
    <button class="btn rest" data-action="add-weight" style="margin-top:14px">Salva pesata</button>
  </div>

  <div class="row spread card pad" style="margin-top:14px">
    <div><div style="font-weight:600">Promemoria settimanale</div>
      <div class="muted" style="font-size:12px">Ogni ${WD[w.weekday]} · ti ricordiamo di pesarti</div></div>
    <button class="toggle ${w.enabled ? 'on' : ''}" data-action="toggle-weighin" aria-label="Promemoria peso"></button>
  </div>
  ${w.enabled ? `<div class="field card pad" style="margin-top:10px"><label>Giorno del promemoria</label>
    <select data-action="weighin-day">${WD.map((d, i) => `<option value="${i}" ${i === w.weekday ? 'selected' : ''}>${d}</option>`).join('')}</select></div>` : ''}

  ${list.length ? `<div class="sect">Storico</div><div class="card pad wlist">${
    [...list].reverse().map((b) => `<div class="wrow">
      <div><div class="wk tnum">${fmtNum(b.kg)} kg</div><div class="wd">${fmtDay(b.date)}</div></div>
      <button class="iconbtn" data-action="del-weight" data-id="${b.id}" aria-label="Elimina">✕</button></div>`).join('')
  }</div>` : ''}
  `;
}

function sparkline(list) {
  const pts = list.slice(-16);
  const W = 320, H = 130, P = 24;
  const kgs = pts.map((p) => p.kg);
  let min = Math.min(...kgs), max = Math.max(...kgs);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15; min -= pad; max += pad;
  const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, pts.length - 1);
  const y = (kg) => H - P - ((kg - min) / (max - min)) * (H - 2 * P);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Andamento peso">
    <line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" style="stroke:var(--line)" stroke-width="1"/>
    <path d="${area}" style="fill:var(--rest);fill-opacity:.14"/>
    <path d="${line}" style="fill:none;stroke:var(--rest)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last.kg).toFixed(1)}" r="4" style="fill:var(--rest)"/>
    <text x="${P}" y="14" style="fill:var(--faint);font:600 11px Inter">${fmtNum(Math.round(max * 10) / 10)} kg</text>
    <text x="${P}" y="${H - 6}" style="fill:var(--faint);font:600 11px Inter">${fmtNum(Math.round(min * 10) / 10)} kg</text>
  </svg>`;
}

/* ---------------- Profile ---------------- */
export function renderProfile() {
  const prog = st.activeProgram();
  const days = st.S.days.filter((d) => d.programId === prog.id);
  const planCount = st.S.planned.length;
  const totalWorkouts = st.S.sessions.filter((s) => s.status === 'done').length;
  const wd = prog.weekdayPlan || {};
  const week = WD.map((label, i) => {
    const id = wd[i];
    const d = id ? st.dayById(id) : null;
    return `<div class="row spread" style="padding:11px 4px;border-bottom:1px solid var(--line)">
      <div class="row"><span class="chip ${d ? 'effort' : 'rest'}" style="width:44px;text-align:center">${label}</span>
        <b style="font-weight:600">${d ? esc(d.name) : 'Riposo'}</b></div>
      <span class="muted" style="font-size:12px">${d ? esc(d.muscles) : ''}</span></div>`;
  }).join('');

  const prof = S.settings.profile || {};
  const theme = S.settings.theme || 'system';
  const accent = S.settings.accent || 'coral';

  const goalOpts = `<option value="">— scegli —</option>` +
    Object.entries(GOALS).map(([k, v]) => `<option value="${k}" ${prof.goal === k ? 'selected' : ''}>${v}</option>`).join('');

  const segBtn = (val, label) =>
    `<button class="${theme === val ? 'on' : ''}" data-action="set-theme" data-theme="${val}">${label}</button>`;

  const swatches = Object.entries(ACCENTS).map(([k, a]) =>
    `<button class="swatch ${k === accent ? 'on' : ''}" data-action="set-accent" data-key="${k}"
      style="background:${a.main}" aria-label="${a.name}"></button>`).join('');

  return `
  <div class="screen-head"><div><div class="kick">Profilo</div><h1 style="text-wrap:balance">${prof.name ? 'Ciao, ' + esc(prof.name) : 'Il tuo profilo'}</h1></div>
    <button class="iconbtn" data-action="theme">◐</button></div>

  <div class="tiles">
    <div class="tile"><div class="k">Allenamenti totali</div><div class="v tnum">${totalWorkouts}</div></div>
    <div class="tile"><div class="k">Esercizi in scheda</div><div class="v tnum">${planCount}</div></div>
  </div>

  <div class="sect">Tu</div>
  <div class="card pad">
    <div class="field"><label>Nome</label>
      <input type="text" value="${esc(prof.name || '')}" data-action="prof-name" placeholder="Come ti chiami?"></div>
    <div class="field"><label>Obiettivo</label>
      <select data-action="prof-goal">${goalOpts}</select></div>
    <div class="field" style="margin-bottom:0"><label>Altezza (cm)</label>
      <input type="number" inputmode="numeric" value="${prof.heightCm ?? ''}" data-action="prof-height" placeholder="es. 178"></div>
  </div>

  <div class="sect">Programma</div>
  <div class="banner"><div class="lab">Programma attivo</div><div class="nm">${esc(prog.name)}</div>
    <div class="meta"><span>${days.length} giorni · split settimanale</span></div></div>
  <a class="btn" href="#/edit" style="margin-top:12px;display:block;text-align:center">Modifica scheda</a>

  <div class="sect">Settimana tipo</div>
  <div class="card pad" style="padding-top:2px;padding-bottom:2px">${week}</div>

  <div class="sect">Aspetto</div>
  <div class="card pad">
    <div class="field"><label>Tema</label>
      <div class="seg">${segBtn('system', 'Sistema')}${segBtn('light', 'Chiaro')}${segBtn('dark', 'Scuro')}</div></div>
    <div class="field" style="margin-bottom:0"><label>Colore accento</label>
      <div class="swatches">${swatches}</div></div>
  </div>

  <div class="sect">Allenamento</div>
  <div class="card pad">
    <div class="row spread" style="padding:6px 0">
      <div><div style="font-weight:600">Notifica-telecomando</div><div class="muted" style="font-size:12px">Gestisci serie e recuperi dai pulsanti della notifica, anche da bloccato (Android)</div></div>
      <button class="toggle ${(S.settings.workout||{}).notify === true ? 'on' : ''}" data-action="toggle-notify" aria-label="Notifiche recupero"></button>
    </div>
    <div class="row spread" style="padding:8px 2px 4px;flex-wrap:wrap;gap:8px">
      <span class="muted" style="font-size:12px">Avviso a schermo bloccato: ${(() => {
        const ok = 'Notification' in window && window.Notification.prototype && 'showTrigger' in window.Notification.prototype && 'TimestampTrigger' in window;
        return ok ? '<b style="color:var(--rest)">supportato ✓</b>' : '<b style="color:var(--effort)">non supportato qui</b>';
      })()}</span>
      <button class="btn ghost btn-sm" data-action="test-notify" style="width:auto">🔔 Prova (5s)</button>
    </div>
    <hr class="hr">
    <div class="row spread" style="padding:10px 0">
      <div><div style="font-weight:600">Suoni</div><div class="muted" style="font-size:12px">Bip a fine recupero (sopra la musica)</div></div>
      <button class="toggle ${(S.settings.workout||{}).sound !== false ? 'on' : ''}" data-action="toggle-sound" aria-label="Suoni"></button>
    </div>
    <hr class="hr">
    <div class="row spread" style="padding:10px 0 6px">
      <div><div style="font-weight:600">Tieni schermo acceso</div><div class="muted" style="font-size:12px">Evita il blocco durante l'allenamento</div></div>
      <button class="toggle ${(S.settings.workout||{}).keepScreenOn !== false ? 'on' : ''}" data-action="toggle-screen" aria-label="Schermo acceso"></button>
    </div>
  </div>

  <div class="sect">App</div>
  <div class="card pad">
    <div class="row spread" style="padding:6px 0"><span>Versione</span><span class="chip effort">${APP_VERSION}</span></div>
    <hr class="hr">
    <div class="row spread" style="padding:10px 0"><span>Sincronizzazione cloud</span><span class="chip ghost">In arrivo</span></div>
    <p class="muted" style="font-size:12px;margin:0 0 12px">I dati sono salvati sul dispositivo. La sincronizzazione tra telefoni (Supabase) arriva nel prossimo step.</p>
    <a class="btn ghost" href="${feedbackHref()}" style="display:block;text-align:center">✉️ Segnala un problema</a>
  </div>
  <p class="muted" style="text-align:center;font-size:12px;margin-top:20px">Palestra · ${APP_VERSION} · PWA offline</p>`;
}

function feedbackHref() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const subject = `Palestra ${APP_VERSION} — feedback`;
  const body = `Scrivi qui il tuo feedback o il problema:\n\n\n\n———\nInfo tecniche (non cancellare):\nVersione: ${APP_VERSION}\nDispositivo: ${ua}`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function themeLabel() {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'dark' ? 'Scuro' : t === 'light' ? 'Chiaro' : 'Sistema';
}

/* ---------------- Editor: programma ---------------- */
export function renderEditProgram() {
  const prog = st.activeProgram();
  const days = st.S.days.filter((d) => d.programId === prog.id);
  const wd = prog.weekdayPlan || {};

  const dayCards = days.map((d) => {
    const n = st.plannedForDay(d.id).length;
    return `<div class="row spread" style="padding:12px 4px;border-bottom:1px solid var(--line)">
      <a href="#/edit-day/${d.id}" style="flex:1">
        <div style="font-weight:600">${esc(d.name)}</div>
        <div class="muted" style="font-size:12px">${esc(d.muscles || '—')} · ${n} esercizi</div></a>
      <a class="btn-sm btn ghost" href="#/edit-day/${d.id}" style="margin-right:8px">Modifica</a>
      <button class="iconbtn" data-action="del-day" data-id="${d.id}" aria-label="Elimina giorno">✕</button>
    </div>`;
  }).join('') || `<p class="muted" style="padding:12px 4px">Nessun giorno. Aggiungine uno.</p>`;

  const dayOpts = (sel) => `<option value="">Riposo</option>` +
    days.map((d) => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
  const week = WD.map((label, i) => `<div class="row spread" style="padding:9px 4px;border-bottom:1px solid var(--line)">
    <span class="chip ${wd[i] ? 'effort' : 'rest'}" style="width:44px;text-align:center">${label}</span>
    <select data-action="assign-weekday" data-wd="${i}" style="flex:1;max-width:220px;border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:10px;padding:9px 10px;font:inherit;font-size:14px">${dayOpts(wd[i] ?? '')}</select>
  </div>`).join('');

  return `
  <button class="backbtn" data-action="go" data-href="#/profile">‹ Profilo</button>
  <div class="screen-head"><div><div class="kick">Editor</div><h1>Modifica scheda</h1></div></div>

  <div class="field"><label>Nome programma</label>
    <input type="text" value="${esc(prog.name)}" data-action="rename-program"></div>

  <div class="sect">Giorni di allenamento</div>
  <div class="card pad" style="padding-top:2px;padding-bottom:2px">${dayCards}</div>
  <button class="btn ghost" data-action="add-day" style="margin-top:12px">+ Aggiungi giorno</button>

  <div class="sect">Assegna alla settimana</div>
  <div class="card pad" style="padding-top:2px;padding-bottom:2px">${week}</div>
  <p class="muted" style="font-size:12px;margin-top:10px">Il calendario e la schermata "Oggi" seguono questa assegnazione.</p>
  `;
}

/* ---------------- Editor: giorno ---------------- */
export function renderEditDay(dayId) {
  const d = st.dayById(dayId);
  if (!d) return `<div class="empty-state">Giorno non trovato.</div>`;
  const exs = st.plannedForDay(dayId);
  const rows = exs.map((p, i) => {
    const label = p.kind === 'cardio' ? `${Math.round((p.targetDurationSec || 0) / 60)} min`
      : `${p.targetSets}×${p.targetReps}${p.targetWeight ? ` · ${fmtNum(p.targetWeight)}kg` : ''}`;
    return `<div class="row" style="gap:8px;padding:11px 4px;border-bottom:1px solid var(--line)">
      <div class="stack" style="gap:2px">
        <button class="iconbtn" style="width:26px;height:22px;font-size:12px" data-action="ex-up" data-id="${p.id}" ${i === 0 ? 'disabled' : ''} aria-label="Su">▲</button>
        <button class="iconbtn" style="width:26px;height:22px;font-size:12px" data-action="ex-down" data-id="${p.id}" ${i === exs.length - 1 ? 'disabled' : ''} aria-label="Giù">▼</button>
      </div>
      <a href="#/edit-ex/${dayId}/${p.id}" style="flex:1">
        <div style="font-weight:600">${esc(p.name) || '(senza nome)'} ${p.kind === 'cardio' ? '<span class="chip rest" style="padding:2px 7px">cardio</span>' : ''}</div>
        <div class="muted" style="font-size:12px">${esc(p.muscle || '—')} · ${label} · riposo ${p.restSec}s</div></a>
      <button class="iconbtn" data-action="del-ex" data-id="${p.id}" aria-label="Elimina">✕</button>
    </div>`;
  }).join('') || `<p class="muted" style="padding:12px 4px">Nessun esercizio ancora.</p>`;

  return `
  <button class="backbtn" data-action="go" data-href="#/edit">‹ Scheda</button>
  <div class="screen-head"><div><div class="kick">Giorno</div><h1 style="font-size:30px">${esc(d.name)}</h1></div></div>

  <div class="inline">
    <div class="field"><label>Nome giorno</label>
      <input type="text" value="${esc(d.name)}" data-action="rename-day" data-id="${dayId}"></div>
  </div>
  <div class="field"><label>Gruppi muscolari</label>
    <input type="text" value="${esc(d.muscles || '')}" data-action="day-muscles" data-id="${dayId}" placeholder="es. Petto · Spalle · Tricipiti"></div>

  <div class="sect">Esercizi</div>
  <div class="card pad" style="padding-top:2px;padding-bottom:2px">${rows}</div>
  <button class="btn" data-action="add-ex" data-id="${dayId}" style="margin-top:12px">+ Aggiungi esercizio</button>
  `;
}

/* ---------------- Editor: esercizio ---------------- */
export function renderEditExercise(dayId, pid) {
  const isNew = pid === 'new';
  const p = isNew
    ? { name: '', muscle: '', kind: 'strength', targetSets: 3, targetReps: 10, targetWeight: 0, restSec: 90, targetDurationSec: 600 }
    : st.S.planned.find((x) => x.id === pid);
  if (!p) return `<div class="empty-state">Esercizio non trovato.</div>`;
  const isCardio = p.kind === 'cardio';

  return `
  <button class="backbtn" data-action="go" data-href="#/edit-day/${dayId}">‹ Esercizi</button>
  <div class="screen-head"><div><div class="kick">${isNew ? 'Nuovo' : 'Modifica'}</div><h1 style="font-size:30px">Esercizio</h1></div></div>

  <form class="exform" onsubmit="return false">
    <div class="field"><label>Nome</label>
      <input type="text" id="ex-name" value="${esc(p.name)}" placeholder="es. Panca piana bilanciere" autofocus></div>
    <div class="field"><label>Gruppo muscolare</label>
      <input type="text" id="ex-muscle" value="${esc(p.muscle)}" placeholder="es. Petto"></div>

    <div class="field"><label>Tipo</label>
      <div class="row" style="gap:16px">
        <label class="row" style="gap:6px"><input type="radio" name="ex-kind" value="strength" ${!isCardio ? 'checked' : ''}> Forza</label>
        <label class="row" style="gap:6px"><input type="radio" name="ex-kind" value="cardio" ${isCardio ? 'checked' : ''}> Cardio</label>
      </div>
    </div>

    <div class="grp-strength">
      <div class="inline">
        <div class="field"><label>Serie</label><input type="number" id="ex-sets" inputmode="numeric" value="${p.targetSets ?? 3}"></div>
        <div class="field"><label>Ripetizioni</label><input type="text" id="ex-reps" inputmode="text" value="${esc(String(p.targetReps ?? 10))}" placeholder="es. 8-10"></div>
      </div>
      <div class="field"><label>Peso obiettivo (kg)</label><input type="number" id="ex-weight" inputmode="decimal" value="${p.targetWeight ?? 0}"></div>
    </div>

    <div class="grp-cardio">
      <div class="field"><label>Durata (min)</label><input type="number" id="ex-dur" inputmode="numeric" value="${Math.round((p.targetDurationSec || 600) / 60)}"></div>
    </div>

    <div class="field"><label>Riposo (secondi)</label><input type="number" id="ex-rest" inputmode="numeric" value="${p.restSec ?? 90}"></div>
  </form>

  <button class="btn" data-action="save-ex" data-day="${dayId}" data-id="${isNew ? 'new' : p.id}" style="margin-top:6px">${isNew ? 'Aggiungi' : 'Salva'}</button>

  <div class="sect">Foto / video</div>
  ${isNew ? `<p class="muted" style="font-size:13px;padding:2px">Salva prima l'esercizio, poi potrai aggiungere foto o un breve video di riferimento.</p>` : `
  <div class="card pad">
    <div id="media-list" class="media-grid" data-planned="${p.id}"></div>
    <label class="btn ghost filebtn" style="margin-top:10px">📷 Aggiungi foto / video
      <input type="file" accept="image/*,video/*" data-action="add-media" data-planned="${p.id}" hidden multiple>
    </label>
    <p class="muted" style="font-size:12px;margin:10px 0 0">Restano sul dispositivo. Per i video usa clip brevi.</p>
  </div>`}

  ${isNew ? '' : `<button class="btn ghost" data-action="del-ex-back" data-id="${p.id}" data-day="${dayId}" style="margin-top:14px">Elimina esercizio</button>`}
  `;
}

/* ---------------- shared bits ---------------- */
function weighInPrompt() {
  return `<div class="card pad" style="border-color:var(--rest);margin-bottom:14px">
    <div class="row spread"><div><div style="font-weight:700">⚖️ Pesata settimanale</div>
      <div class="muted" style="font-size:12px">È il tuo giorno: registra il peso di oggi.</div></div>
      <a class="btn-sm btn rest" href="#/weight" style="text-decoration:none">Registra</a></div></div>`;
}
