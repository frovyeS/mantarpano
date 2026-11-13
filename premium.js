// Mantar Pano · Premium (Pro / Sınırsız). Saf mantık: DOM'a dokunmaz, testler Node'da çalışır.
// Kodlar Mikro-Klima sunucusunda (Worker) üretilir; burada yalnızca kod bozdurma, süre ve yetki kontrolü vardır.
export const APP_ID = 'mantarpano';
export const PLAN_ORDER = ['free', 'pro', 'unlimited'];
export const PLANS = {
  free: { name: 'Ücretsiz', boards: 1, history: 30 },
  pro: { name: 'Pro', boards: 3, history: 60, crystals: 120, days: 7 },
  unlimited: { name: 'Sınırsız', boards: Infinity, history: 100, crystals: 250, days: 7 }
};
export const rank = p => Math.max(0, PLAN_ORDER.indexOf(p));

// outer: panonun dışındaki zemin. Renk/doku CSS'te ([data-theme=…]) tanımlı.
export const THEMES = [
  { id: 'classic', name: 'Klasik mantar', min: 'free', outer: '#3a2a1c', sw: ['#c99a68', '#9b6e44'] },
  { id: 'walnut', name: 'Ceviz', min: 'pro', outer: '#1e140c', sw: ['#80573a', '#4d3320'] },
  { id: 'chalk', name: 'Kara tahta', min: 'pro', outer: '#2b1d10', sw: ['#2f4338', '#1d2a23'] },
  { id: 'blueprint', name: 'Mavi plan', min: 'pro', outer: '#08203f', sw: ['#1f5fa8', '#123e75'] },
  { id: 'linen', name: 'Keten', min: 'pro', outer: '#4a3b27', sw: ['#e6dcc2', '#c9bb98'] },
  { id: 'midnight', name: 'Gece', min: 'pro', outer: '#030304', sw: ['#1b1e2b', '#0b0c12'] },
  { id: 'velvet', name: 'Bordo kadife', min: 'unlimited', outer: '#2a0710', sw: ['#7d1b30', '#3f0c18'] },
  { id: 'galaxy', name: 'Galaksi', min: 'unlimited', outer: '#05040f', sw: ['#6b3bc0', '#0b0a1f'] }
];
export const PINS = [
  { id: 'classic', name: 'Kırmızı', min: 'free', sw: ['#ff8a8a', '#b00'] },
  { id: 'gold', name: 'Altın', min: 'pro', sw: ['#fff3b0', '#d4a017'] },
  { id: 'sapphire', name: 'Safir', min: 'pro', sw: ['#bfe0ff', '#1f6fd1'] },
  { id: 'emerald', name: 'Zümrüt', min: 'pro', sw: ['#c8ffd9', '#1f9d55'] },
  { id: 'black', name: 'Siyah', min: 'pro', sw: ['#888', '#222'] },
  { id: 'pearl', name: 'İnci', min: 'pro', sw: ['#fff', '#cfc7b4'] }
];
export const THREAD_STYLES = [
  { id: 'classic', name: 'Düz', min: 'free' }, { id: 'rope', name: 'Halat', min: 'pro' },
  { id: 'dashed', name: 'Kesik', min: 'pro' }, { id: 'neon', name: 'Neon', min: 'pro' },
  { id: 'gold', name: 'Altın tel', min: 'unlimited' }
];
const ids = a => a.map(x => x.id);
export const THREAD_IDS = ids(THREAD_STYLES);
export const sanitizeThreadStyle = s => THREAD_IDS.includes(s) ? s : 'classic';
export function sanitizeSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  return { theme: ids(THEMES).includes(s.theme) ? s.theme : 'classic', pin: ids(PINS).includes(s.pin) ? s.pin : 'classic' };
}

/* ---------- Kod ve sunucu yanıtı ---------- */
export function normalizeCode(s) {
  return String(s ?? '').normalize('NFKC').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/İ/g, 'I').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 64);
}
export function planFrom(x) {
  const t = String(x ?? '').toLowerCase().replace(/ı/g, 'i').replace(/[^a-z]/g, '');
  if (/unlimited|sinirsiz|ultra|infinite|^max$/.test(t)) return 'unlimited';
  if (/pro|premium|plus/.test(t)) return 'pro';
  return null;
}
function toMs(v) {
  if (v == null || v === '') return null;
  let n = typeof v === 'number' ? v : /^\d+(\.\d+)?$/.test(String(v).trim()) ? +v : Date.parse(v);
  if (!Number.isFinite(n)) return null;
  return n < 1e12 ? n * 1000 : n;
}
const ERR = {
  invalid_code: 'Kod geçersiz. Yazımı kontrol et.', invalid: 'Kod geçersiz. Yazımı kontrol et.', not_found: 'Kod geçersiz. Yazımı kontrol et.',
  used: 'Bu kod başka bir cihazda kullanılmış.', already_used: 'Bu kod başka bir cihazda kullanılmış.',
  expired: 'Kodun süresi dolmuş.', wrong_app: 'Bu kod Mantar Pano için değil.', rate_limited: 'Çok fazla deneme. Biraz bekleyip tekrar dene.'
};
// Sunucu yanıtı tolerans ile okunur: plan|tier|package, expiresAt|expires_at|exp|until, ya da days|durationDays.
export function parseServerReply(status, json, nowMs) {
  if (!json || typeof json !== 'object') return { ok: false, error: 'Sunucudan beklenmeyen yanıt geldi.' };
  const flag = json.ok === true || json.success === true || json.valid === true || json.status === 'ok';
  if (!flag || status >= 400) return { ok: false, error: ERR[json.error] || ERR[json.code] || String(json.message || (typeof json.error === 'string' ? json.error : '') || 'Kod geçerli değil.').slice(0, 160) };
  const app = json.app ?? json.application;
  if (app && String(app).toLowerCase().replace(/[^a-z]/g, '') !== APP_ID) return { ok: false, error: 'Bu kod Mantar Pano için değil.' };
  const plan = planFrom(json.plan ?? json.tier ?? json.package ?? json.type);
  let exp = toMs(json.expiresAt ?? json.expires_at ?? json.exp ?? json.until ?? json.expiry);
  const days = +(json.days ?? json.durationDays ?? json.duration_days);
  if (!exp && days > 0) exp = nowMs + days * 864e5;
  if (!plan) return { ok: false, error: 'Sunucu paket türünü bildirmedi.' };
  if (!exp || exp <= nowMs) return { ok: false, error: 'Kodun süresi dolmuş.' };
  return { ok: true, plan, exp, token: typeof json.token === 'string' ? json.token : null };
}
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
// İsteğe bağlı sertleştirme: Worker ECDSA P-256 ile imzalar (JWT benzeri "yük.imza"), uygulama açık anahtarla doğrular.
export async function verifyToken(token, jwk, device, subtle = globalThis.crypto?.subtle) {
  try {
    const [p, s] = String(token).split('.'); if (!p || !s || !jwk || !subtle) return null;
    const key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64u(s), new TextEncoder().encode(p))) return null;
    const pay = JSON.parse(new TextDecoder().decode(b64u(p))), plan = planFrom(pay.plan), exp = toMs(pay.exp);
    if (String(pay.app).toLowerCase() !== APP_ID || !plan || !exp) return null;
    if (pay.dev && pay.dev !== device) return null;
    return { plan, exp };
  } catch (_) { return null; }
}
export function timeLeftText(ms) {
  if (ms <= 0) return 'süresi doldu'; const h = Math.ceil(ms / 36e5);
  return h < 24 ? h + ' saat kaldı' : Math.ceil(ms / 864e5) + ' gün kaldı';
}

/* ---------- Yetki durumu ---------- */
const EK = 'mantar-ent', DK = 'mantar-device';
export function createEntitlements({ storage, fetchImpl, now = Date.now, config = {}, subtle } = {}) {
  let st = null; const subs = new Set();
  const emit = r => subs.forEach(f => { try { f(r); } catch (_) {} });
  const eff = () => Math.max(now(), st?.seen || 0);
  const put = () => { try { st ? storage.setItem(EK, JSON.stringify(st)) : storage.removeItem(EK); } catch (_) {} };
  function device() {
    let d = null; try { d = storage.getItem(DK); } catch (_) {}
    if (!d) { d = 'd' + Math.random().toString(36).slice(2, 10) + now().toString(36); try { storage.setItem(DK, d); } catch (_) {} }
    return d;
  }
  async function post(path, body) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), config.timeout || 12000);
    try {
      const r = await fetchImpl(String(config.apiBase).replace(/\/+$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl?.signal });
      return { status: r.status, json: await r.json().catch(() => null) };
    } finally { t && clearTimeout(t); }
  }
  const api = {
    async init() {
      let s = null; try { s = JSON.parse(storage.getItem(EK)); } catch (_) {}
      if (s && PLAN_ORDER.includes(s.plan) && s.plan !== 'free' && Number.isFinite(s.exp)) {
        if (config.publicKey) { const p = await verifyToken(s.token, config.publicKey, device(), subtle); s = p ? { ...s, ...p } : null; }
      } else s = null;
      st = s; if (st) { st.seen = Math.max(st.seen || 0, now()); put(); this.tick(true); }
      emit('init'); return this.plan();
    },
    plan() { return st && st.exp > eff() ? st.plan : 'free'; },
    has(min) { return rank(this.plan()) >= rank(min); },
    limit(k) { return PLANS[this.plan()][k]; },
    left() { return st && st.exp > eff() ? st.exp - eff() : 0; },
    device,
    onChange(f) { subs.add(f); return () => subs.delete(f); },
    tick(quiet) {
      if (!st) return; if (now() > st.seen) { st.seen = now(); put(); }
      if (st.exp <= eff()) { st = null; put(); if (!quiet) emit('expired'); }
    },
    clear() { st = null; put(); emit('clear'); },
    async redeem(raw) {
      const code = normalizeCode(raw);
      if (code.length < 6) return { ok: false, error: 'Kod çok kısa görünüyor.' };
      if (!config.apiBase) return { ok: false, error: 'Sunucu adresi ayarlanmamış (config.js → API_BASE).' };
      let r; try { r = await post(config.redeemPath || '/api/mantarpano/redeem', { code, app: APP_ID, device: device(), v: 1 }); }
      catch (_) { return { ok: false, network: true, error: 'Sunucuya ulaşılamadı. İnternetini kontrol edip tekrar dene.' }; }
      const p = parseServerReply(r.status, r.json, now()); if (!p.ok) return p;
      let { plan, exp, token } = p;
      if (config.publicKey) { const v = await verifyToken(token, config.publicKey, device(), subtle); if (!v) return { ok: false, error: 'Kod doğrulanamadı (imza geçersiz).' }; ({ plan, exp } = v); }
      const cur = this.plan();
      if (rank(plan) < rank(cur)) return { ok: false, error: `Şu an ${PLANS[cur].name} aktif. ${PLANS[plan].name} kodunu o bitince kullan.` };
      if (!config.publicKey && cur === plan && st) exp = st.exp + Math.max(0, exp - now());   // aynı paket: süre eklenir
      st = { plan, exp, code, token: token || null, seen: now() }; put(); emit('redeem');
      return { ok: true, plan, exp };
    },
    async refresh() {   // isteğe bağlı: iptal edilen kodları yakalar (VERIFY_PATH tanımlıysa)
      if (!st || !config.verifyPath || !config.apiBase) return;
      try {
        const r = await post(config.verifyPath, { code: st.code, app: APP_ID, device: device(), v: 1 });
        if (r.json && r.status < 500) { const p = parseServerReply(r.status, r.json, now()); if (p.ok) { st = { ...st, plan: p.plan, exp: p.exp }; put(); emit('refresh'); } else { st = null; put(); emit('revoked'); } }
      } catch (_) {}
    }
  };
  return api;
}

/* ---------- Çoklu pano listesi ---------- */
export const MAIN_KEY = 'mantar-pano-v2', BOARDS_KEY = 'mantar-boards';
export const cleanName = s => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
export function loadBoards(storage) {
  let b = null; try { b = JSON.parse(storage.getItem(BOARDS_KEY)); } catch (_) {}
  let list = Array.isArray(b?.list) ? b.list.filter(x => x && /^[a-z0-9]{3,16}$/.test(x.id) && x.id !== 'main' && x.key === 'mantar-pano-b-' + x.id).map(x => ({ id: x.id, name: cleanName(x.name) || 'Pano', key: x.key })) : [];
  const main = Array.isArray(b?.list) && b.list.find(x => x && x.id === 'main');
  list = [{ id: 'main', name: cleanName(main?.name) || 'Pano 1', key: MAIN_KEY }, ...list];
  return { list, active: list.some(x => x.id === b?.active) ? b.active : 'main' };
}
export function saveBoards(storage, b) { try { storage.setItem(BOARDS_KEY, JSON.stringify(b)); } catch (_) {} }
export function newBoard(list, name) {
  let id; do id = 'b' + Math.random().toString(36).slice(2, 7); while (list.some(x => x.id === id));
  return { id, name: cleanName(name) || 'Pano ' + (list.length + 1), key: 'mantar-pano-b-' + id };
}
export const boardUsable = (index, plan) => index < PLANS[plan].boards;
