// In-memory state backed by IndexedDB. Views read from S and call these ops;
// ops mutate S and persist, then app.js re-renders.
import * as db from './db.js';
import { buildSeed } from './seed.js';
import { uid, isoDate, parseISO, weekdayMon, daysBetween, repsLow } from './util.js';

export const S = {
  settings: null,
  programs: [], days: [], planned: [],
  sessions: [], logExercises: [], logSets: [], bodyweight: [],
};

export async function boot() {
  await db.open();
  const [settings, programs, days, planned, sessions, logExercises, logSets, bodyweight] =
    await Promise.all([
      db.getAll('settings'), db.getAll('programs'), db.getAll('days'), db.getAll('planned'),
      db.getAll('sessions'), db.getAll('logExercises'), db.getAll('logSets'), db.getAll('bodyweight'),
    ]);

  if (!settings.length) {
    const seed = buildSeed();
    await db.put('programs', seed.program);
    await db.bulkPut('days', seed.days);
    await db.bulkPut('planned', seed.planned);
    await db.put('settings', seed.settings);
    S.settings = seed.settings;
    S.programs = [seed.program];
    S.days = seed.days;
    S.planned = seed.planned;
  } else {
    S.settings = settings[0];
    S.programs = programs; S.days = days; S.planned = planned;
  }
  S.sessions = sessions; S.logExercises = logExercises;
  S.logSets = logSets; S.bodyweight = bodyweight;
}

/* ---- getters ---- */
export const activeProgram = () =>
  S.programs.find((p) => p.id === S.settings.activeProgramId) || S.programs[0];

export const dayById = (id) => S.days.find((d) => d.id === id);
export const plannedForDay = (dayId) =>
  S.planned.filter((p) => p.dayId === dayId).sort((a, b) => a.order - b.order);

export const dayIdForDate = (iso) => {
  const prog = activeProgram();
  if (!prog || !prog.weekdayPlan) return null;
  return prog.weekdayPlan[weekdayMon(parseISO(iso))] ?? null;
};

export const sessionByDate = (iso) => S.sessions.find((s) => s.date === iso);
export const logExOfSession = (sid) =>
  S.logExercises.filter((e) => e.sessionId === sid).sort((a, b) => a.order - b.order);
export const setsOfLogEx = (leid) =>
  S.logSets.filter((s) => s.logExerciseId === leid).sort((a, b) => a.index - b.index);
export const logExById = (id) => S.logExercises.find((e) => e.id === id);

// Ultimo esercizio effettivamente eseguito (almeno una serie fatta) prima di
// beforeDate, per riportare pesi e note nell'allenamento successivo.
export function lastPerformedExercise(planned, beforeDate) {
  const past = S.sessions
    .filter((s) => s.date < beforeDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const match = (e) => (planned.id && e.plannedId === planned.id)
    || (e.name === planned.name && e.muscle === planned.muscle);
  for (const s of past) {
    const le = logExOfSession(s.id).find(match);
    if (!le) continue;
    const sets = setsOfLogEx(le.id);
    if (sets.some((x) => x.done)) return { le, sets };
  }
  return null;
}

export const bodyweightSorted = () =>
  [...S.bodyweight].sort((a, b) => (a.date < b.date ? -1 : 1));

/* ---- session ops ---- */
export async function ensureSession(iso) {
  let s = sessionByDate(iso);
  if (s) return s;
  const dayId = dayIdForDate(iso);
  if (!dayId) return null; // rest day
  const day = dayById(dayId);
  s = {
    id: uid(), date: iso, dayId, programId: activeProgram().id,
    dayName: day.name, status: 'planned',
    startedAt: null, endedAt: null, durationSec: 0, note: '',
  };
  S.sessions.push(s);
  await db.put('sessions', s);

  const newEx = [], newSets = [];
  for (const p of plannedForDay(dayId)) {
    const hist = lastPerformedExercise(p, iso);
    const le = {
      id: uid(), sessionId: s.id, plannedId: p.id, name: p.name, muscle: p.muscle,
      kind: p.kind, note: (hist && hist.le.note) || '', order: p.order, restSec: p.restSec,
      targetSets: p.targetSets, targetReps: p.targetReps, targetWeight: p.targetWeight,
      targetDurationSec: p.targetDurationSec || 0,
    };
    newEx.push(le);
    if (p.kind === 'cardio') {
      newSets.push({ id: uid(), logExerciseId: le.id, index: 1, kind: 'cardio',
        durationSec: p.targetDurationSec || 0, distance: null, done: false });
    } else {
      for (let i = 1; i <= p.targetSets; i++) {
        const prev = hist && hist.sets.find((x) => x.index === i);
        const weight = prev && prev.weight != null ? prev.weight : p.targetWeight;
        newSets.push({ id: uid(), logExerciseId: le.id, index: i, kind: 'strength',
          weight, reps: repsLow(p.targetReps), rpe: null, restSec: p.restSec, done: false });
      }
    }
  }
  S.logExercises.push(...newEx);
  S.logSets.push(...newSets);
  await db.bulkPut('logExercises', newEx);
  await db.bulkPut('logSets', newSets);
  return s;
}

export async function patchSession(id, patch) {
  const s = S.sessions.find((x) => x.id === id);
  if (!s) return;
  Object.assign(s, patch);
  await db.put('sessions', s);
}

export async function startSession(iso) {
  const s = await ensureSession(iso);
  if (!s) return null;
  if (!s.startedAt) await patchSession(s.id, { startedAt: Date.now(), status: 'active' });
  return s;
}

export async function deleteSession(id) {
  const exs = S.logExercises.filter((e) => e.sessionId === id);
  const exIds = new Set(exs.map((e) => e.id));
  const sets = S.logSets.filter((s) => exIds.has(s.logExerciseId));
  for (const s of sets) await db.del('logSets', s.id);
  for (const e of exs) await db.del('logExercises', e.id);
  await db.del('sessions', id);
  S.logSets = S.logSets.filter((s) => !exIds.has(s.logExerciseId));
  S.logExercises = S.logExercises.filter((e) => e.sessionId !== id);
  S.sessions = S.sessions.filter((x) => x.id !== id);
}

export async function endSession(id) {
  const s = S.sessions.find((x) => x.id === id);
  if (!s) return;
  const dur = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : s.durationSec;
  await patchSession(id, { endedAt: Date.now(), durationSec: dur, status: 'done' });
}

export function sessionProgress(sid) {
  const ex = logExOfSession(sid);
  let total = 0, done = 0;
  for (const e of ex) for (const st of setsOfLogEx(e.id)) { total++; if (st.done) done++; }
  return { total, done, exCount: ex.length };
}

/* ---- set ops ---- */
export async function patchSet(id, patch) {
  const st = S.logSets.find((x) => x.id === id);
  if (!st) return;
  Object.assign(st, patch);
  await db.put('logSets', st);
}
export async function patchLogEx(id, patch) {
  const e = logExById(id);
  if (!e) return;
  Object.assign(e, patch);
  await db.put('logExercises', e);
}

/* ---- bodyweight ---- */
export async function addBodyweight(iso, kg, note = '') {
  const existing = S.bodyweight.find((b) => b.date === iso);
  if (existing) { Object.assign(existing, { kg, note }); await db.put('bodyweight', existing); return existing; }
  const b = { id: uid(), date: iso, kg, note };
  S.bodyweight.push(b);
  await db.put('bodyweight', b);
  return b;
}
export async function deleteBodyweight(id) {
  S.bodyweight = S.bodyweight.filter((b) => b.id !== id);
  await db.del('bodyweight', id);
}

/* ---- settings ---- */
export async function patchSettings(patch) {
  Object.assign(S.settings, patch);
  await db.put('settings', S.settings);
}

/* ---- media (foto/video per esercizio) ---- */
export const getMedia = (plannedId) => db.getAllByIndex('media', 'plannedId', plannedId);
export async function addMedia(plannedId, file) {
  const m = {
    id: uid(), plannedId,
    type: (file.type || '').startsWith('video') ? 'video' : 'image',
    mime: file.type || '', name: file.name || '', size: file.size || 0,
    blob: file, createdAt: Date.now(),
  };
  await db.put('media', m);
  return m;
}
export const deleteMedia = (id) => db.del('media', id);

/* ---- live workout (telecomando notifica) ---- */
export const getLive = () => db.get('settings', 'live');
export async function setLive(live) { live.id = 'live'; await db.put('settings', live); return live; }
export async function reloadWorkout() {
  const [sessions, logExercises, logSets] = await Promise.all([
    db.getAll('sessions'), db.getAll('logExercises'), db.getAll('logSets'),
  ]);
  S.sessions = sessions; S.logExercises = logExercises; S.logSets = logSets;
}

/* ---- program / schede editor ---- */
export async function renameProgram(name) {
  const p = activeProgram();
  p.name = name;
  await db.put('programs', p);
}

export async function setWeekday(weekdayIdx, dayId) {
  const p = activeProgram();
  p.weekdayPlan = { ...(p.weekdayPlan || {}), [weekdayIdx]: dayId || null };
  await db.put('programs', p);
}

export async function addDay(name, muscles) {
  const day = { id: uid(), programId: activeProgram().id, name: name || 'Nuovo giorno', muscles: muscles || '' };
  S.days.push(day);
  await db.put('days', day);
  return day;
}

export async function updateDay(id, patch) {
  const d = dayById(id);
  if (!d) return;
  Object.assign(d, patch);
  await db.put('days', d);
}

export async function deleteDay(id) {
  // remove planned of this day
  const kids = S.planned.filter((p) => p.dayId === id);
  for (const k of kids) await db.del('planned', k.id);
  S.planned = S.planned.filter((p) => p.dayId !== id);
  // clear weekday assignments
  const prog = activeProgram();
  let changed = false;
  for (const [wd, did] of Object.entries(prog.weekdayPlan || {})) {
    if (did === id) { prog.weekdayPlan[wd] = null; changed = true; }
  }
  if (changed) await db.put('programs', prog);
  S.days = S.days.filter((d) => d.id !== id);
  await db.del('days', id);
}

export async function addPlanned(dayId, data) {
  const orders = plannedForDay(dayId).map((p) => p.order);
  const order = orders.length ? Math.max(...orders) + 1 : 0;
  const p = { id: uid(), dayId, order, kind: 'strength',
    name: '', muscle: '', targetSets: 3, targetReps: 10, targetWeight: 0, restSec: 90, targetDurationSec: 0,
    ...data };
  S.planned.push(p);
  await db.put('planned', p);
  return p;
}

export async function updatePlanned(id, patch) {
  const p = S.planned.find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  await db.put('planned', p);
}

export async function deletePlanned(id) {
  S.planned = S.planned.filter((p) => p.id !== id);
  await db.del('planned', id);
}

export async function movePlanned(id, dir) {
  const p = S.planned.find((x) => x.id === id);
  if (!p) return;
  const sibs = plannedForDay(p.dayId);
  const i = sibs.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= sibs.length) return;
  const other = sibs[j];
  const tmp = p.order; p.order = other.order; other.order = tmp;
  await db.put('planned', p);
  await db.put('planned', other);
}

/* ---- stats ---- */
export function streak() {
  const today = isoDate();
  let count = 0;
  let cur = parseISO(today);
  for (let i = 0; i < 365; i++) {
    const iso = isoDate(cur);
    const dayId = dayIdForDate(iso);
    const sess = sessionByDate(iso);
    if (dayId == null) { count++; }                       // rest day keeps streak
    else if (sess && sess.status === 'done') { count++; } // completed training
    else if (iso === today) { /* today pending: don't break, don't count */ }
    else break;
    cur.setDate(cur.getDate() - 1);
  }
  return count;
}

export function monthStats(year, month) {
  const inMonth = (iso) => { const d = parseISO(iso); return d.getFullYear() === year && d.getMonth() === month; };
  const done = S.sessions.filter((s) => s.status === 'done' && inMonth(s.date));
  const totalSec = done.reduce((a, s) => a + (s.durationSec || 0), 0);
  return { workouts: done.length, avgSec: done.length ? Math.round(totalSec / done.length) : 0 };
}

export function weighInDue() {
  const w = S.settings.weighIn;
  if (!w || !w.enabled) return false;
  const today = parseISO(isoDate());
  if (weekdayMon(today) !== w.weekday) return false;
  const last = bodyweightSorted().slice(-1)[0];
  if (!last) return true;
  return daysBetween(last.date, isoDate()) >= 6;
}
