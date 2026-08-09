import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

const VIEWPORTS = [
  { name: "phone portrait", vp: { width: 390, height: 844 }, stacked: true },
  { name: "phone landscape", vp: { width: 844, height: 390 }, stacked: false },
  { name: "small phone landscape", vp: { width: 667, height: 375 }, stacked: false },
  { name: "tablet portrait", vp: { width: 820, height: 1180 }, stacked: true },
  { name: "tablet landscape", vp: { width: 1180, height: 820 }, stacked: false },
  { name: "desktop", vp: { width: 1600, height: 1000 }, stacked: false },
];

test.describe("responsive", () => {
  for (const { name, vp, stacked } of VIEWPORTS) {
    test(`${name}: usable layout, no overflow`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/");
      await page.waitForTimeout(4000);

      const r = await page.evaluate(() => {
        const c = document.querySelector(".fluidCanvas")!.getBoundingClientRect();
        const p = document.querySelector(".panel")!.getBoundingClientRect();
        const btn = document.querySelector(".scenarioGrid .btn")!.getBoundingClientRect();
        return {
          stacked: p.top >= c.bottom - 2,
          controlOnScreen: btn.top >= 0 && btn.bottom <= window.innerHeight,
          hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      // Stacking must follow orientation. Keyed on width alone, a landscape
      // phone put every control below the fold.
      expect(r.stacked).toBe(stacked);
      expect(r.controlOnScreen).toBe(true);
      expect(r.hOverflow).toBe(0);
    });
  }

  test("the stage reaches the bottom edge with no seam", async ({ page }) => {
    // The stage is exactly one viewport tall, so a light rule on its bottom
    // border landed on the last two pixels of the screen and read as a pale
    // line under a full-bleed simulation.
    for (const height of [1000, 901, 1080]) {
      await page.setViewportSize({ width: 1400, height });
      await page.goto("/");
      await page.waitForTimeout(3500);
      const png = PNG.sync.read(await page.screenshot());
      const y = png.height - 1;
      let brightest = 0;
      for (let x = 0; x < png.width; x++) {
        const p = (y * png.width + x) << 2;
        brightest = Math.max(brightest, (png.data[p] + png.data[p + 1] + png.data[p + 2]) / 3);
      }
      // The chrome is near-black; anything pale down here is a seam.
      expect(brightest, `seam at ${height}px tall`).toBeLessThan(120);
    }
  });

  test("the control column fits exactly at 1000px tall", async ({ page }) => {
    // Engines size form controls differently; Firefox was 9px over when
    // Chromium was exact.
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page.waitForTimeout(3000);
    const overflow = await page.evaluate(() => {
      const p = document.querySelector(".panel")!;
      return p.scrollHeight - p.clientHeight;
    });
    expect(overflow).toBe(0);
  });

  test("the canvas overlays do not collide on a narrow tank", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");
    await page.waitForTimeout(3000);
    const overlap = await page.evaluate(() => {
      const hint = document.querySelector(".stageHint")?.getBoundingClientRect();
      const fig = document.querySelector(".figLabel")?.getBoundingClientRect();
      if (!hint || !fig) return false;
      return !(hint.right < fig.left || fig.right < hint.left);
    });
    expect(overlap).toBe(false);
  });

  test("scrolling the control column does not carry the page with it", async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 820 });
    await page.goto("/");
    await page.waitForTimeout(3000);
    const panel = await page.locator(".panel").boundingBox();
    await page.mouse.move(panel!.x + panel!.width / 2, panel!.y + panel!.height / 2);
    for (let i = 0; i < 14; i++) await page.mouse.wheel(0, 300);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(0);
  });
});
