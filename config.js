// Central application limits and interaction tuning.
export const CONFIG = Object.freeze({ WORLD_W: 4000, WORLD_H: 3000, IMAGE_MAX: 1400, IMAGE_QUALITY: .88, SAVE_DELAY: 600, SNAP: 8, THREAD_MAX_SAG: 260, THREAD_SAG_RATIO: .22, EXPORT_PADDING: 90, HISTORY_LIMIT: 30, HISTORY_BYTES: 90e6,
  // --- Premium (Pro / Sınırsız) · Mikro-Klima sunucusuna bağlantı. Ayrıntı: BAGLANTI.md ---
  API_BASE: 'https://mikroklimakontrolmerkezi.forevye.workers.dev/',                           // örn. 'https://mikroklima.KULLANICI.workers.dev'  (boşsa kod girişi "sunucu ayarlanmamış" der)
  REDEEM_PATH: '/api/mantarpano/redeem',  // POST {code, app:'mantarpano', device, v:1}
  VERIFY_PATH: '',                        // isteğe bağlı: iptal/yenileme kontrolü; boş = kapalı
  PUBLIC_KEY: null,                       // isteğe bağlı: Worker imza açık anahtarı (ECDSA P-256 JWK); doluysa imzasız kod kabul edilmez
  STORE_URL: '' });                       // Mikro-Klima mağaza adresi (doluysa Premium penceresinde bağlantı çıkar)
