// persist.js testleri: sahte IndexedDB ile kayıt, "daha yeni olan kazanır" kuralı ve hata yolları.
import test from 'node:test';
import assert from 'node:assert/strict';

function setup({ idb = 'ok', stored = null } = {}) {
  const ls = new Map(), db = { boards: new Map(stored ? [['k', stored]] : []) };
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
  if (idb === 'missing') delete globalThis.indexedDB;
  else globalThis.indexedDB = { open() {
    const req = {}; setTimeout(() => {
      if (idb === 'open-error') { req.error = Error('açılamadı'); return req.onerror?.(); }
      req.result = { objectStoreNames: { contains: () => true }, createObjectStore() {}, transaction() {
        const tx = {}; tx.objectStore = () => ({
          put(v, k) { setTimeout(() => { if (idb === 'quota') { tx.error = Error('QuotaExceededError'); tx.onabort?.(); } else { db.boards.set(k, v); tx.oncomplete?.(); } }); },
          get(k) { const r = {}; setTimeout(() => { r.result = db.boards.get(k); r.onsuccess?.(); }); return r; } });
        return tx; } };
      req.onsuccess?.(); }); return req; } };
  return { ls, db };
}
let n = 0; const load = () => import('../persist.js?t=' + (++n));   // her testte temiz modül (dbPromise önbelleği sıfırlanır)

test('persistBoard → readBoard: veri kaydedilir ve savedAt eklenir', async () => {
  setup(); const { persistBoard, readBoard } = await load();
  await persistBoard({ html: ['<div class="card"></div>'], threads: [] }, 'k');
  const d = await readBoard('k');
  assert.deepEqual(d.html, ['<div class="card"></div>']); assert.ok(d.savedAt > 0);
});

test('readBoard: yalnızca localStorage varsa onu döndürür', async () => {
  const { ls } = setup(); ls.set('k', JSON.stringify({ html: [], threads: [], savedAt: 5 }));
  const { readBoard } = await load(); assert.equal((await readBoard('k')).savedAt, 5);
});

test('readBoard: iki kaynak da varsa daha yeni savedAt kazanır', async () => {
  for (const [idbAt, lsAt, win] of [[10, 20, 20], [30, 20, 30]]) {
    const { ls } = setup({ stored: { html: [], threads: [], savedAt: idbAt } }); ls.set('k', JSON.stringify({ html: [], threads: [], savedAt: lsAt }));
    const { readBoard } = await load(); assert.equal((await readBoard('k')).savedAt, win);
  }
});

test('readBoard: kayıt yoksa null; bozuk localStorage JSON\'u atlanır', async () => {
  const { ls } = setup(); const { readBoard } = await load(); assert.equal(await readBoard('k'), null);
  ls.set('k', '{bozuk'); assert.equal(await readBoard('k'), null);
});

test('readBoard: IndexedDB yoksa/açılamazsa localStorage ile devam eder', async () => {
  for (const idb of ['missing', 'open-error']) {
    const { ls } = setup({ idb }); ls.set('k', JSON.stringify({ html: [], threads: [], savedAt: 7 }));
    const { readBoard } = await load(); assert.equal((await readBoard('k')).savedAt, 7, idb);
  }
});

test('persistBoard: kota aşımında (transaction abort) söz reddedilir, sessizce takılmaz', async () => {
  setup({ idb: 'quota' }); const { persistBoard } = await load();
  await assert.rejects(Promise.race([persistBoard({ html: [], threads: [] }, 'k'), new Promise((_, r) => setTimeout(() => r(Error('ZAMAN AŞIMI: söz hiç sonuçlanmadı')), 500))]), /Quota/);
});
