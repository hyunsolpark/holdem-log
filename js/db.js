// IndexedDB 얇은 래퍼
const DB_NAME = 'holdem-log';
const DB_VERSION = 1;
export const STORES = ['sessions', 'tickets', 'hands', 'venues', 'ledger', 'settings'];
const RECORDS = ['sessions', 'tickets', 'hands', 'ledger'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const mk = (name, indexes = [], keyPath = 'id') => {
        if (db.objectStoreNames.contains(name)) return;
        const s = db.createObjectStore(name, { keyPath });
        indexes.forEach((i) => s.createIndex(i, i));
      };
      mk('sessions', ['date', 'status', 'venueId']);
      mk('tickets', ['status', 'sourceSessionId']);
      mk('hands', ['sessionId', 'date', 'review']);
      mk('venues');
      mk('ledger', ['date']);
      mk('settings', [], 'key');
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export const reqP = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const txDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('트랜잭션이 중단되었습니다'));
});

export async function getAll(name) {
  const db = await openDB();
  return reqP(db.transaction(name).objectStore(name).getAll());
}

/** ops: [{ store, put?: obj | obj[], del?: key | key[] }] — 한 트랜잭션 */
export async function write(ops) {
  const names = [...new Set(ops.map((o) => o.store))];
  const db = await openDB();
  const tx = db.transaction(names, 'readwrite');
  for (const op of ops) {
    const s = tx.objectStore(op.store);
    if (op.put) [].concat(op.put).forEach((v) => s.put(v));
    if (op.del != null) [].concat(op.del).forEach((k) => s.delete(k));
  }
  await txDone(tx);
}

export async function dumpAll() {
  const out = {};
  for (const n of STORES) out[n] = await getAll(n);
  const settings = Object.fromEntries(out.settings.map((r) => [r.key, r.value]));
  delete out.settings;
  return { ...out, settings };
}

/**
 * 가져오기 (한 트랜잭션, 실패 시 전체 롤백)
 * 병합: 같은 id 건너뜀, 이름이 같은 플랫폼·장소는 기존으로 연결
 */
export async function importData(data, mode) {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  const done = txDone(tx);
  const st = Object.fromEntries(STORES.map((n) => [n, tx.objectStore(n)]));
  const result = { sessions: 0, tickets: 0, hands: 0, ledger: 0, venues: 0, skipped: 0 };
  try {
    if (mode === 'overwrite') {
      STORES.forEach((n) => st[n].clear());
      for (const n of [...RECORDS, 'venues']) {
        data[n].forEach((r) => st[n].put(r));
        result[n] = data[n].length;
      }
      Object.entries(data.settings || {}).forEach(([key, value]) => st.settings.put({ key, value }));
    } else {
      const exVenues = await reqP(st.venues.getAll());
      const ids = new Set(exVenues.map((v) => v.id));
      const byName = new Map(exVenues.filter((v) => !v.deleted).map((v) => [v.name, v.id]));
      let maxOrder = exVenues.reduce((m, v) => Math.max(m, v.order ?? 0), -1);
      const vmap = new Map();
      for (const v of data.venues) {
        if (ids.has(v.id)) continue;
        if (byName.has(v.name)) { vmap.set(v.id, byName.get(v.name)); continue; }
        st.venues.put({ ...v, order: ++maxOrder });
        ids.add(v.id); byName.set(v.name, v.id);
        result.venues++;
      }
      for (const n of RECORDS) {
        const keys = new Set(await reqP(st[n].getAllKeys()));
        for (const r of data[n]) {
          if (keys.has(r.id)) { result.skipped++; continue; }
          const row = n === 'sessions' && vmap.has(r.venueId) ? { ...r, venueId: vmap.get(r.venueId) } : r;
          st[n].put(row);
          keys.add(r.id);
          result[n]++;
        }
      }
      // 핸드 태그 목록은 합친다
      const cur = await reqP(st.settings.get('handTags'));
      const merged = [...new Set([...(cur?.value ?? []), ...(data.settings?.handTags ?? [])])];
      st.settings.put({ key: 'handTags', value: merged });
    }
  } catch (e) {
    try { tx.abort(); } catch { /* 이미 종료 */ }
    await done.catch(() => {});
    throw e;
  }
  await done;
  return result;
}
