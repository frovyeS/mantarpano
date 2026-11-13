# Mantar Pano ⇄ Mikro-Klima bağlantısı (Pro / Sınırsız kodları)

Mantar Pano statik bir sayfa; kodlar **Mikro-Klima Worker'ında** üretilir ve doğrulanır. Mantar Pano yalnızca kodu sunucuya gönderir, dönen paketi ve süreyi saklar.
Pro = **120 kristal**, Sınırsız = **250 kristal**, ikisi de **7 gün**. Mevcut tüm pano özellikleri ücretsiz kalır.

## 1) Mantar Pano tarafında yapılacak (tek satır)
`config.js` içinde:
```js
API_BASE: 'https://MIKROKLIMA-WORKER-ADRESIN.workers.dev',   // Worker adresi
STORE_URL: 'https://KULLANICI.github.io/MikroKlimaKontrolMerkezi/',  // isteğe bağlı: Mağaza bağlantısı
```
`REDEEM_PATH` varsayılanı `/api/mantarpano/redeem`. Worker'da farklı yol kullanılıyorsa sadece onu değiştir.

## 2) Sunucu sözleşmesi (Worker bunu sağlamalı)
**İstek:** `POST {API_BASE}{REDEEM_PATH}` · `Content-Type: application/json`
```json
{ "code": "MPPRO8F3K2QX", "app": "mantarpano", "device": "dk3j2h1x9abc", "v": 1 }
```
`code` istemcide büyük harfe çevrilir, boşluk ve işaretlerden arındırılır (tire kalır).

**Başarılı yanıt (200):**
```json
{ "ok": true, "app": "mantarpano", "plan": "pro", "expiresAt": 1767225600000 }
```
- `plan`: `"pro"` veya `"unlimited"` (`"sinirsiz"` de kabul edilir).
- Süre: `expiresAt` (ms ya da saniye; ISO metni de olur) **ya da** `days: 7` (istemci "şimdi + 7 gün" sayar). Mümkünse `expiresAt` ver.
- `app` gönderilirse `"mantarpano"` olmalı; Astrophoto Cam kodları burada reddedilir.
- Aynı kod **aynı `device` ile tekrar** gelirse aynı `expiresAt` dönmeli (idempotent). Başka cihazdan gelirse hata ver.

**Hata yanıtı (4xx):** `{ "ok": false, "error": "invalid_code" | "used" | "expired" | "wrong_app" | "rate_limited" }` (isteğe bağlı `message`). İstemci bunları Türkçe gösterir.

**CORS (şart):** Mantar Pano başka bir adresten çağırdığı için Worker `OPTIONS` isteğine 204 dönmeli ve yanıtlara şunlar eklenmeli:
`Access-Control-Allow-Origin: https://KULLANICI.github.io` · `Access-Control-Allow-Headers: Content-Type` · `Access-Control-Allow-Methods: POST, OPTIONS`

## 3) Kod üretimi (Mikro-Klima Mağaza)
Mağazada "Mantar Pano Pro — 120 kristal" ve "Mantar Pano Sınırsız — 250 kristal" satın alınınca kullanıcıya bir kod üretilir (ör. `MP-PRO-XXXX-XXXX`, `MP-UNL-XXXX-XXXX`; 10+ karakter, rastgele). Sunucu kodu `plan`, `days=7`, `used_at`, `device`, `exp` ile saklar. İlk bozdurmada 7 gün başlar. Astrophoto Cam kodlarıyla aynı tabloyu kullanıyorsan sadece `app='mantarpano'` sütunu eklemen yeter.

Örnek Worker parçası (kendi mevcut kod sistemine uyarla):
```js
// D1: CREATE TABLE mp_codes(code TEXT PRIMARY KEY, plan TEXT, days INT DEFAULT 7, device TEXT, exp INTEGER);
async function redeemMantarPano(req, env) {
  const cors = { 'Access-Control-Allow-Origin': env.MP_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const { code, app, device } = await req.json().catch(() => ({}));
  const send = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: cors });
  if (app !== 'mantarpano' || !code || !device) return send({ ok: false, error: 'invalid_code' }, 400);
  const row = await env.DB.prepare('SELECT * FROM mp_codes WHERE code=?').bind(String(code).toUpperCase()).first();
  if (!row) return send({ ok: false, error: 'invalid_code' }, 404);
  if (row.device && row.device !== device) return send({ ok: false, error: 'used' }, 409);
  let exp = row.exp;
  if (!exp) { exp = Date.now() + row.days * 864e5; await env.DB.prepare('UPDATE mp_codes SET device=?, exp=? WHERE code=?').bind(device, exp, row.code).run(); }
  if (exp < Date.now()) return send({ ok: false, error: 'expired' }, 410);
  return send({ ok: true, app: 'mantarpano', plan: row.plan, expiresAt: exp });
}
```
Ayrıca rate limit (IP başına dakikada ~10 deneme) önerilir.

## 4) İsteğe bağlı sertleştirme
Mantar Pano statik olduğu için `localStorage` elle değiştirilebilir; bu, kodsuz premium açmanın kolay yoludur. Gerçek korumak istersen:
- **İmzalı jeton:** Worker yanıta `"token": "<yük>.<imza>"` ekler (yük = base64url JSON `{"app":"mantarpano","plan":"pro","exp":ms,"dev":"<device>"}`, imza = ECDSA P-256/SHA-256, `crypto.subtle.sign` çıktısı (ham 64 bayt) base64url, **yük metninin kendisi** imzalanır). Açık anahtarı JWK olarak `config.js → PUBLIC_KEY` içine koy. Artık plan ve süre yalnızca imzadan okunur; depolamayı değiştirmek işe yaramaz. (Testte doğrulandı: `tests/premium.test.js`.)
- **İptal/yenileme kontrolü:** `VERIFY_PATH` tanımlarsan uygulama açılışta kodu sunucuya sorar; sunucu `ok:false` derse premium kapanır, ağ yoksa son bilinen süre geçerli kalır.
Not: sayfa kodu herkese açık olduğundan %100 koruma mümkün değil; imza, sıradan kurcalamayı engeller.

## 5) Davranış özeti
- Süre bitince **hiçbir veri silinmez**: tema/raptiye/ip stili ana görünüme döner, ek panolar kilitlenir (silinmez), kilitli kartlar çözülür, mevcut kartlar çalışmaya devam eder. Yeni kod girince hepsi geri gelir.
- Daha düşük paket, aktif yüksek paketi ezmez ("önce Sınırsız bitsin" uyarısı). Aynı paketin ikinci kodu kalan süreye **eklenir** (imza modu kapalıyken).
- Saat geri alınarak kalan süre uzatılamaz.
