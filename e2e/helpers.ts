import { PNG } from "pngjs";
import type { Page } from "@playwright/test";

/** Long enough for the tunnel to establish a wake and fill the probe trace. */
export const SETTLE_MS = 12_000;

export async function readout(page: Page, label: string): Promise<string> {
  return page.evaluate((l) => {
    const row = [...document.querySelectorAll(".readouts div")].find((d) =>
      d.textContent?.includes(l),
    );
    return row?.textContent?.replace(l, "").trim() ?? "";
  }, label);
}

export async function pressedIn(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find(
      (b) => b.getAttribute("aria-pressed") === "true",
    );
    return el?.textContent?.trim() ?? "";
  }, selector);
}

/**
 * Mean brightness of a region of the canvas, 0..255. Read from a composited
 * screenshot: the drawing buffer is not preserved, so an in-page readback of
 * the WebGL canvas comes back black.
 */
export async function canvasBrightness(
  page: Page,
  region: { x0: number; x1: number; y0: number; y1: number } = { x0: 0, x1: 1, y0: 0, y1: 1 },
): Promise<number> {
  const el = page.locator(".fluidCanvas");
  const png = PNG.sync.read(await el.screenshot());
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(region.y0 * png.height); y < Math.floor(region.y1 * png.height); y++) {
    for (let x = Math.floor(region.x0 * png.width); x < Math.floor(region.x1 * png.width); x++) {
      const p = (y * png.width + x) << 2;
      sum += png.data[p] + png.data[p + 1] + png.data[p + 2];
      n++;
    }
  }
  return n === 0 ? 0 : sum / n / 3;
}

/** Drag with mouse events, which every engine handles identically. */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
) {
  const box = await page.locator(".fluidCanvas").boundingBox();
  if (!box) throw new Error("canvas has no box");
  await page.mouse.move(box.x + box.width * from.x, box.y + box.height * from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to.x, box.y + box.height * to.y, { steps });
  await page.mouse.up();
}

/**
 * Share of pixels clipped to white, and mean saturation of the lit ones.
 * A washed-out tank is not simply bright — it is bright *and* colourless.
 */
export async function canvasStats(page: Page): Promise<{ blown: number; saturation: number }> {
  const png = PNG.sync.read(await page.locator(".fluidCanvas").screenshot());
  let blown = 0;
  let sat = 0;
  let lit = 0;
  const total = png.width * png.height;
  for (let p = 0; p < png.data.length; p += 4) {
    const r = png.data[p];
    const g = png.data[p + 1];
    const b = png.data[p + 2];
    if (r > 250 && g > 250 && b > 250) blown++;
    const mx = Math.max(r, g, b);
    if (mx > 30) {
      sat += (mx - Math.min(r, g, b)) / mx;
      lit++;
    }
  }
  return { blown: (100 * blown) / total, saturation: lit ? sat / lit : 0 };
}
