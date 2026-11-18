import test from 'node:test';
import assert from 'node:assert/strict';
import { a4Metrics } from '../geometry.js';

test('a4Metrics: A4 boyutundaki kart %100, 297x210 mm', () => {
  const m = a4Metrics(1123, 794, 1123, 794);
  assert.ok(Math.abs(m.pct - 100) < 1e-9); assert.equal(m.fit, 1);
  assert.ok(Math.abs(m.mmW - 297.1) < .2 && Math.abs(m.mmH - 210.1) < .2);
});
test('a4Metrics: 130x130 post-it A4 alanının ~%1,9 u; ~52 tane sığar', () => {
  const m = a4Metrics(130, 130, 1123, 794);
  assert.ok(Math.abs(m.pct - 1.895) < .01); assert.equal(m.fit, 52);
});
test('a4Metrics: sıfır alan güvenli', () => { assert.equal(a4Metrics(0, 0, 1123, 794).fit, 0); });
