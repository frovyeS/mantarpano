// app.js'yi bölmeden restore() davranışını sınar: fonksiyon dosyadan çıkarılıp jsdom'da çalıştırılır.
// En önemli kural: geçersiz/bozuk veri açılırsa MEVCUT PANO YERİNDE KALIR.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const a = src.indexOf('function restore(d) {'), b = src.indexOf('\nlet saveWarned', a);
assert.ok(a > 0 && b > a, 'app.js içinde restore() bulunamadı; bu testin çıkarma işaretleri güncellenmeli.');
const restoreSrc = src.slice(a, b);

function makeBoard(oldHtml = '<div class="card" id="old1">A</div><div class="card" id="old2">B</div>') {
  const dom = new JSDOM(`<div id="world">${oldHtml}</div>`), { document, DOMParser, Event, Image } = dom.window, world = document.getElementById('world');
  const items = () => [...world.querySelectorAll(':scope > .card, :scope > .stamp, :scope > .tl')];
  const noop = () => {}, ctx = { clearRect: noop }, cv = { width: 1, height: 1 }, $ = () => ({ dispatchEvent: noop });
  const factory = new Function('items', 'world', 'document', 'DOMParser', 'addX', 'ensure', 'ctx', 'cv', 'drawThreads', 'legend', '$', 'Event', 'Image', 'syncCat', 'applySettings', 'afterRestore', 'sanitizeThreadStyle',
    `let threads=[],restoreId=0,canvasBumped=0,drawURL=null,drawDirty=false,sel=null,zTop=1;\n${restoreSrc}\nreturn {restore,getThreads:()=>threads,getDraw:()=>drawURL};`);
  const api = factory(items, world, document, DOMParser, noop, noop, ctx, cv, noop, noop, $, Event, Image, noop, noop, noop, x => (['classic','rope','dashed','neon','gold'].includes(x) ? x : 'classic'));
  return { ...api, items, ids: () => items().map(e => e.id || e.textContent) };
}
const card = (t = 'X') => `<div class="card">${t}</div>`;

test('geçersiz kök veri: hata verir, mevcut pano korunur', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}, { html: 'a', threads: [] }, { html: [], threads: {} }, { html: [1, 2], threads: [] }, { html: [null], threads: [] }]) {
    const b = makeBoard(); assert.throws(() => b.restore(bad), /Geçersiz/, JSON.stringify(bad));
    assert.deepEqual(b.ids(), ['old1', 'old2'], 'pano değişmemeli: ' + JSON.stringify(bad));
  }
});

test('threads içinde null/ilkel eleman: hata vermez, eski pano yeni veriyle değişir, bağ atılır', () => {
  const b = makeBoard(); b.restore({ html: [card('1'), card('2')], threads: [null, 5, 'x', { a: 0, b: 1, color: '#123456' }] });
  assert.equal(b.items().length, 2); assert.equal(b.getThreads().length, 1);
});

test('geçerli yedek: kartlar ve ip doğru geri gelir', () => {
  const b = makeBoard(); b.restore({ html: [card('1'), card('2'), card('3')], threads: [{ a: 0, b: 2, color: '#c1121f', label: 'bağ', p: .3 }] });
  assert.deepEqual(b.ids(), ['1', '2', '3']);
  const [t] = b.getThreads(); assert.equal(t.a, b.items()[0]); assert.equal(t.b, b.items()[2]); assert.equal(t.label, 'bağ'); assert.equal(t.p, .3);
});

test('ip doğrulama: geçersiz indeks, kendine bağ olmayan/kart olmayan uç, kötü renk/p/etiket', () => {
  const b = makeBoard(); b.restore({ html: [card('1'), '<div class="stamp">M</div>', card('3')], threads: [
    { a: 0, b: 9 }, { a: -1, b: 0 }, { a: 0, b: 1 },                       // atılmalı
    { a: 0, b: 2, color: 'red;background:url(x)', label: 'u'.repeat(99), p: 7 } ] });   // düzeltilmeli
  const ts = b.getThreads(); assert.equal(ts.length, 1);
  assert.equal(ts[0].color, '#c1121f'); assert.equal(ts[0].label.length, 40); assert.equal(ts[0].p, 1);
});

test('güvenlik: script, on* özellikleri ve javascript:/data:text URL\'leri temizlenir', () => {
  const b = makeBoard(); b.restore({ threads: [], html: [
    '<div class="card" onclick="alert(1)">a<script>alert(2)</script><iframe src="x"></iframe><a href="javascript:alert(3)">l</a><img src="data:text/html;base64,AAAA"><img src="data:image/png;base64,AAAA"></div>' ] });
  const c = b.items()[0];
  assert.equal(c.querySelector('script,iframe'), null); assert.equal(c.getAttribute('onclick'), null);
  assert.equal(c.querySelector('a').getAttribute('href'), null);
  const imgs = c.querySelectorAll('img'); assert.equal(imgs[0].getAttribute('src'), null); assert.ok(imgs[1].getAttribute('src').startsWith('data:image/png'));
});

test('çizim verisi: yalnızca metin kabul edilir', () => {
  const b = makeBoard(); b.restore({ html: [], threads: [], draw: { x: 1 } }); assert.equal(b.getDraw(), null);
  b.restore({ html: [], threads: [], draw: 'data:image/png;base64,AAAA' }); assert.equal(b.getDraw(), 'data:image/png;base64,AAAA');
});

test('bilinen davranış: geçerli ama boş yedek panoyu boşaltır (geri alınabilir, onay istemez)', () => {
  const b = makeBoard(); b.restore({ html: [], threads: [] }); assert.equal(b.items().length, 0);
});
