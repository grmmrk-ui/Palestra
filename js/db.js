// Thin promise wrapper over IndexedDB.
// Stores mirror the data model; every doc has a string `id` primary key.

const DB_NAME = 'palestra';
const DB_VERSION = 3;

export const STORES = {
  settings:      { key: 'id' },
  programs:      { key: 'id' },
  days:          { key: 'id', indexes: { programId: 'programId' } },
  planned:       { key: 'id', indexes: { dayId: 'dayId' } },
  sessions:      { key: 'id', indexes: { date: 'date' } },
  logExercises:  { key: 'id', indexes: { sessionId: 'sessionId' } },
  logSets:       { key: 'id', indexes: { logExerciseId: 'logExerciseId' } },
  bodyweight:    { key: 'id', indexes: { date: 'date' } },
  media:         { key: 'id', indexes: { plannedId: 'plannedId' } }, // foto/video per esercizio (blob)
  tombstones:    { key: 'id' }, // cancellazioni, per il merge tra dispositivi
};

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: cfg.key });
          for (const [idx, path] of Object.entries(cfg.indexes || {})) {
            store.createIndex(idx, path, { unique: false });
          }
        }
      }
    };
    // Un'altra connessione (es. una vecchia scheda) blocca l'upgrade.
    req.onblocked = () => { /* si sblocca quando le altre connessioni si chiudono via onversionchange */ };
    req.onsuccess = () => {
      _db = req.result;
      // Se un'altra scheda avvia un upgrade, chiudi subito per non bloccarla.
      _db.onversionchange = () => { try { _db.close(); } catch (e) {} _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) {
  return _db.transaction(store, mode).objectStore(store);
}

const wrap = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

export const getAll = (store) => open().then(() => wrap(tx(store, 'readonly').getAll()));
export const getAllByIndex = (store, index, key) =>
  open().then(() => wrap(tx(store, 'readonly').index(index).getAll(key)));
export const get = (store, id) => open().then(() => wrap(tx(store, 'readonly').get(id)));
// Gli store sincronizzati marcano ogni scrittura con `updatedAt` (merge per record)
// e ogni cancellazione con una tombstone. `raw` salta il marcaggio (import/merge).
const SYNCED = new Set(['settings', 'programs', 'days', 'planned', 'sessions', 'logExercises', 'logSets', 'bodyweight']);
const stamp = (store, val) => { if (SYNCED.has(store)) val.updatedAt = Date.now(); return val; };

export const put = (store, val, raw) => open().then(() =>
  wrap(tx(store, 'readwrite').put(raw ? val : stamp(store, val))).then(() => val));
export const del = (store, id) => open().then(async () => {
  await wrap(tx(store, 'readwrite').delete(id));
  if (SYNCED.has(store)) {
    await wrap(tx('tombstones', 'readwrite').put({ id: `${store}:${id}`, store, docId: id, at: Date.now() }));
  }
});
// Cancella senza creare tombstone (usato dal merge).
export const rawDel = (store, id) => open().then(() => wrap(tx(store, 'readwrite').delete(id)));
export const clear = (store) => open().then(() => wrap(tx(store, 'readwrite').clear()));

export function bulkPut(store, vals, raw) {
  return open().then(() => new Promise((res, rej) => {
    const t = _db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    vals.forEach((v) => os.put(raw ? v : stamp(store, v)));
    t.oncomplete = () => res(vals);
    t.onerror = () => rej(t.error);
  }));
}
