/* Hesap taşıma yardımcıları (saf fonksiyonlar, Node'da test edilir).
   Hesap = 8 haneli Site ID + gizli anahtar. Üç yoldan gelebilir:
   1) Hava uygulamasındaki "Mağazayı aç" bağlantısı:  <market>/#hesap=ID.ANAHTAR  (# sonrası sunucuya gitmez)
   2) Yedek metni: {"mk":1,"kr":{"id":"..","token":".."}}  (hava uygulamasının ya da Mağaza'nın yedeği)
   3) Düz metin "ID.ANAHTAR" */
(function (root) {
  var ID_RE = /^\d{8}$/, TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
  function okCreds(id, token) { id = String(id || ''); token = String(token || ''); return ID_RE.test(id) && TOKEN_RE.test(token) ? { id: id, token: token } : null; }
  function fromPair(s) { var m = /^(\d{8})\.([A-Za-z0-9_-]{20,64})$/.exec(String(s || '').trim()); return m ? okCreds(m[1], m[2]) : null; }
  function parseHash(hash) {
    var m = /(?:^#|&)hesap=([^&]+)/.exec(String(hash || ''));
    if (!m) return null;
    try { return fromPair(decodeURIComponent(m[1])); } catch (e) { return null; }
  }
  function parseBackup(text) {
    text = String(text || '').trim();
    if (!text) return null;
    var p = fromPair(text); if (p) return p;
    try {
      var o = JSON.parse(text);
      if (o && o.kr) return okCreds(o.kr.id, o.kr.token);
      if (o && o.id) return okCreds(o.id, o.token);
    } catch (e) {}
    return null;
  }
  function makeBackup(c) { return c ? JSON.stringify({ mk: 1, kr: { id: c.id, token: c.token } }) : ''; }
  var api = { parseHash: parseHash, parseBackup: parseBackup, makeBackup: makeBackup, fromPair: fromPair };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MKHesap = api;
})(typeof window !== 'undefined' ? window : globalThis);
