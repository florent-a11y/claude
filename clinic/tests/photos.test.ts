import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PRODUCTS } from "../lib/catalog";

const dir = path.join(__dirname, "..", "photos");
const files = readdirSync(dir).filter((f) => f.endsWith(".jpg")).map((f) => f.replace(/\.jpg$/, "")).sort();
// The registry imports image files, which only the Next.js build understands, so it is read here as text.
const registry = readFileSync(path.join(__dirname, "..", "lib", "photos.ts"), "utf8");
const registered = [...registry.matchAll(/from "@\/photos\/([a-z0-9-]+)\.jpg"/g)].map((m) => m[1]).sort();
const credits = readFileSync(path.join(dir, "CREDITS.md"), "utf8");

test("every photograph file is in the registry, and the registry points at no missing file", () => {
  assert.deepEqual(registered, files);
});

test("every photograph has its source recorded in photos/CREDITS.md", () => {
  for (const name of files) assert.match(credits, new RegExp("`" + name + "\\.jpg` \\| https://www\\.pexels\\.com/photo/\\d+/"), `${name}.jpg has no source line`);
});

test("every product shows a photograph that exists", () => {
  for (const p of PRODUCTS) assert.ok(files.includes(p.photo), `${p.slug} uses the missing photo "${p.photo}"`);
});

test("photographs stay light enough for mobile data", () => {
  for (const name of files) {
    const kb = readFileSync(path.join(dir, `${name}.jpg`)).length / 1024;
    assert.ok(kb < 450, `${name}.jpg is ${Math.round(kb)} KB`);
  }
});
