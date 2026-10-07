/* Preview photo store: keeps Smile Frames in this browser only (IndexedDB).
 * Same list() / add(blob) shape as the app's store, plus remove(id),
 * so a shared backend can replace it later. */
window.SmileStore = (() => {
  'use strict';
  const DB = 'smile-day-preview', STORE = 'photos';
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    list: () => tx('readonly', (s) => s.getAll()).then((rows) => (rows || []).sort((a, b) => b.createdAt - a.createdAt)),
    add: (blob, frame) => tx('readwrite', (s) => s.add({ blob, frame, createdAt: Date.now() })),
    remove: (id) => tx('readwrite', (s) => s.delete(id))
  };
})();
