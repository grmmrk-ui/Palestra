// Thin promise wrapper over IndexedDB.
// Stores mirror the data model; every doc has a string `id` primary key.

const DB_NAME = 'palestra';
const DB_VERSION = 1;

export const STORES = {
  settings:      { key: 'id' },
  programs:      { key: 'id' },
  days:          { key: 'id', indexes: { programId: 'programId' } },
  planned:       { key: 'id', indexes: { dayId: 'dayId' } },
  sessions:      { key: 'id', indexes: { date: 'date' } },
  logExercises:  { key: 'id', indexes: { sessionId: 'sessionId' } },
  logSets:       { key: 'id', indexes: { logExerciseId: 'logExerciseId' } },
  bodyweight:    { key: 'id', indexes: { date: 'date' } },
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
    req.onsuccess = () => { _db = req.result; resolve(_db); };
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
export const get = (store, id) => open().then(() => wrap(tx(store, 'readonly').get(id)));
export const put = (store, val) => open().then(() => wrap(tx(store, 'readwrite').put(val)).then(() => val));
export const del = (store, id) => open().then(() => wrap(tx(store, 'readwrite').delete(id)));

export function bulkPut(store, vals) {
  return open().then(() => new Promise((res, rej) => {
    const t = _db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    vals.forEach((v) => os.put(v));
    t.oncomplete = () => res(vals);
    t.onerror = () => rej(t.error);
  }));
}
