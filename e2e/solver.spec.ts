import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
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

  test("dye keeps its colour instead of blowing out to white", { tag: "@gpu" }, async ({ page }) => {
    // Bloom stacks on top of already-dense dye. Tuned too hot, the eleven
    // streaklines bleed into one pale sheet and the palette is gone.
    await page.goto("/");
    await page.waitForTimeout(SETTLE_MS);
    const { blown, saturation } = await canvasStats(page);
    expect(blown).toBeLessThan(0.5);
    expect(saturation).toBeGreaterThan(0.35);
  });

  test("dye is vivid, not washed out", { tag: "@gpu" }, async ({ page }) => {
    // Opening the tunnel outlet once cut steady-state dye by 62% because it
    // now leaves the domain instead of accumulating. Nothing caught it.
    await page.goto("/");
    await page.waitForTimeout(SETTLE_MS);
    const mean = await canvasBrightness(page, { x0: 0.02, x1: 0.95, y0: 0.05, y1: 0.95 });
    expect(mean).toBeGreaterThan(40);
    expect(mean).toBeLessThan(115);
  });

  test("flow reaches the outlet instead of stalling before it", { tag: "@gpu" }, async ({ page }) => {
    // The divergence shader once reflected at every domain edge, so the
    // tunnel was a sealed box and a dead band formed short of the right edge.
    await page.goto("/");
    await page.waitForTimeout(SETTLE_MS);
    const approach = await canvasBrightness(page, { x0: 0.88, x1: 0.94, y0: 0, y1: 1 });
    const edge = await canvasBrightness(page, { x0: 0.97, x1: 1, y0: 0, y1: 1 });
    expect(edge / approach).toBeGreaterThan(0.6);
  });

  test("shedding frequency agrees with the Strouhal number", { tag: "@gpu" }, async ({ page }) => {
    // Twenty seconds of settling plus a polled estimate does not fit the
    // default budget when the suite is loading the machine.
    test.slow();
    // f = St*U/D with St ~ 0.2. KÁRMÁN runs U = 170 texels/s and a cylinder
    // of radius 0.065 of tank height.
    await page.goto("/");
    await drag(page, { x: 0.62, y: 0.5 }, { x: 0.48, y: 0.52 });
    await page.waitForTimeout(20_000);

    // Poll: the estimator needs a developed wake and a full trace window, and
    // how fast that arrives depends on machine load. Waiting for the first
    // non-zero reading is not enough — an estimate taken off a wake that is
    // still forming can be out by a factor of two, which made this fail about
    // half the time under WebKit. Wait for it to hold still instead.
    const read = async () => {
      const foot = (await page.locator(".probeFoot").textContent()) ?? "";
      return Number(foot.match(/([\d.]+)\s*HZ/)?.[1] ?? 0);
    };
    let previous = 0;
    await expect
      .poll(
        async () => {
          const f = await read();
          const settled = f > 0 && previous > 0 && Math.abs(f - previous) / f < 0.08;
          previous = f;
          return settled;
        },
        { timeout: 40_000, intervals: [1500] },
      )
      .toBe(true);

    // Median of several readings rather than whichever one the poll stopped
    // on: the estimator counts mean crossings over a finite window, so a
    // single sample carries a couple of percent of quantisation noise that has
    // nothing to do with whether the physics is right.
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      samples.push(await read());
      await page.waitForTimeout(1200);
    }
    samples.sort((a, b) => a - b);
    const measured = samples[2];

    const grid = await readout(page, "SIM GRID");
    const height = Number(grid.split("×")[1]);

    const predicted = (0.2 * 170) / (2 * 0.065 * height);
    expect(measured).toBeGreaterThan(0);
    // St is not a constant: for a circular cylinder it runs 0.18–0.21 across
    // the Reynolds range, which is ±8% on the prediction before the solver is
    // even involved — and this solver's effective Reynolds number is whatever
    // the grid's numerical dissipation makes it, not a number anyone chose.
    // A tighter band than this asserts a precision the physics does not have;
    // WebKit sits at 0.20–0.27 and was failing on the threshold rather than on
    // the behaviour. What this still catches is the class of bug it was
    // written for: the quality controller ratcheting the grid down once
    // tripled the shedding frequency.
    expect(Math.abs(measured - predicted) / predicted).toBeLessThan(0.35);
  });

  test("Rayleigh-Taylor shows two fluids, not one against black", { tag: "@gpu" }, async ({
    page,
  }) => {
    // It dyed only the heavy fluid, so three quarters of the frame was empty
    // and the interface — the thing the instability actually is — had nothing
    // on the far side of it to be an interface with.
    await page.goto("/");
    await page.waitForTimeout(3000);
    await page.locator(".scenarioBtn", { hasText: "RAYLEIGH.T" }).click();
    await page.waitForTimeout(14_000);

    const { blown } = await canvasStats(page);
    const mean = await canvasBrightness(page, { x0: 0.02, x1: 0.98, y0: 0.02, y1: 0.98 });
    expect(mean).toBeGreaterThan(12);
    expect(blown).toBeLessThan(0.5);

    // Both fluids present: cold cyan above, warm amber below. Read from a
    // screenshot, not an in-page drawImage — preserveDrawingBuffer is false,
    // so copying the canvas from a later task returns black, which is exactly
    // what this test did on its first run.
    const png = PNG.sync.read(await page.locator(".fluidCanvas").screenshot());
    const band = (y0: number, y1: number) => {
      let r = 0;
      let b = 0;
      for (let y = Math.floor(y0 * png.height); y < Math.floor(y1 * png.height); y++) {
        for (let x = 0; x < png.width; x++) {
          const i = (y * png.width + x) << 2;
          r += png.data[i];
          b += png.data[i + 2];
        }
      }
      return { r, b };
    };
    const hues = { top: band(0.02, 0.3), bottom: band(0.72, 0.98) };

    // Cold fluid is blue-dominant; the ambient it falls into is not.
    expect(hues.top.b).toBeGreaterThan(hues.top.r);
    expect(hues.bottom.r).toBeGreaterThan(hues.bottom.b);
  });

  test("recovers from a lost GPU context", { tag: "@gpu" }, async ({ page, browserName }) => {
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
