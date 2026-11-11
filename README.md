# Mantar Pano

Tek sayfalı, tarayıcıda çalışan görsel pano. Derleme adımı yoktur; proje klasörü bir statik sunucuda (ör. GitHub Pages) yayınlanabilir.

## Çalıştırma

`index.html` dosyasını açın veya klasörü bir statik HTTP sunucusunda yayınlayın. Uygulama native ES modules kullandığı için `file://` yerine yerel sunucu kullanılması önerilir. PNG/PDF dışa aktarma ve bölünmüş PNG ZIP indirme için html2canvas, jsPDF ve JSZip CDN üzerinden yüklenir; bu üç özellik için internet bağlantısı gerekir. Diğer pano özellikleri ve IndexedDB kaydı çevrimdışı çalışır.

## Özellikler

- Mantar dokulu 4000×3000 pano; yakınlaştırma, kaydırma, büyüteç.
- Fotoğraf, kupür, çift kolonlu kupür, not, post-it, kâğıt, zaman çizelgesi ve mühür.
- Kartları taşıma, döndürme, büyütme, yapıştırma; 8 px hizalama yakalaması (Alt ile geçici kapatılır).
- İp bağlantısı: dönme/büyütme matrisine göre hesaplanan raptiye koordinatı ve raptiye başında ip dolama görünümü.
- Kalem, işaretleyici, silgi; kalem basıncı ve coalesced pointer events.
- Sınıf etiketi ve filtre, öne/arkaya gönderme, arama (Ctrl+F), çoğaltma (Ctrl+D).
- Klavye ile 1 px / Shift+ok ile 10 px taşıma; Ctrl+Z geri al, Ctrl+Y veya Ctrl+Shift+Z yinele.
- Dosya yöneticisinden görsel veya JSON yedeği sürükleyip bırakma.
- Seçili kartı PNG indirme; pano PNG, A4/A3/poster PDF; çok parçalı PNG tek ZIP içinde.
- IndexedDB otomatik kayıt; eski localStorage panolarını açılışta içe aktarma; JSON yedek/aç.
- JSON içe aktarmada script, inline event handler ve tehlikeli URL temizliği.
- Mobil yakınlaştırma erişilebilir; alt sekmeli araç çubuğu. Masaüstünde de sekmeli, açılır-kapanır araç çubuğu: Çiz · Ekle · Kart (yalnızca kart seçiliyken) · Dosya; aynı sekmeye basarak, dışarı tıklayarak veya Escape ile kapanır. Dosya bölümünde otomatik kayıt durumu görünür.

## Veri ve güvenlik

Pano verisi tarayıcının IndexedDB alanında tutulur. Tarayıcı verilerini temizlemeden önce `Dosya → Kaydet` ile JSON yedeği alın. İçe aktarılan HTML üzerinde tehlikeli etiketler/özellikler temizlenir; yine de yalnızca güvendiğiniz pano yedeklerini açın.

## Teknik notlar

Kod `app.js` (arayüz/olay akışı), `config.js` (ayarlar), `geometry.js` (kart/raptiye geometrisi) ve `persist.js` (IndexedDB) olarak ayrılmıştır. Büyüteç klonu yalnızca pano değiştikten sonra ihtiyaç olduğunda yenilenir. Dolu alan sınırları çizim katmanının 400×300 örneklemesiyle hesaplanır; 48 MB tam çözünürlüklü ImageData tahsisi yapılmaz.

Dışa aktarma kitaplıkları bu pakette yerel olarak bulunmaz; CDN kaynakları `index.html` içindedir. Bu nedenle tam çevrimdışı PDF/PNG dışa aktarma için bu kütüphaneleri `vendor/` klasörüne indirip script yollarını yerelleştirmek gerekir.

## Test ve değişiklik disiplini

Uygulama derleme gerektirmez; `package.json` yalnızca testler içindir:

```
npm install
npm test
```

Testler `geometry.js` (raptiye/ip hesabı), `persist.js` (kayıt, "daha yeni olan kazanır", IndexedDB hataları) ve `app.js` içindeki `restore()` (bozuk yedekte mevcut panonun korunması, içe aktarma temizliği) için yazılmıştır. Elle kontrol için `KONTROL-LISTESI.md` dosyasına bakın.

Geçersiz bir JSON yedeği açıldığında mevcut pano silinmez; açılışta kayıtlı pano okunamazsa bozuk kopya `mantar-pano-v2-hatali-…` anahtarıyla IndexedDB'de ayrıca saklanır.
