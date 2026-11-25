'use strict';
/* ===== Kristal istemcisi (Forevye Mağaza'dan taşındı: yalnızca abonelikler + Astrophoto Cam) =====
   Kristal ayrı sunucudadır (Cloudflare Worker + D1, hava reposundaki worker/index.js; adres: config.js → KRISTAL_API_BASE).
   Bakiye, fiyat, günlük ödül, satın alma ve kodlar sunucuda; burası yalnızca ister ve gösterir (tarayıcıdaki sayıyı değiştirmek hiçbir şeyi değiştirmez).
   Kristal hesabı (Site ID + gizli anahtar, localStorage) Nexus Pass girişinden bağımsızdır. Kimlik başlıkla gider, çerez yok.
   Mantar Pano (Pro / Sınırsız) ve Zamanlayıcı (Plus / Premium) kodları kristalle alınır; Astrophoto Cam paketleri mail talebiyle teslim edilir. */
(function () {
  var P = window.NEXUS_PASS_CONFIG || {};
  var CFG = {
    mail: ['mustafahakansunum', 'gmail.com'],   // parçalı yazılır (botlar toplamasın)
    app: 'Astrophoto Cam',
    seenKey: 'mk_kristal2_seen', key: 'mk_kristal2',   // Mağaza ile aynı anahtarlar: aynı alan adında eski hesap kendiliğinden bulunur
    owner: 'llbha0uxr6'                                 // gizli kelimenin özeti: sadece yönetici bölümünü AÇAR, yetki vermez (yetki sunucuda ADMIN_TOKEN)
  };
  var SCFG = { daily: 30, streak: { every: 7, bonus: 60 }, packs: [{ name: '3 Günlük Paket', short: '3 günlük', cost: 500 }, { name: '7 Günlük Paket (Haftalık)', short: '7 günlük', cost: 1000 }], mantar: { days: 7, tiers: [{ id: 'pro', name: 'Mantar Pano Pro', short: 'Pro', cost: 120 }, { id: 'unl', name: 'Mantar Pano Sınırsız', short: 'Sınırsız', cost: 250 }] },
    zaman: { tiers: [{ id: 'plus', name: 'Zamanlayıcı Plus', short: 'Plus' }, { id: 'premium', name: 'Zamanlayıcı Premium', short: 'Premium' }], plans: [{ tier: 'plus', days: 3, cost: 100 }, { tier: 'plus', days: 7, cost: 200 }, { tier: 'premium', days: 3, cost: 250 }, { tier: 'premium', days: 7, cost: 500 }], save7: { plus: 14, premium: 14 } },
    retro: { tiers: [{ id: 'premium', name: 'Retro Camera Premium', short: 'Premium' }], plans: [], save7: {} } };
  var S = blank(), creds = null, todayS = '', offline = false, busy = false, lastSync = 0, reinit = false, listeners = [], ready = null;

  function blank() { return { id: '--------', bal: 0, earned: 0, gift: 0, spent: 0, days: 0, first: '', last: '', cam: '', pending: '', reqs: [], codes: [], passes: [], zpasses: [], rpasses: [], streak: { n: 0, best: 0, shield: 0, paid: 0, last: '' } }; }
  function norm(s) {
    var b = blank(); for (var k in b) if (s && s[k] !== undefined && s[k] !== null) b[k] = s[k];
    ['reqs', 'codes', 'passes', 'zpasses', 'rpasses'].forEach(function (k) { if (!Array.isArray(b[k])) b[k] = []; });
    if (!b.streak || typeof b.streak !== 'object') b.streak = blank().streak;
    return b;
  }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  /* ===== Yerel kayıt: yalnızca kimlik + son bilinen durum (çevrimdışı gösterim için) ===== */
  function loadLocal() {
    try {
      var o = JSON.parse(localStorage.getItem(CFG.key));
      if (o && /^\d{8}$/.test(String(o.id)) && /^[A-Za-z0-9_-]{20,64}$/.test(String(o.token))) {
        creds = { id: String(o.id), token: String(o.token) };
        if (o.cache && o.cache.s) { S = norm(o.cache.s); if (o.cache.cfg) SCFG = o.cache.cfg; }
      }
    } catch (e) {}
  }
  function saveLocal(cfg) { if (creds) try { localStorage.setItem(CFG.key, JSON.stringify({ id: creds.id, token: creds.token, cache: { s: S, cfg: cfg || SCFG } })); } catch (e) {} }

  /* ===== Sunucu ===== */
  function api(path, body, admin) {
    var h = { 'Content-Type': 'application/json' };
    if (creds) h.Authorization = 'Bearer ' + creds.id + '.' + creds.token;
    if (admin) h['X-MK-Admin'] = admin;
    return fetch(String(P.KRISTAL_API_BASE || '').replace(/\/+$/, '') + '/api' + path, { method: 'POST', headers: h, body: JSON.stringify(body || {}), cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.err || 'Sunucu hatası'); e.status = r.status; e.data = d; throw e; }
        return d;
      });
    }, function () { var e = new Error('Kristal sunucusuna ulaşılamadı. İnterneti kontrol et.'); e.net = true; throw e; });
  }
  function apply(d) {
    if (d.id && d.token) creds = { id: d.id, token: d.token };
    if (d.s) S = norm(d.s);
    if (d.cfg) SCFG = d.cfg;
    if (d.today) todayS = d.today;
    offline = false; saveLocal(d.cfg);
    if (d.streakBonus > 0) setTimeout(function () { toast('Seri ödülü: +' + d.streakBonus + ' kristal!'); }, 600);
    emit();
  }
  function sync() {
    if (busy) return Promise.resolve();
    busy = true; lastSync = Date.now();
    return api(creds ? '/sync' : '/init', {}).then(apply, function (e) {
      if (e.status === 401 && creds && !reinit) {      // kimlik sunucuda yok: eskisini yedekle, yeni hesap aç
        reinit = true;
        try { localStorage.setItem(CFG.key + '_old', localStorage.getItem(CFG.key) || ''); } catch (x) {}
        creds = null; S = blank(); busy = false;
        setTimeout(function () { toast('Hesabın sunucuda bulunamadı, yeni hesap açılıyor. Eskisini Hesap sayfasından geri yükleyebilirsin.'); }, 400);
        return sync();
      }
      if (e.net || !e.status) offline = true; else if (e.status === 429) toast(e.message);
      emit();
    }).then(function () { busy = false; }, function () { busy = false; });
  }

  /* ===== Hesap: eski hesabı geri yükleme, taşıma bağlantısı (#hesap=ID.ANAHTAR), yedek ===== */
  function oldCreds() {
    try {
      var o = JSON.parse(localStorage.getItem(CFG.key + '_old'));
      if (o && /^\d{8}$/.test(String(o.id)) && /^[A-Za-z0-9_-]{20,64}$/.test(String(o.token)) && (!creds || creds.id !== String(o.id))) return { id: String(o.id), token: String(o.token) };
    } catch (e) {}
    return null;
  }
  function restoreOld() {
    var o = oldCreds(); if (!o) return;
    if (!confirm('Şu anki hesabın (ID ' + S.id + ') yerine önceki hesabın (ID ' + o.id + ') yüklensin mi? Şu anki hesabın anahtarı silinir; yeni hesapta kristal biriktirdiysen kaybolur.')) return;
    var cur = creds; creds = o;
    api('/sync').then(function (d) { try { localStorage.removeItem(CFG.key + '_old'); } catch (x) {} apply(d); toast('Önceki hesap yüklendi. Bakiye: ' + S.bal); },
      function (e) { creds = cur; toast(e.status === 401 ? 'Önceki hesap sunucuda da bulunamadı.' : e.message); });
  }
  function seenIds() { try { var a = JSON.parse(localStorage.getItem(CFG.seenKey)); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function markSeen(id) { var a = seenIds(); if (a.indexOf(id) < 0) { a.push(id); try { localStorage.setItem(CFG.seenKey, JSON.stringify(a.slice(-20))); } catch (e) {} } }
  /* Sunucuya sormadan kimliği değiştirmez: önce o hesap gerçekten var mı diye /sync ile dener, olmazsa eskisine döner. */
  function adopt(c, quiet) {
    var cur = creds, curRaw = ''; try { curRaw = localStorage.getItem(CFG.key) || ''; } catch (e) {}
    creds = c;
    return api('/sync').then(function (d) {
      if (cur && cur.id !== c.id && curRaw) { try { localStorage.setItem(CFG.key + '_old', curRaw); } catch (e) {} }
      markSeen(c.id); apply(d); if (!quiet) toast('Hesap yüklendi. Bakiye: ' + S.bal); return true;
    }, function (e) { creds = cur; toast(e.status === 401 ? 'Bu hesap sunucuda bulunamadı.' : e.message); if (!cur) sync(); return false; });
  }
  function handoff() {
    if (!/(^#|&)hesap=/.test(location.hash)) return false;
    var c = window.MKHesap && MKHesap.parseHash(location.hash);
    try { history.replaceState(null, '', location.pathname + location.search + '#home'); } catch (e) {}   // anahtar adres çubuğunda ve geçmişte kalmasın
    if (!c) { toast('Hesap bağlantısı bozuk, kopyalanırken kesilmiş olabilir.'); return false; }
    if (creds && creds.id === c.id) { markSeen(c.id); return false; }
    if (seenIds().indexOf(c.id) >= 0) return false;      // bu hesap daha önce taşınmış: tekrar sorma
    if (creds && !confirm('Bağlantıdaki kristal hesabı (ID ' + c.id + ') yüklensin mi? Şu anki hesabın (ID ' + creds.id + (S.bal > 0 ? ', ' + S.bal + ' kristal' : '') + ') silinmez, "Önceki hesabımı geri yükle" ile dönebilirsin.')) { markSeen(c.id); return false; }
    return adopt(c);
  }
  function backupCopy() {
    if (!creds) return toast('Henüz hesap yok.');
    copy(MKHesap.makeBackup(creds), 'Hesap yedeği kopyalandı. Bu metni kimseyle paylaşma: hesabı açar.');
  }
  function backupLoad(text) {
    var c = MKHesap.parseBackup(text);
    if (!c) { toast('Yedek metni tanınmadı. Hava uygulamasındaki ya da Mağaza\'daki yedeği olduğu gibi yapıştır.'); return Promise.resolve(false); }
    if (creds && creds.id === c.id) { toast('Bu hesap zaten yüklü.'); return Promise.resolve(false); }
    if (!confirm('ID ' + c.id + ' hesabı yüklensin mi? Şu anki hesabın silinmez, geri yükleyebilirsin.')) return Promise.resolve(false);
    return adopt(c);
  }

  /* ===== Küçük bildirim, kopyalama ===== */
  var toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 3800);
  }
  function copy(txt, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast(okMsg); }, function () { prompt('Elle kopyala:', txt); });
    else prompt('Elle kopyala:', txt);
  }

  /* ===== Kodlar ===== */
  function normCode(v) { return String(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function fmtCode(c) { c = String(c || ''); return c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8); }
  function fmtDate(sec) { try { return new Date(sec * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }
  function passState(p) {
    if (!p.used) return { text: 'Hazır · henüz kullanılmadı', cls: 'new' };
    var left = p.exp - Math.floor(Date.now() / 1000);
    return left > 0 ? { text: 'Aktif · ' + fmtDate(p.exp) + ' tarihine kadar', cls: 'on' } : { text: 'Süresi doldu', cls: 'old' };
  }
  function mantarCfg() { return (SCFG && SCFG.mantar && SCFG.mantar.tiers) ? SCFG.mantar : { days: 7, tiers: [] }; }
  function zamanCfg() { return (SCFG && SCFG.zaman && SCFG.zaman.plans) ? SCFG.zaman : { tiers: [], plans: [], save7: {} }; }
  function retroCfg() { return (SCFG && SCFG.retro && SCFG.retro.plans) ? SCFG.retro : { tiers: [], plans: [], save7: {} }; }
  function rTier(id) { return retroCfg().tiers.filter(function (x) { return x.id === id; })[0]; }
  function rPlanOf(tier, days) { return retroCfg().plans.filter(function (x) { return x.tier === tier && x.days === days; })[0]; }
  function rSave(tier) {
    var v = retroCfg().save7 && retroCfg().save7[tier]; if (typeof v === 'number') return v;
    var a = rPlanOf(tier, 3), b = rPlanOf(tier, 7); return a && b ? Math.round((1 - b.cost / (a.cost * 7 / 3)) * 100) : 0;
  }
  function zTier(id) { return zamanCfg().tiers.filter(function (x) { return x.id === id; })[0]; }
  function mTier(id) { return mantarCfg().tiers.filter(function (x) { return x.id === id; })[0]; }
  function zPlanOf(tier, days) { return zamanCfg().plans.filter(function (x) { return x.tier === tier && x.days === days; })[0]; }
  /* 7 günlük paketin, 3 günlük fiyatla günlük hesaplanınca yüzde kaç ucuz olduğu (sunucu hesaplar; yoksa burada hesaplanır) */
  function zSave(tier) {
    var v = zamanCfg().save7 && zamanCfg().save7[tier]; if (typeof v === 'number') return v;
    var a = zPlanOf(tier, 3), b = zPlanOf(tier, 7); return a && b ? Math.round((1 - b.cost / (a.cost * 7 / 3)) * 100) : 0;
  }
  function daysToAfford(need) { return Math.ceil(need / (SCFG.daily || 30)); }

  /* ===== Satın alma (hepsi sunucuda; hata olursa dönen güncel durum da uygulanır) ===== */
  function spend(path, body) {
    return api(path, body).then(function (d) { apply(d); return d; }, function (e) { if (e.data && e.data.s) apply(e.data); throw e; });
  }
  var buyPack = function (i, cam) { return spend('/buy', { pack: i, cam: String(cam || '').slice(0, 60) }); };
  var buyMantar = function (tier) { return spend('/pass/buy', { tier: tier }); };
  var buyZaman = function (tier, days) { return spend('/zpass/buy', { tier: tier, days: days }); };
  var buyRetro = function (tier, days) { return spend('/rpass/buy', { tier: tier, days: days }); };
  var mailDone = function () { return api('/mail-done').then(apply); };

  /* ===== Astrophoto Cam: mail talebi ===== */
  function mailAddr() { return CFG.mail.join('@'); }
  function mailSubject(r) { return 'Aktivasyon Kodu Talebi - ' + CFG.app + ' (' + r.pack + ') #' + r.no; }
  function mailBody(r) {
    return ['Merhaba,', '', "Forevye Mağaza'daki ID'm: " + S.id, 'Mağazadan ' + r.cost + ' kristal harcayarak ' + r.pack + ' ' + CFG.app + ' aktivasyon hakkı aldım.', CFG.app + " ID'm: " + r.cam, '',
      'Talep no: ' + r.no, 'Talep zamanı: ' + r.t, 'Giriş günü: ' + S.days + ' (giriş ödülü ' + S.earned + ', hediye ' + S.gift + ', harcanan ' + S.spent + ', kalan ' + S.bal + ')', '',
      'Talep sunucuda kayıtlıdır; numarayı kontrol edip aktivasyon kodumu gönderebilir misiniz? Gerekirse ekran görüntüsünü bu maile ekleyeceğim.'].join('\r\n');
  }
  var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  function openGmail(r) {
    var u = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(mailAddr()) + '&su=' + encodeURIComponent(mailSubject(r)) + '&body=' + encodeURIComponent(mailBody(r).replace(/\r\n/g, '\n'));
    if (!window.open(u, '_blank', 'noopener')) location.href = u;
  }
  function openMail(r) {
    if (!isMobile) return openGmail(r);       // bilgisayarda mailto çoğu zaman sessizce hiçbir şey yapmaz
    location.href = 'mailto:' + mailAddr() + '?subject=' + encodeURIComponent(mailSubject(r)) + '&body=' + encodeURIComponent(mailBody(r));
  }
  function mailCopy(r) { copy('Alıcı: ' + mailAddr() + '\nKonu: ' + mailSubject(r) + '\n\n' + mailBody(r).replace(/\r\n/g, '\n'), 'Mail metni kopyalandı.'); }
  function pendingReq() { for (var i = 0; i < S.reqs.length; i++) if (S.reqs[i].no === S.pending) return S.reqs[i]; return null; }

  /* ===== Yönetici (yalnızca kod üretme ve talep doğrulama; yetki sunucudaki ADMIN_TOKEN'dadır) ===== */
  function h53n(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  var isOwnerWord = function (v) { return h53n('mk|' + String(v).trim().toLocaleLowerCase('tr').replace(/ı/g, 'i')).toString(36) === CFG.owner; };
  var admin = {
    passMake: function (k, tier, days) { return api('/admin/pass', { tier: tier, days: days }, k); },
    passList: function (k) { return api('/admin/passes', {}, k); },
    zMake: function (k, tier, days) { return api('/admin/zpass', { tier: tier, days: days }, k); },
    zList: function (k) { return api('/admin/zpasses', {}, k); },
    rMake: function (k, tier, days) { return api('/admin/rpass', { tier: tier, days: days }, k); },
    rList: function (k) { return api('/admin/rpasses', {}, k); },
    verify: function (k, text) { return api('/admin/verify', { text: text }, k); },
    done: function (k, no) { return api('/admin/done', { no: no }, k); }
  };

  function start() {
    loadLocal(); if (creds) markSeen(creds.id);
    emit();
    const hand = handoff(); ready = hand && typeof hand.then === 'function' ? hand : (hand ? Promise.resolve() : (P.KRS_LINK_ONLY && !creds ? Promise.resolve() : sync())); lastSync = Date.now();
    addEventListener('hashchange', function () { if (/(^#|&)hesap=/.test(location.hash)) handoff(); });
    document.addEventListener('visibilitychange', function () { if (creds && document.visibilityState === 'visible' && Date.now() - lastSync > 60000) sync(); });   // gün değişiminden sonra açılırsa ödül ver
    return ready;
  }

  window.KR = {
    start: start, onChange: function (f) { listeners.push(f); }, ready: function () { return ready || Promise.resolve(); },
    S: function () { return S; }, cfg: function () { return SCFG; }, creds: function () { return creds; }, offline: function () { return offline; }, today: function () { return todayS; },
    mantarCfg: mantarCfg, zamanCfg: zamanCfg, retroCfg: retroCfg, mTier: mTier, zTier: zTier, rTier: rTier, zPlanOf: zPlanOf, rPlanOf: rPlanOf, zSave: zSave, rSave: rSave, daysToAfford: daysToAfford,
    buyPack: buyPack, buyMantar: buyMantar, buyZaman: buyZaman, buyRetro: buyRetro, mailDone: mailDone,
    pendingReq: pendingReq, mailAddr: mailAddr, openMail: openMail, openGmail: openGmail, mailCopy: mailCopy,
    passState: passState, fmtCode: fmtCode, normCode: normCode, copy: copy, toast: toast,
    oldCreds: oldCreds, restoreOld: restoreOld, backupCopy: backupCopy, backupLoad: backupLoad,
    appUrl: function (kind, code) { var u = String(({ mantar: P.MANTAR_URL, zaman: P.ZAMAN_URL, retro: P.RETRO_URL })[kind] || ''); return /^https:\/\//.test(u) && code ? u.replace(/#.*$/, '') + '#kod=' + encodeURIComponent(fmtCode(code)) : ''; },
    isOwnerWord: isOwnerWord, admin: admin, app: CFG.app, sync: sync
  };
})();
