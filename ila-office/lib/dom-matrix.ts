/**
 * Minimal 2D `DOMMatrix` for Node. pdf.js evaluates `new DOMMatrix()` when its module loads and only polyfills it
 * from the optional native package `@napi-rs/canvas`, which serverless bundles do not ship. Text extraction never
 * renders, so an affine 2D matrix with the handful of methods pdf.js calls is enough. Column-vector convention:
 * `[a c e; b d f; 0 0 1]`, and `multiplySelf(o)` post-multiplies (this = this × o), as the DOM specification says.
 */

type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };

export class MiniDOMMatrix implements Affine {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;

  constructor(init?: ArrayLike<number> | Affine | string) {
    if (!init || typeof init === "string") return;
    if (typeof (init as ArrayLike<number>).length === "number") {
      const m = init as ArrayLike<number>;
      if (m.length === 6) { this.a = m[0]; this.b = m[1]; this.c = m[2]; this.d = m[3]; this.e = m[4]; this.f = m[5]; }
      else if (m.length === 16) { this.a = m[0]; this.b = m[1]; this.c = m[4]; this.d = m[5]; this.e = m[12]; this.f = m[13]; }
      else throw new TypeError("DOMMatrix: expected 6 or 16 numbers");
    } else {
      const o = init as Affine;
      this.a = o.a; this.b = o.b; this.c = o.c; this.d = o.d; this.e = o.e; this.f = o.f;
    }
  }

  static fromMatrix(o?: Affine) { return new MiniDOMMatrix(o); }

  get is2D() { return true; }
  get isIdentity() { return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0; }
  get m11() { return this.a; } get m12() { return this.b; } get m21() { return this.c; } get m22() { return this.d; } get m41() { return this.e; } get m42() { return this.f; }

  multiplySelf(o: Affine) {
    const { a, b, c, d, e, f } = this;
    this.a = a * o.a + c * o.b; this.b = b * o.a + d * o.b;
    this.c = a * o.c + c * o.d; this.d = b * o.c + d * o.d;
    this.e = a * o.e + c * o.f + e; this.f = b * o.e + d * o.f + f;
    return this;
  }
  preMultiplySelf(o: Affine) {
    const r = new MiniDOMMatrix(o).multiplySelf(this);
    this.a = r.a; this.b = r.b; this.c = r.c; this.d = r.d; this.e = r.e; this.f = r.f;
    return this;
  }
  translateSelf(tx = 0, ty = 0) { return this.multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }); }
  scaleSelf(sx = 1, sy = sx, _sz = 1, ox = 0, oy = 0) {
    if (ox || oy) this.translateSelf(ox, oy);
    this.multiplySelf({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
    if (ox || oy) this.translateSelf(-ox, -oy);
    return this;
  }
  invertSelf() {
    const { a, b, c, d, e, f } = this;
    const det = a * d - b * c;
    if (!det || !Number.isFinite(det)) { this.a = this.b = this.c = this.d = this.e = this.f = NaN; return this; }
    this.a = d / det; this.b = -b / det; this.c = -c / det; this.d = a / det;
    this.e = (c * f - d * e) / det; this.f = (b * e - a * f) / det;
    return this;
  }
  multiply(o: Affine) { return new MiniDOMMatrix(this).multiplySelf(o); }
  preMultiply(o: Affine) { return new MiniDOMMatrix(this).preMultiplySelf(o); }
  translate(tx = 0, ty = 0) { return new MiniDOMMatrix(this).translateSelf(tx, ty); }
  scale(sx = 1, sy = sx, sz = 1, ox = 0, oy = 0) { return new MiniDOMMatrix(this).scaleSelf(sx, sy, sz, ox, oy); }
  inverse() { return new MiniDOMMatrix(this).invertSelf(); }
  transformPoint(p: { x?: number; y?: number } = {}) {
    const x = p.x ?? 0, y = p.y ?? 0;
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
  }
  toFloat64Array() { return new Float64Array([this.a, this.b, 0, 0, this.c, this.d, 0, 0, 0, 0, 1, 0, this.e, this.f, 0, 1]); }
  toString() { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`; }
}

/** Installs the polyfill once, only where the real `DOMMatrix` is missing (Node, serverless). */
export function ensureDomMatrix(): void {
  const g = globalThis as { DOMMatrix?: unknown };
  if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = MiniDOMMatrix;
}
