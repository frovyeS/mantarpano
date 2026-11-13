// Premium mantığı: kod bozdurma, süre, plan sınırları, imza doğrulama, pano listesi. DOM gerekmez.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { normalizeCode, planFrom, parseServerReply, createEntitlements, verifyToken, loadBoards, newBoard, boardUsable, sanitizeSettings, sanitizeThreadStyle, timeLeftText, PLANS, THEMES } from '../premium.js';

const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
const reply = (json, status = 200) => async () => ({ status, json: async () => json });
const mk = (o = {}) => { const t = { now: 1_000_000_000_000 }; const storage = o.storage || mem();
  const ent = createEntitlements({ storage, fetchImpl: o.fetchImpl, now: () => t.now, config: { apiBase: 'https://x.test', ...(o.config || {}) }, subtle: webcrypto.subtle }); return { ent, t, storage }; };
const DAY = 864e5;

test('kod normalizasyonu: boşluk, küçük harf, Türkçe İ/ı, uzun tire', () => {
  assert.equal(normalizeCode(' mp-pro–ab12 cd34 '), 'MP-PRO-AB12CD34'); assert.equal(normalizeCode('ıi-İ'), 'II-I'); assert.equal(normalizeCode(null), '');
});
test('plan adı: pro / sınırsız / unlimited varyantları', () => {
  assert.equal(planFrom('PRO'), 'pro'); assert.equal(planFrom('Sınırsız'), 'unlimited'); assert.equal(planFrom('mantarpano_unlimited'), 'unlimited'); assert.equal(planFrom('x'), null);
});
test('sunucu yanıtı: farklı alan adları, saniye/ms, gün süresi', () => {
  const n = 1.7e12;
  assert.deepEqual(parseServerReply(200, { ok: true, plan: 'pro', expiresAt: n + DAY }, n), { ok: true, plan: 'pro', exp: n + DAY, token: null });
  assert.equal(parseServerReply(200, { success: true, tier: 'sinirsiz', exp: (n + DAY) / 1000 }, n).exp, n + DAY);
  assert.equal(parseServerReply(200, { valid: true, package: 'pro', days: 7 }, n).exp, n + 7 * DAY);
  assert.match(parseServerReply(200, { ok: true, plan: 'pro', app: 'astrophotocam', days: 7 }, n).error, /Mantar Pano için değil/);
  assert.match(parseServerReply(400, { ok: false, error: 'used' }, n).error, /başka bir cihaz/);
  assert.equal(parseServerReply(200, { ok: true, plan: 'pro', expiresAt: n - 1 }, n).ok, false);
  assert.equal(parseServerReply(200, 'x', n).ok, false); assert.equal(parseServerReply(200, { ok: true, days: 7 }, n).ok, false);
});
test('kod bozdurma: plan açılır, depolanır, yeniden başlatınca korunur', async () => {
  let sent; const { ent, t, storage } = mk({ fetchImpl: async (u, o) => { sent = { u, b: JSON.parse(o.body) }; return { status: 200, json: async () => ({ ok: true, plan: 'pro', days: 7 }) }; } });
  assert.equal(ent.plan(), 'free');
  const r = await ent.redeem('mp pro 1234'); assert.equal(r.ok, true); assert.equal(ent.plan(), 'pro'); assert.ok(ent.has('pro')); assert.ok(!ent.has('unlimited'));
  assert.equal(sent.u, 'https://x.test/api/mantarpano/redeem'); assert.equal(sent.b.app, 'mantarpano'); assert.equal(sent.b.code, 'MPPRO1234'); assert.ok(sent.b.device);
  assert.equal(ent.limit('boards'), 3);
  const again = createEntitlements({ storage, now: () => t.now, config: { apiBase: 'x' } }); await again.init(); assert.equal(again.plan(), 'pro');
});
test('süre dolunca ücretsize döner; saat geri alınsa bile geri gelmez', async () => {
  const { ent, t } = mk({ fetchImpl: reply({ ok: true, plan: 'unlimited', days: 7 }) }); await ent.redeem('ABCDEF');
  assert.equal(ent.plan(), 'unlimited'); assert.equal(ent.limit('boards'), Infinity);
  t.now += 8 * DAY; ent.tick(); assert.equal(ent.plan(), 'free');
  t.now -= 8 * DAY; assert.equal(ent.plan(), 'free');
});
test('saat geri alınarak kalan süre uzatılamaz', async () => {
  const { ent, t } = mk({ fetchImpl: reply({ ok: true, plan: 'pro', days: 7 }) }); await ent.redeem('ABCDEF');
  t.now += 6 * DAY; ent.tick(); t.now -= 5 * DAY;
  assert.ok(ent.left() <= DAY + 1000, 'saat geri alınsa da kalan süre 1 günü geçmez');
});
test('hatalar: ağ yok, sunucu ayarsız, kısa kod, yanlış kod', async () => {
  assert.equal((await mk({ fetchImpl: async () => { throw new Error('x'); } }).ent.redeem('ABCDEF')).network, true);
  assert.match((await mk({ config: { apiBase: '' } }).ent.redeem('ABCDEF')).error, /API_BASE/);
  assert.match((await mk({ fetchImpl: reply({}) }).ent.redeem('AB')).error, /kısa/);
  const w = mk({ fetchImpl: reply({ ok: false, error: 'invalid_code' }, 404) }); assert.match((await w.ent.redeem('ABCDEF')).error, /geçersiz/); assert.equal(w.ent.plan(), 'free');
});
test('paketler: düşük kod yüksek planı ezmez, aynı paket süre ekler, yükseltme çalışır', async () => {
  let plan = 'unlimited'; const { ent, t } = mk({ fetchImpl: async () => ({ status: 200, json: async () => ({ ok: true, plan, days: 7 }) }) });
  await ent.redeem('ABCDEF'); plan = 'pro'; assert.equal((await ent.redeem('GHIJKL')).ok, false); assert.equal(ent.plan(), 'unlimited');
  const b = mk({ fetchImpl: reply({ ok: true, plan: 'pro', days: 7 }) }); await b.ent.redeem('AAAAAA'); b.t.now += 3 * DAY; await b.ent.redeem('BBBBBB');
  assert.ok(b.ent.left() > 10.9 * DAY && b.ent.left() <= 11 * DAY, 'kalan 4 gün + 7 gün');
  const c = mk({ fetchImpl: reply({ ok: true, plan: 'pro', days: 7 }) }); await c.ent.redeem('AAAAAA'); assert.equal(c.ent.plan(), 'pro');
});
test('bozuk/değiştirilmiş depolama yok sayılır', async () => {
  const s = mem(); s.setItem('mantar-ent', JSON.stringify({ plan: 'godmode', exp: 9e15 })); const e = createEntitlements({ storage: s, config: {} }); await e.init(); assert.equal(e.plan(), 'free');
  s.setItem('mantar-ent', '{bozuk'); await e.init(); assert.equal(e.plan(), 'free');
});
test('imza doğrulama (ECDSA P-256): doğru imza geçer, sahte/başka cihaz reddedilir', async () => {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', kp.publicKey), b64 = u => Buffer.from(u).toString('base64url');
  const sign = async pay => { const p = b64(JSON.stringify(pay)); return p + '.' + b64(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(p))); };
  const now = 1e12, tok = await sign({ app: 'mantarpano', plan: 'pro', exp: now + 7 * DAY });
  const { ent, storage } = mk({ config: { publicKey: jwk }, fetchImpl: async () => ({ status: 200, json: async () => ({ ok: true, plan: 'unlimited', days: 99, token: tok }) }) });
  const r = await ent.redeem('ABCDEF'); assert.equal(r.ok, true); assert.equal(ent.plan(), 'pro', 'plan/süre imzadaki değerdir, JSON\'daki değil');
  const st = JSON.parse(storage.getItem('mantar-ent')); st.plan = 'unlimited'; storage.setItem('mantar-ent', JSON.stringify(st));
  const e2 = createEntitlements({ storage, now: () => now, config: { publicKey: jwk }, subtle: webcrypto.subtle }); await e2.init(); assert.equal(e2.plan(), 'pro', 'depolamayı elle değiştirmek işe yaramaz');
  assert.equal(await verifyToken(tok.slice(0, -4) + 'AAAA', jwk, 'd'), null);
  assert.equal(await verifyToken(await sign({ app: 'mantarpano', plan: 'pro', exp: now + DAY, dev: 'baska' }), jwk, 'ben'), null);
  assert.equal(await verifyToken(await sign({ app: 'astro', plan: 'pro', exp: now + DAY }), jwk, 'd'), null);
  const noTok = mk({ config: { publicKey: jwk }, fetchImpl: reply({ ok: true, plan: 'pro', days: 7 }) }); assert.equal((await noTok.ent.redeem('ABCDEF')).ok, false);
});
test('iptal kontrolü (refresh): geçersiz denirse plan kapanır, ağ hatasında korunur', async () => {
  let mode = 'ok'; const { ent } = mk({ config: { verifyPath: '/v' }, fetchImpl: async () => { if (mode === 'net') throw new Error('x'); return { status: 200, json: async () => mode === 'ok' ? { ok: true, plan: 'pro', days: 5 } : { ok: false, error: 'revoked' } }; } });
  await ent.redeem('ABCDEF'); mode = 'net'; await ent.refresh(); assert.equal(ent.plan(), 'pro'); mode = 'bad'; await ent.refresh(); assert.equal(ent.plan(), 'free');
});
test('pano listesi: bozuk veri onarılır, ana pano hep var, kullanılabilirlik plana bağlı', () => {
  const s = mem(); assert.deepEqual(loadBoards(s), { list: [{ id: 'main', name: 'Pano 1', key: 'mantar-pano-v2' }], active: 'main' });
  s.setItem('mantar-boards', JSON.stringify({ active: 'zzz', list: [{ id: 'main', name: 'Benim' }, { id: 'b1x2y', name: '<b>Ders</b>', key: 'mantar-pano-b-b1x2y' }, { id: '../x', key: 'evil' }, { id: 'abc', key: 'baska-anahtar' }, null] }));
  const b = loadBoards(s); assert.equal(b.list.length, 2); assert.equal(b.list[0].name, 'Benim'); assert.equal(b.list[1].name, 'bDers/b'); assert.equal(b.active, 'main');
  assert.equal(newBoard(b.list, '').name, 'Pano 3');
  assert.ok(boardUsable(0, 'free') && !boardUsable(1, 'free') && boardUsable(2, 'pro') && !boardUsable(3, 'pro') && boardUsable(500, 'unlimited'));
});
test('ayar ve ip stili doğrulama', () => {
  assert.deepEqual(sanitizeSettings({ theme: 'galaxy', pin: 'x' }), { theme: 'galaxy', pin: 'classic' }); assert.deepEqual(sanitizeSettings(5), { theme: 'classic', pin: 'classic' });
  assert.equal(sanitizeThreadStyle('neon'), 'neon'); assert.equal(sanitizeThreadStyle('<x>'), 'classic');
  assert.equal(THEMES.filter(t => t.min === 'pro').length, 5); assert.equal(PLANS.pro.crystals, 120); assert.equal(PLANS.unlimited.crystals, 250);
});
test('süre metni', () => { assert.equal(timeLeftText(0), 'süresi doldu'); assert.equal(timeLeftText(5 * 36e5), '5 saat kaldı'); assert.equal(timeLeftText(2.2 * DAY), '3 gün kaldı'); });
