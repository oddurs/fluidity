import { expect, test } from "@playwright/test";
import { canvasBrightness, canvasStats, drag, readout, SETTLE_MS } from "./helpers";

// These assert physical behaviour of the solver, not pixels. Each one stands
// in for a bug that actually shipped.

test.describe("solver", () => {
  test("boots and simulates without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto("/");
    await expect(page.locator(".fluidCanvas")).toBeVisible();
    await expect(page.locator(".glError")).toHaveCount(0);
    await page.waitForTimeout(SETTLE_MS);

    // The tank must contain something, and it must be changing.
    const a = await page.locator(".fluidCanvas").screenshot();
    await page.waitForTimeout(900);
    const b = await page.locator(".fluidCanvas").screenshot();
    expect(Buffer.compare(a, b)).not.toBe(0);
    expect(errors).toEqual([]);
  });

  test("dye keeps its colour instead of blowing out to white", async ({ page }) => {
    // Bloom stacks on top of already-dense dye. Tuned too hot, the eleven
    // streaklines bleed into one pale sheet and the palette is gone.
    await page.goto("/");
    await page.waitForTimeout(SETTLE_MS);
    const { blown, saturation } = await canvasStats(page);
    expect(blown).toBeLessThan(0.5);
    expect(saturation).toBeGreaterThan(0.35);
  });

  test("dye is vivid, not washed out", async ({ page }) => {
    // Opening the tunnel outlet once cut steady-state dye by 62% because it
    // now leaves the domain instead of accumulating. Nothing caught it.
    await page.goto("/");
    await page.waitForTimeout(SETTLE_MS);
    const mean = await canvasBrightness(page, { x0: 0.02, x1: 0.95, y0: 0.05, y1: 0.95 });
    expect(mean).toBeGreaterThan(40);
    expect(mean).toBeLessThan(115);
  });

  test("flow reaches the outlet instead of stalling before it", async ({ page }) => {
    // The divergence shader once reflected at every domain edge, so the
    // tunnel was a sealed box and a dead band formed short of the right edge.
    await page.goto("/");
    await page.waitForTimeout(SETTLE_MS);
    const approach = await canvasBrightness(page, { x0: 0.88, x1: 0.94, y0: 0, y1: 1 });
    const edge = await canvasBrightness(page, { x0: 0.97, x1: 1, y0: 0, y1: 1 });
    expect(edge / approach).toBeGreaterThan(0.6);
  });

  test("shedding frequency agrees with the Strouhal number", async ({ page }) => {
    // f = St*U/D with St ~ 0.2. KÁRMÁN runs U = 170 texels/s and a cylinder
    // of radius 0.065 of tank height.
    await page.goto("/");
    await drag(page, { x: 0.62, y: 0.5 }, { x: 0.48, y: 0.52 });
    await page.waitForTimeout(20_000);

    // Poll: the estimator needs a developed wake and a full trace window, and
    // how fast that arrives depends on machine load.
    const read = async () => {
      const foot = (await page.locator(".probeFoot").textContent()) ?? "";
      return Number(foot.match(/([\d.]+)\s*HZ/)?.[1] ?? 0);
    };
    await expect.poll(read, { timeout: 25_000, intervals: [1000] }).toBeGreaterThan(0);
    const measured = await read();
    const grid = await readout(page, "SIM GRID");
    const height = Number(grid.split("×")[1]);

    const predicted = (0.2 * 170) / (2 * 0.065 * height);
    expect(measured).toBeGreaterThan(0);
    expect(Math.abs(measured - predicted) / predicted).toBeLessThan(0.25);
  });

  test("recovers from a lost GPU context", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "WEBGL_lose_context is driven reliably only here");
    await page.goto("/");
    await page.waitForTimeout(6000);

    await page.evaluate(() => {
      const gl = (document.querySelector(".fluidCanvas") as HTMLCanvasElement).getContext("webgl2");
      (window as unknown as { __ext: WEBGL_lose_context }).__ext =
        gl!.getExtension("WEBGL_lose_context")!;
      (window as unknown as { __ext: WEBGL_lose_context }).__ext.loseContext();
    });
    await expect(page.locator(".flashHold")).toBeVisible();

    await page.evaluate(() =>
      (window as unknown as { __ext: WEBGL_lose_context }).__ext.restoreContext(),
    );
    await expect(page.locator(".flashHold")).toHaveCount(0);
    await page.waitForTimeout(SETTLE_MS);
    // Simulating again, not a frozen black canvas.
    expect(await canvasBrightness(page)).toBeGreaterThan(10);
  });
});
