import test from "node:test";
import assert from "node:assert/strict";
import { MiniDOMMatrix, ensureDomMatrix } from "../lib/dom-matrix";

const close = (m: { a: number; b: number; c: number; d: number; e: number; f: number }, exp: number[]) =>
  [m.a, m.b, m.c, m.d, m.e, m.f].forEach((v, i) => assert.ok(Math.abs(v - exp[i]) < 1e-9, `component ${i}: ${v} vs ${exp[i]}`));

test("identity, 6- and 16-element constructors", () => {
  assert.ok(new MiniDOMMatrix().isIdentity);
  close(new MiniDOMMatrix([2, 0, 0, 3, 4, 5]), [2, 0, 0, 3, 4, 5]);
  close(new MiniDOMMatrix([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 4, 5, 0, 1]), [2, 0, 0, 3, 4, 5]);
});

test("the pdf.js Type3 glyph transform: scale then translate post-multiplies", () => {
  // new DOMMatrix().scaleSelf(1 / w, -1 / h).translateSelf(0, -h) maps glyph pixel (x, y) to (x / w, 1 - y / h)
  const m = new MiniDOMMatrix().scaleSelf(1 / 10, -1 / 20).translateSelf(0, -20);
  close(m, [0.1, 0, 0, -0.05, 0, 1]);
  assert.deepEqual(m.transformPoint({ x: 5, y: 20 }), { x: 0.5, y: 0, z: 0, w: 1 });
});

test("multiplySelf is this × o and preMultiplySelf is o × this", () => {
  const t = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 0 };
  const s = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 };
  close(new MiniDOMMatrix(t).multiplySelf(s), [2, 0, 0, 2, 10, 0]);      // translate after scaling: point scales then moves 10
  close(new MiniDOMMatrix(t).preMultiplySelf(s), [2, 0, 0, 2, 20, 0]);   // scale applied to the translation too
});

test("inverse undoes the transform and a singular matrix becomes NaN", () => {
  const m = new MiniDOMMatrix([2, 1, 0.5, 3, 7, -4]);
  close(m.multiply(m.inverse()), [1, 0, 0, 1, 0, 0]);
  assert.ok(Number.isNaN(new MiniDOMMatrix([1, 2, 2, 4, 0, 0]).invertSelf().a));
});

test("scaleSelf about an origin keeps the origin fixed", () => {
  const m = new MiniDOMMatrix().scaleSelf(3, 3, 1, 10, 10);
  assert.deepEqual(m.transformPoint({ x: 10, y: 10 }), { x: 10, y: 10, z: 0, w: 1 });
  assert.deepEqual(m.transformPoint({ x: 11, y: 10 }), { x: 13, y: 10, z: 0, w: 1 });
});

test("ensureDomMatrix only fills a missing global", () => {
  const g = globalThis as { DOMMatrix?: unknown };
  const before = g.DOMMatrix;
  delete g.DOMMatrix;
  ensureDomMatrix();
  assert.equal(g.DOMMatrix, MiniDOMMatrix);
  const marker = function Real() {};
  g.DOMMatrix = marker; ensureDomMatrix(); assert.equal(g.DOMMatrix, marker);
  if (before === undefined) delete g.DOMMatrix; else g.DOMMatrix = before;
});
