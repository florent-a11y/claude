import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PdfLine, PdfPage, PdfToken } from "./bank-pdf";

/** pdf.js needs its worker module even in Node (it runs it in-process); resolve it from node_modules. */
function workerUrl(): string {
  const rel = path.join("node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
  for (const root of [process.cwd(), path.resolve(process.cwd(), "..")]) {
    const candidate = path.join(root, rel);
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  throw new Error("PDF reader not installed: run npm install (pdfjs-dist is missing).");
}

/**
 * Text extraction for PDF bank statements: every text run with its position, grouped into visual lines.
 * Uses pdf.js (server only). Scanned statements have no text layer and come back with (almost) no tokens.
 */
export async function extractPdfPages(data: Uint8Array | Buffer): Promise<PdfPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: true, disableFontFace: true, verbosity: 0 }).promise;
  const pages: PdfPage[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const tokens: PdfToken[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [a, b, , , x, y] = item.transform;
        const height = Math.hypot(a, b) || item.height || 0;
        tokens.push({ x, y: vp.height - y, w: item.width, h: height, s: item.str });
      }
      pages.push({ number: p, width: vp.width, height: vp.height, lines: groupLines(tokens) });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

/** Groups tokens into lines by baseline (tolerance ~2.5pt), sorts each line left to right and joins the text with the right spacing. */
export function groupLines(tokens: PdfToken[], tolerance = 2.5): PdfLine[] {
  const sorted = [...tokens].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const t of sorted) {
    const line = lines.length ? lines[lines.length - 1] : undefined;
    if (line && Math.abs(line.y - t.y) <= tolerance) { line.tokens.push(t); line.y = (line.y * (line.tokens.length - 1) + t.y) / line.tokens.length; }
    else lines.push({ y: t.y, tokens: [t], text: "" });
  }
  for (const l of lines) { l.tokens.sort((a, b) => a.x - b.x); l.text = joinTokens(l.tokens); }
  return lines;
}

/** Joins tokens left to right; a gap wider than a third of the font size becomes a space (so split letters rejoin into words). */
export function joinTokens(tokens: PdfToken[]): string {
  let out = "";
  let end = -Infinity;
  for (const t of tokens) {
    const gap = t.x - end;
    const threshold = Math.max(1, (t.h || 8) * 0.3);
    if (out && gap > threshold) out += " ";
    out += t.s;
    end = t.x + t.w;
  }
  return out.replace(/\s+/g, " ").trim();
}
