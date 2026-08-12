// A contact sheet of the whole app, for looking at.
//
// The test suite asserts; this one shows. Most of what goes wrong here is
// visual — a scenario that settles to black, a colormap that blows out, an
// overlay that covers the thing it annotates — and none of it is visible from
// the code. CLAUDE.md says a screenshot is the only honest check for most
// changes, so this makes taking forty of them cheap.
//
// It captures every scenario against every field, plus the layouts that are
// easy to forget, measures each frame, and composes the lot into a single
// labelled sheet you can take in at once.
//
//   node scripts/contact-sheet.mjs                  # against localhost:3000
//   node scripts/contact-sheet.mjs --url http://…   # against anywhere
//   node scripts/contact-sheet.mjs --settle 9000    # longer to develop
//
// Writes review/contact-sheet.png and prints a table. Nothing here asserts:
// the numbers are for judging, and the judgement is yours.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const BASE = arg("url", "http://localhost:3000");
const SETTLE = Number(arg("settle", 7000));
const OUT = arg("out", "review");

const SCENARIOS = [
  "KÁRMÁN.ST",
  "WING",
  "INK.PLAY",
  "PLUME",
  "VORTEX.PAIR",
  "STORM",
  "RAYLEIGH.T",
];
const VIEWS = ["DYE", "VELOCITY", "PRESSURE", "CURL", "HEAT"];

/** What a frame is actually made of, beyond "it looked fine". */
function measure(buffer) {
  const png = PNG.sync.read(buffer);
  let sum = 0;
  let dark = 0;
  let blown = 0;
  let sat = 0;
  const n = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sum += (r + g + b) / 3;
    if (max < 12) dark++;
    if (min > 245) blown++;
    if (max > 0) sat += (max - min) / max;
  }
  return {
    luma: +(sum / n).toFixed(1),
    darkPct: +((100 * dark) / n).toFixed(1),
    blownPct: +((100 * blown) / n).toFixed(2),
    sat: +(sat / n).toFixed(2),
  };
}

const rows = [];
const cells = [];

async function shoot(page, label, note = "") {
  const buf = await page.locator(".fluidCanvas").screenshot();
  const m = measure(buf);
  rows.push({ label, ...m, note });
  cells.push({ label, note, m, data: buf.toString("base64") });
  return m;
}

const browser = await chromium.launch({ args: ["--use-angle=metal"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.goto(BASE);
await page.waitForTimeout(SETTLE);

// Every specimen, in the field it is meant to be seen in.
for (const s of SCENARIOS) {
  await page.locator(".scenarioBtn", { hasText: s }).click();
  await page.waitForTimeout(SETTLE);
  await shoot(page, s);
}

// Every field, on the specimen the essay uses to explain them.
await page.locator(".scenarioBtn", { hasText: "KÁRMÁN.ST" }).click();
await page.waitForTimeout(SETTLE);
for (const v of VIEWS) {
  await page.locator(".viewBtn", { hasText: v }).click();
  await page.waitForTimeout(2500);
  await shoot(page, `KÁRMÁN · ${v}`);
}
await page.locator(".viewBtn", { hasText: "DYE" }).click();

// The states that are easy to forget because they need a gesture.
await page.locator(".btn", { hasText: "BURST" }).click();
await page.waitForTimeout(1200);
await shoot(page, "AFTER BURST", "1.2s after");

await page.locator(".btn", { hasText: "AUTO.PILOT" }).click();
await page.waitForTimeout(9000);
await shoot(page, "AUTOPILOT", "9s in");
await page.locator(".btn", { hasText: "STOP TOUR" }).click();
await page.close();

// Layouts. Full-page here, not just the tank — the point is the composition.
const layouts = [
  { label: "PHONE PORTRAIT", vp: { width: 390, height: 844 } },
  { label: "PHONE LANDSCAPE", vp: { width: 844, height: 390 } },
  { label: "TABLET", vp: { width: 820, height: 1180 } },
  { label: "DESKTOP", vp: { width: 1500, height: 950 } },
];
for (const l of layouts) {
  const p = await browser.newPage({ viewport: l.vp });
  await p.goto(BASE);
  await p.waitForTimeout(SETTLE);
  const buf = await p.screenshot();
  cells.push({ label: l.label, note: `${l.vp.width}×${l.vp.height}`, m: measure(buf), data: buf.toString("base64") });
  rows.push({ label: l.label, ...measure(buf), note: `${l.vp.width}×${l.vp.height}` });
  await p.close();
}

// The docked tank, which only exists after a scroll.
const dock = await browser.newPage({ viewport: { width: 390, height: 844 } });
await dock.goto(BASE);
await dock.waitForTimeout(SETTLE);
await dock.evaluate(() => window.scrollBy(0, 1600));
await dock.waitForTimeout(2000);
const dockBuf = await dock.screenshot();
cells.push({ label: "DOCKED · PHONE", note: "after scroll", m: measure(dockBuf), data: dockBuf.toString("base64") });
rows.push({ label: "DOCKED · PHONE", ...measure(dockBuf), note: "after scroll" });
await dock.close();

// Compose. Forty separate files cannot be looked at; one sheet can.
const html = `<style>
  body { margin:0; background:#0b0b0b; font-family: ui-monospace, monospace; }
  .grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:14px; padding:14px; }
  figure { margin:0; background:#111; border:1px solid #333; }
  img { display:block; width:100%; height:150px; object-fit:cover; background:#000; }
  figcaption { color:#e9e7df; font-size:11px; padding:5px 6px; letter-spacing:.06em; }
  .m { color:#8a8a8a; font-size:10px; }
  .warn { color:#ff4400; }
</style><div class="grid">${cells
  .map((c) => {
    const flags = [];
    if (c.m.darkPct > 55) flags.push(`dark ${c.m.darkPct}%`);
    if (c.m.blownPct > 0.4) flags.push(`blown ${c.m.blownPct}%`);
    if (c.m.luma < 10) flags.push(`luma ${c.m.luma}`);
    return `<figure>
      <img src="data:image/png;base64,${c.data}">
      <figcaption>${c.label}${c.note ? ` <span class="m">${c.note}</span>` : ""}
        <div class="m">luma ${c.m.luma} · dark ${c.m.darkPct}% · sat ${c.m.sat} · blown ${c.m.blownPct}%</div>
        ${flags.length ? `<div class="warn">${flags.join(" · ")}</div>` : ""}
      </figcaption>
    </figure>`;
  })
  .join("")}</div>`;

await mkdir(OUT, { recursive: true });
const sheetPage = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await sheetPage.setContent(html);
await sheetPage.waitForTimeout(600);
await sheetPage.screenshot({ path: `${OUT}/contact-sheet.png`, fullPage: true });
await writeFile(`${OUT}/contact-sheet.json`, JSON.stringify(rows, null, 2));
await sheetPage.close();
await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad("STATE", 22), pad("LUMA", 7), pad("DARK%", 8), pad("SAT", 6), "BLOWN%");
for (const r of rows) {
  const flag = r.darkPct > 55 || r.blownPct > 0.4 || r.luma < 10 ? "  <-- look" : "";
  console.log(pad(r.label, 22), pad(r.luma, 7), pad(r.darkPct, 8), pad(r.sat, 6), r.blownPct + flag);
}
console.log(`\n${OUT}/contact-sheet.png`);
