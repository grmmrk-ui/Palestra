// Palestra — service worker (offline app shell)
const CACHE = 'palestra-v20';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './js/app.js',
  './js/db.js',
  './js/seed.js',
  './js/state.js',
  './js/util.js',
  './js/views.js',
  './js/config.js',
  './js/push.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ============================================================
   Telecomando allenamento: notifica con pulsanti guidata dal SW.
   Legge/scrive lo stesso IndexedDB dell'app. Solo Android supporta
   i pulsanti-azione nelle notifiche.
   ============================================================ */
const WTAG = 'palestra-workout';
const TRIGGER_OK = 'showTrigger' in Notification.prototype && 'TimestampTrigger' in self;

let _swDB = null;
function openDB() {
  if (_swDB) return Promise.resolve(_swDB);
  return new Promise((res, rej) => {
    const r = indexedDB.open('palestra');
    r.onsuccess = () => {
      _swDB = r.result;
      // Non bloccare gli upgrade del DB avviati dall'app: chiudi su versionchange.
      _swDB.onversionchange = () => { try { _swDB.close(); } catch (e) {} _swDB = null; };
      res(_swDB);
    };
    r.onerror = () => rej(r.error);
  });
}
function reqP(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
async function dbGet(store, id) { const db = await openDB(); return reqP(db.transaction(store, 'readonly').objectStore(store).get(id)); }
async function dbPut(store, val) { const db = await openDB(); return reqP(db.transaction(store, 'readwrite').objectStore(store).put(val)); }
async function dbIndexAll(store, index, key) {
  const db = await openDB();
  return reqP(db.transaction(store, 'readonly').objectStore(store).index(index).getAll(key));
}
const setsFor = async (exId) => (await dbIndexAll('logSets', 'logExerciseId', exId)).sort((a, b) => a.index - b.index);
const exsFor = async (sid) => (await dbIndexAll('logExercises', 'sessionId', sid)).sort((a, b) => a.order - b.order);
const loadLive = async () => (await dbGet('settings', 'live')) || null;
async function saveLive(live) { live.id = 'live'; await dbPut('settings', live); return live; }

async function advance(action) {
  const live = await loadLive();
  if (!live || !live.active) return null;
  const ex = await dbGet('logExercises', live.exerciseId);
  if (!ex) return null;
  let sets = await setsFor(live.exerciseId);

  if (action === 'done') {
    const cur = sets.find((s) => !s.done);
    if (cur) {
      cur.done = true; await dbPut('logSets', cur);
      sets = await setsFor(live.exerciseId);
      const sec = (cur.restSec != null ? cur.restSec : ex.restSec) || 0;
      live.phase = 'rest';
      live.restEndsAt = Date.now() + sec * 1000;
    }
  } else if (action === 'next') { // recupero finito / salta
    live.phase = sets.some((s) => !s.done) ? 'work' : 'exdone';
    live.restEndsAt = null;
  } else if (action === 'nextex') {
    const exs = await exsFor(live.sessionId);
    const i = exs.findIndex((x) => x.id === live.exerciseId);
    const nxt = exs[i + 1];
    if (nxt) { live.exerciseId = nxt.id; live.phase = 'work'; live.restEndsAt = null; }
    else { live.active = false; }
  }
  return saveLive(live);
}

async function clearWorkoutNotifs(reg) {
  try {
    const ns = await reg.getNotifications({ tag: WTAG, includeTriggered: true });
    ns.forEach((n) => n.close());
  } catch (e) {}
}

async function renderWorkoutNotification(reg, live) {
  if (!live || !live.active) { await clearWorkoutNotifs(reg); return; }
  const ex = await dbGet('logExercises', live.exerciseId);
  if (!ex) { await clearWorkoutNotifs(reg); return; }
  const sets = await setsFor(live.exerciseId);
  const tot = sets.length;
  const base = { tag: WTAG, requireInteraction: true, icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { workout: true } };

  if (live.phase === 'rest') {
    const nextSet = sets.find((s) => !s.done);
    const p2 = (n) => String(n).padStart(2, '0');
    let endClk = '';
    if (live.restEndsAt) { const d = new Date(live.restEndsAt); endClk = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; }
    const poi = nextSet ? `serie ${nextSet.index} di ${tot}` : 'prossimo esercizio';
    await clearWorkoutNotifs(reg);
    // notifica "in corso" (silenziosa)
    await reg.showNotification('⏱ Recupero', {
      ...base, silent: true,
      body: `${endClk ? `Fino alle ${endClk} · ` : ''}poi ${poi}`,
      actions: [{ action: 'next', title: '▶ Prossima serie' }],
    });
    // notifica temporizzata a fine recupero (vibra) — se supportato
    if (TRIGGER_OK && live.restEndsAt) {
      try {
        await reg.showNotification('Recupero finito 💪', {
          ...base, vibrate: [200, 100, 200], silent: live.sound === false, // Suoni OFF → nessun audio (non tocca Spotify)
          body: nextSet ? `Inizia la serie ${nextSet.index} · ${ex.name}` : `Passa al prossimo esercizio`,
          actions: [{ action: nextSet ? 'next' : 'nextex', title: nextSet ? '▶ Prossima serie' : '→ Prossimo esercizio' }],
          showTrigger: new TimestampTrigger(live.restEndsAt),
        });
      } catch (e) {}
    }
  } else if (live.phase === 'exdone') {
    await clearWorkoutNotifs(reg);
    await reg.showNotification('Esercizio completato ✓', {
      ...base, silent: true, body: ex.name,
      actions: [{ action: 'nextex', title: '→ Prossimo esercizio' }],
    });
  } else { // work
    const cur = sets.find((s) => !s.done) || sets[tot - 1];
    await clearWorkoutNotifs(reg);
    await reg.showNotification(ex.name, {
      ...base, silent: true, body: `Serie ${cur ? cur.index : 1} di ${tot} · ${ex.muscle || ''}`.trim(),
      actions: [{ action: 'done', title: '✓ Serie fatta' }],
    });
  }
}

self.addEventListener('notificationclick', (e) => {
  const action = e.action;
  e.notification.close();
  e.waitUntil((async () => {
    const reg = self.registration;
    if (action === 'done' || action === 'next' || action === 'nextex') {
      const live = await advance(action);
      await renderWorkoutNotification(reg, live);
      const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      cls.forEach((c) => c.postMessage({ type: 'workout-advanced' }));
      return;
    }
    // tap sul corpo → porta in primo piano l'app
    const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cls) { if ('focus' in c) { try { await c.navigate(c.url); } catch (_) {} return c.focus(); } }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});

// Push dal server (arriva anche a schermo bloccato) → mostra la notifica.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Recupero finito 💪', {
    tag: WTAG, body: d.body || '', requireInteraction: true, vibrate: [200, 100, 200],
    icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    actions: [{ action: d.action || 'next', title: d.actionTitle || '▶ Prossima serie' }],
    data: { workout: true },
  }));
});

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'render-workout') {
    e.waitUntil((async () => {
      const live = await loadLive();
      await renderWorkoutNotification(self.registration, live);
    })());
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Google Fonts: cache-first, opaque ok
  if (url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }))
      )
    );
    return;
  }
  if (url.origin !== location.origin) return; // let cross-origin (e.g. Supabase) pass through
  // App assets: network-first (sempre fresco online), cache come fallback offline
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await caches.match(req);
      return hit || caches.match('./index.html');
    }
  })());
});
