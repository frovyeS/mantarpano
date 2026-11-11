# Değişiklik öncesi/sonrası kontrol listesi

Her güncellemeden önce kısa bir not düş: **Ne değişiyor? Ne değişmemeli? Hangi davranışlar etkilenebilir?**
Sonra `npm test` çalıştır ve aşağıdaki maddelerden **değişikliğe dokunanları** elle dene.
Uygulamanın kendisi derleme istemez; `npm` yalnızca testler içindir.

Yayından önce: çalışan sürümün etiketini/kopyasını al (`git tag` ya da klasör kopyası). Sorun çıkarsa önceki sürüme dön.

## Hızlı tur (her değişiklikten sonra, ~3 dk)
- [ ] Sayfayı aç; konsolda kırmızı hata yok.
- [ ] Kart ekle, taşı, döndür, büyüt → sayfayı yenile → konumlar/boyutlar aynı.
- [ ] Yazı değiştir → Ctrl+Z / Ctrl+Y çalışıyor.
- [ ] İki kart arasına ip bağla, kalemle çiz, post-it'i kartın üstüne yapıştır → yenile → hepsi yerinde.
- [ ] Kart sil (onay çıkıyor) → Ctrl+Z geri getiriyor.

## Araç çubuğu (arayüze dokunduysan)
- [ ] Masaüstünde açılışta paneller kapalı; yalnızca Çiz · Ekle · Dosya (ve etkin araç adı) görünüyor.
- [ ] Sekmeye basınca açılıyor; aynı sekmeye tekrar basınca, panonun boş yerine tıklayınca veya `Escape` ile kapanıyor.
- [ ] Kart seçince **Kart** sekmesi beliriyor; seçim kalkınca veya kart silinince kayboluyor.
- [ ] Panel kapalıyken kısayollar çalışıyor: V, T, P, M, E, S, Ctrl+Z/Y, Ctrl+D, oklar, Delete.
- [ ] `Ctrl+F` Dosya panelini açıp aramaya odaklanıyor (ikinci basışta kapanmıyor).
- [ ] Dosya panelinde durum yazısı: Kaydediliyor… → Kaydedildi. IndexedDB engelliyken "Yedek alana kaydedildi", ikisi de başarısızsa "Kayıt başarısız" (kırmızı); Dosya sekmesinde nokta çıkıyor.
- [ ] Telefonda (≤760 px) alt çubukta her zaman bir sekme açık; aktif sekmeye basmak kapatmıyor.

## Veri kaybı senaryoları (kayıt/yedek koduna dokunduysan mutlaka)
- [ ] **Kaydet → Aç:** yedeği indir, birkaç kart sil, yedeği aç → kartlar, ipler ve çizim geri geldi.
- [ ] **Bozuk dosya:** boş bir `.json`, rastgele metin içeren `.json` ve `{"html":[],"threads":[null]}` aç → "Geçersiz proje dosyası" uyarısı çıkıyor **ve mevcut pano yerinde duruyor**.
- [ ] **Yanlış tür:** `.json` uzantılı bir resim/metin aç → pano bozulmuyor.
- [ ] **Aç sonrası geri al:** geçerli bir yedek aç, Ctrl+Z → önceki pano dönüyor.
- [ ] **Başka tarayıcıda/profilde aç:** yedek, farklı bir tarayıcıda aynı görünüyor (resimler dahil).
- [ ] **Kayıt alanı sorunu:** DevTools → Application → IndexedDB'yi sil/engelle, kart ekle → "Tarayıcı kaydı başarısız…" uyarısı görünüyor.
- [ ] **Gizli pencere:** kayıt kısıtlı olabilir; uyarı çıkıyor ve Kaydet ile yedek alınabiliyor.
- [ ] **Eski localStorage kaydı** (`mantar-pano-v2`) varsa açılışta içe aktarılıyor.

## Dışa aktarma
- [ ] Pano PNG (Normal) iniyor; kartlar, ipler, çizim görünüyor.
- [ ] A4 PDF ve 4 parçaya bölünmüş PNG-ZIP iniyor.
- [ ] Seçili kartı PNG indir.
- [ ] **İnternet kapalıyken** PNG/PDF → anlaşılır "kütüphane yüklenemedi" uyarısı; pano bozulmadan kalıyor.
- [ ] Telefonda "Çok yüksek" kalite → hata verirse uyarı çıkıyor, pano normale dönüyor.
- [ ] Dışa aktarma sonrası seçili kart, arama kutusu ve yakınlaştırma eski hâline döndü.

## Mobil
- [ ] İki parmakla yakınlaştırma/kaydırma; alt sekmeli araç çubuğu; kart seçip düzenleme.
