// Runs before `next build` (see package.json "prebuild"). Downloads the licensed Kecak photo from Wikimedia
// Commons into public/hero.jpg so the site hosts it itself. If the download fails (no network, file moved),
// the illustrated fallback public/hero-illustrated.jpg is used instead. Never fails the build.
//
// Photo: "Kecak dancers cliffside Uluwatu" — Wikimedia Commons featured picture, licence CC BY-SA 2.0.
// File page: https://commons.wikimedia.org/wiki/File:Kecak_dancers_cliffside_Uluwatu.jpg
// Attribution is shown in the site footer (Footer.photoCredit) whenever the photo is in use.
import { writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUT = resolve(ROOT, "public/hero.jpg");
const META = resolve(ROOT, "public/hero.meta.json");
const FALLBACK = resolve(ROOT, "public/hero-illustrated.jpg");
const URL_ = "https://commons.wikimedia.org/wiki/Special:FilePath/Kecak_dancers_cliffside_Uluwatu.jpg?width=2400";

async function main() {
  if (process.env.HERO_PHOTO === "off") return useFallback("HERO_PHOTO=off");
  try {
    const res = await fetch(URL_, { redirect: "follow", headers: { "user-agent": "IndonesiaArrivalCardAssist/1.0 (build; info@allindonesia-arrivalcard.com)" }, signal: AbortSignal.timeout(20000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return useFallback(`HTTP ${res.status} ${type}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 50_000) return useFallback(`too small (${buf.length} bytes)`);
    writeFileSync(OUT, buf);
    writeFileSync(META, JSON.stringify({ source: "commons", credit: "Kecak dancers at Uluwatu, Wikimedia Commons, CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Kecak_dancers_cliffside_Uluwatu.jpg", bytes: buf.length }));
    console.log(`[hero] photo downloaded: ${Math.round(buf.length / 1024)} KB`);
  } catch (e) {
    useFallback(e instanceof Error ? e.message : String(e));
  }
}
function useFallback(reason) {
  if (existsSync(FALLBACK)) copyFileSync(FALLBACK, OUT);
  writeFileSync(META, JSON.stringify({ source: "illustration", reason }));
  console.log(`[hero] using illustration (${reason})`);
}
main();
