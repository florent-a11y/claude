/**
 * Renders the illustrated hero (components/HeroScene.tsx) and the brand mark (components/Logo.tsx) to
 * static images with headless Chromium:
 *
 *   public/hero.jpg  2400×1200 JPEG, the hero background used by components/HeroBackdrop.tsx
 *   public/og.png    1200×630 Open Graph card: the same scene with the logo and tagline
 *
 * Usage (Playwright is not a project dependency; install it once, or point NODE_PATH at a checkout
 * that has it):
 *
 *   npx playwright install chromium
 *   npx tsx scripts/render-hero.tsx                # writes both files
 *   npx tsx scripts/render-hero.tsx --preview out.png   # 1200×600 PNG of the scene only, for iterating
 *
 * Set PW_CHROMIUM to a Chromium binary to skip Playwright's own browser lookup.
 * Re-run whenever HeroScene or the logo changes. To use a licensed photo instead of the illustration,
 * overwrite public/hero.jpg (2400×1200, JPEG quality ~75, under 350 KB) and keep og.png in sync.
 */
import * as React from "react";
import { statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

// tsx compiles the component files with the project tsconfig (jsx: preserve → classic runtime), which
// expects a global React; the app itself is compiled by Next.js and does not need this.
(globalThis as unknown as { React: typeof React }).React = React;

const ROOT = resolve(__dirname, "..");
const TAGLINE = "Indonesia arrival card &amp; <span style=\"white-space:nowrap\">e-VOA</span> assistance";
const SUB = "Guided form, human-checked, delivered by email. Transparent price shown first.";
const PILL = "Private service, not a government website";
const DOMAIN = "allindonesia-arrivalcard.com";
const FONT = "Inter, 'Liberation Sans', Arial, Helvetica, sans-serif";

async function main() {
  const { HeroScene } = await import("../components/HeroScene");
  const { LogoMark } = await import("../components/Logo");
  const { chromium } = await import("playwright");
  const scene = renderToStaticMarkup(React.createElement(HeroScene));
  const mark = renderToStaticMarkup(React.createElement(LogoMark, { size: 76 }));

  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const preview = process.argv.indexOf("--preview");
  if (preview > -1) {
    const out = process.argv[preview + 1];
    const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });
    await page.setContent(`<html><body style="margin:0"><div style="width:1200px;height:600px">${scene.replace('width="2400" height="1200"', 'width="1200" height="600"')}</div></body></html>`);
    await page.screenshot({ path: out });
    await browser.close();
    return;
  }

  // The illustrated scene is kept as public/hero-illustrated.jpg; the live hero (public/hero.jpg) is a photo.
  const hero = resolve(ROOT, "public/hero-illustrated.jpg");
  const page = await browser.newPage({ viewport: { width: 2400, height: 1200 } });
  await page.setContent(`<html><body style="margin:0;background:#131a45">${scene}</body></html>`);
  await page.screenshot({ path: hero, type: "jpeg", quality: 80 });
  console.log(`public/hero-illustrated.jpg  ${Math.round(statSync(hero).size / 1024)} KB`);
  const photo = "data:image/jpeg;base64," + readFileSync(resolve(ROOT, "public/hero.jpg")).toString("base64");

  const og = resolve(ROOT, "public/og.png");
  const ogPage = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await ogPage.setContent(`<!doctype html><html><head><style>
    body{margin:0;width:1200px;height:630px;overflow:hidden;position:relative;font-family:${FONT};background:#131a45}
    .bg{position:absolute;inset:0}
    .bg img{position:absolute;width:1800px;height:900px;left:0;top:-120px}
    .fade{position:absolute;inset:0;background:linear-gradient(90deg,#fff 0%,#fff 40%,rgba(255,255,255,.94) 52%,rgba(255,255,255,.45) 68%,rgba(255,255,255,0) 84%)}
    .top{display:none}
    .panel{position:absolute;left:72px;top:72px;width:640px}
    .logo{display:flex;align-items:center;gap:20px}
    .word{font-size:46px;font-weight:700;letter-spacing:-.02em;color:#095241;white-space:nowrap}
    .word b{color:#c24d1c;font-weight:700}
    h1{margin:54px 0 0;font-size:50px;line-height:1.12;font-weight:800;letter-spacing:-.02em;color:#14211d}
    p{margin:22px 0 0;font-size:24px;line-height:1.4;color:#33443e}
    .pill{position:absolute;left:72px;bottom:64px;background:#fff;border:2px solid #d6ece4;border-radius:999px;padding:12px 24px;font-size:22px;font-weight:700;color:#095241}
    .dom{position:absolute;right:72px;bottom:74px;font-size:22px;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.45)}
  </style></head><body>
    <div class="bg"><img src="${photo}"></div><div class="top"></div><div class="fade"></div>
    <div class="panel">
      <div class="logo">${mark}<div class="word"><div style="font-size:18px;letter-spacing:.18em;text-transform:uppercase;color:#5f6f69;font-weight:600;margin-bottom:4px">Indonesia</div>Arrival Card <b>Assist</b></div></div>
      <h1>${TAGLINE}</h1>
      <p>${SUB}</p>
    </div>
    <div class="pill">${PILL}</div>
    <div class="dom">${DOMAIN}</div>
  </body></html>`);
  await ogPage.screenshot({ path: og, type: "png" });
  console.log(`public/og.png    ${Math.round(statSync(og).size / 1024)} KB`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

