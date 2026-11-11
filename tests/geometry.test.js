// geometry.js testleri. Node'da DOMMatrix olmadığı için küçük bir 2B taklidi kullanılır;
// beklenen değerler ise matristen bağımsız, kapalı formülle hesaplanır.
import test from 'node:test';
import assert from 'node:assert/strict';

class FakeMatrix {                       // [a b c d e f]; çağrılar sağdan çarpar (DOMMatrix ile aynı)
  constructor(m = [1, 0, 0, 1, 0, 0]) { this.m = m; }
  #mul(n) { const [a, b, c, d, e, f] = this.m, [A, B, C, D, E, F] = n;
    return new FakeMatrix([a*A + c*B, b*A + d*B, a*C + c*D, b*C + d*D, a*E + c*F + e, b*E + d*F + f]); }
  translate(x, y = 0) { return this.#mul([1, 0, 0, 1, x, y]); }
  scale(s) { return this.#mul([s, 0, 0, s, 0, 0]); }
  rotate(deg) { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return this.#mul([c, s, -s, c, 0, 0]); }
  transformPoint({ x, y }) { const [a, b, c, d, e, f] = this.m; return { x: a*x + c*y + e, y: b*x + d*y + f }; }
}
globalThis.DOMMatrix = FakeMatrix;
const { cardPin, pointOnQuadratic } = await import('../geometry.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
const card = (o) => ({ offsetWidth: 200, offsetLeft: 500, offsetTop: 300, dataset: o });

test('taklit matris kendi içinde tutarlı (translate sonra rotate)', () => {
  const p = new FakeMatrix().translate(10, 0).rotate(90).transformPoint({ x: 1, y: 0 });
  near(p.x, 10, 'x'); near(p.y, 1, 'y');
});

test('cardPin: döndürme ve ölçek yokken raptiye kartın üst-orta noktasının 2 px altındadır', () => {
  const p = cardPin(card({}));
  near(p.x, 600, 'x'); near(p.y, 302, 'y');
});

test('cardPin: dönüş/ölçek, kartın üst-orta noktası etrafında uygulanır', () => {
  for (const [r, s] of [[0, 1], [15, 1], [-30, 1.5], [90, 2], [180, 0.5]]) {
    const rad = r * Math.PI / 180, p = cardPin(card({ r: String(r), s: String(s) }));
    near(p.x, 500 + 100 - 2 * s * Math.sin(rad), `x (r=${r}, s=${s})`);
    near(p.y, 300 + 2 * s * Math.cos(rad), `y (r=${r}, s=${s})`);
  }
});

test('cardPin: dataset eksikse varsayılanlar (0°, 1x) kullanılır', () => {
  const a = cardPin(card({})), b = cardPin(card({ r: '0', s: '1' }));
  assert.deepEqual(a, b);
});

test('pointOnQuadratic: uçlar ve orta nokta', () => {
  const g = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, cx: 50, cy: 80 };
  assert.deepEqual(pointOnQuadratic(g, 0), { x: 0, y: 0 });
  assert.deepEqual(pointOnQuadratic(g, 1), { x: 100, y: 0 });
  const m = pointOnQuadratic(g, .5);
  near(m.x, 50, 'orta x'); near(m.y, 40, 'orta y');   // 0.25*0 + 0.5*80 + 0.25*0
});

test('pointOnQuadratic: kontrol noktası uçlarla aynı doğru üzerindeyse eğri doğrudur', () => {
  const g = { a: { x: 0, y: 0 }, b: { x: 100, y: 100 }, cx: 50, cy: 50 };
  for (const p of [0, .25, .5, .75, 1]) { const q = pointOnQuadratic(g, p); near(q.x, q.y, `p=${p}`); near(q.x, 100 * p, `x p=${p}`); }
});
