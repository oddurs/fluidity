import { expect, test } from "@playwright/test";

// What the app does when things go wrong, and what it does for a reader who
// has asked the platform to calm down. Neither had any coverage.

test.describe("robustness", () => {
  test("a solver that throws does not take the essay with it", async ({ page }) => {
    // Before the error boundary, a throw anywhere in the stage unmounted the
    // whole document — canvas, controls and fourteen thousand pixels of prose
    // — to a white page with no indication anything had happened.
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind: string, ...rest: unknown[]) {
        // Only the simulation's context. The export plate and the tests'
        // own 2D readbacks must keep working.
        if (kind === "webgl2") throw new Error("synthetic GPU failure");
        return (real as (...a: unknown[]) => unknown).call(this, kind, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await page.goto("/");
    await page.waitForTimeout(2500);

    // The stage says what happened, in the interface's own voice.
    await expect(page.locator(".stageFailed")).toBeVisible();
    await expect(page.locator(".stageFailed")).toContainText(/TANK OFFLINE/i);

    // And the essay below is untouched, because it never needed the solver.
    await expect(page.locator("#sec-00")).toBeAttached();
    const essay = await page.locator("#sec-00").textContent();
    expect((essay ?? "").length).toBeGreaterThan(200);

    // The page is still a page: no horizontal overflow, still scrollable.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("the failure offers a way back rather than a dead end", async ({ page }) => {
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      let fail = true;
      // Fails once, so retrying can genuinely succeed — a button that cannot
      // work is worse than no button.
      (window as unknown as { __healGpu: () => void }).__healGpu = () => {
        fail = false;
      };
      HTMLCanvasElement.prototype.getContext = function (kind: string, ...rest: unknown[]) {
        if (kind === "webgl2" && fail) throw new Error("synthetic GPU failure");
        return (real as (...a: unknown[]) => unknown).call(this, kind, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await page.goto("/");
    await expect(page.locator(".stageFailed")).toBeVisible();
    await page.evaluate(() => (window as unknown as { __healGpu: () => void }).__healGpu());
    await page.locator(".stageFailed .btn").click();

    await expect(page.locator(".fluidCanvas")).toBeVisible();
    await expect(page.locator(".stageFailed")).toHaveCount(0);
  });

  test("reduced motion is honoured, and the tank still answers", async ({ page }) => {
    // DESIGN.md: motion must name its job, and every animation needs a
    // reduced-motion equivalent that still answers the same question. The
    // simulation is the subject, not decoration, so it keeps running.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(4000);

    const stillMoving = async () => {
      const a = await page.locator(".fluidCanvas").screenshot();
      await page.waitForTimeout(800);
      const b = await page.locator(".fluidCanvas").screenshot();
      return Buffer.compare(a, b) !== 0;
    };
    expect(await stillMoving()).toBe(true);

    // Chrome that merely decorates stands down.
    const animated = await page.evaluate(() => {
      const names: string[] = [];
      for (const el of document.querySelectorAll(".panelBlock, .scrollCueTicker, .btn")) {
        const s = getComputedStyle(el);
        if (s.animationName !== "none" && s.animationDuration !== "0s") {
          names.push(`${el.className}:${s.animationName}`);
        }
      }
      return names;
    });
    expect(animated, `still animating: ${animated.join(", ")}`).toEqual([]);
  });

  test("the page survives a scenario switch mid-recording", async ({ page }) => {
    // The recorder paints from inside the render loop and holds a stream
    // open. Changing the tank underneath it must not throw.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/");
    await page.waitForTimeout(4000);
    const supported = await page.evaluate(
      () =>
        typeof MediaRecorder !== "undefined" &&
        typeof HTMLCanvasElement.prototype.captureStream === "function",
    );
    test.skip(!supported, "no MediaRecorder in this engine");

    await page.locator(".btn", { hasText: "CLIP" }).click();
    await page.waitForTimeout(1500);
    await page.locator(".scenarioBtn", { hasText: "PLUME" }).click();
    await page.waitForTimeout(1500);
    await page.locator(".viewBtn", { hasText: "CURL" }).click();

    const download = await page.waitForEvent("download", { timeout: 40_000 });
    expect(await download.path()).toBeTruthy();
    expect(errors).toEqual([]);
  });
});
