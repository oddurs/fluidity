import { expect, test } from "@playwright/test";

// What the app does when things go wrong, and what it does for a reader who
// has asked the platform to calm down. Neither had any coverage.

test.describe("robustness", () => {
  test("no WebGL2 says so, and leaves the essay standing", async ({ page }) => {
    // The app's known failure is a browser that cannot give it a WebGL2
    // context, and it handles that itself rather than throwing: it says what
    // happened, in place, at the size of the thing it replaced.
    //
    // Which is also why the error boundary around the stage has no test here.
    // It is a backstop for the errors nobody predicted, and a synthetic GPU
    // failure does not reach it — the engine catches that one first. Anything
    // that did reach it would be, by definition, not this.
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind: string, ...rest: unknown[]) {
        // Only the simulation's context: the plate export and the tests' own
        // 2D readbacks have to keep working.
        if (kind === "webgl2") return null;
        return (real as (...a: unknown[]) => unknown).call(this, kind, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await page.goto("/");
    await expect(page.locator(".glError")).toBeVisible();
    await expect(page.locator(".glErrorTitle")).toContainText(/SOLVER OFFLINE/i);
    // It names what to do about it rather than only what went wrong.
    await expect(page.locator(".glError")).toContainText(/WebGL2/i);

    // Nothing else is announced as broken, and no overlay is left pointing at
    // a canvas that is not there.
    await expect(page.locator(".annotations")).toHaveCount(0);

    // The essay never needed the solver.
    const essay = await page.locator("#sec-00").textContent();
    expect((essay ?? "").length).toBeGreaterThan(200);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
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

    // Chrome that merely decorates stands down. Only what is actually on
    // screen counts: the scrolling ticker is hidden outright and replaced by
    // a static line, and an element set to display:none keeps its
    // animation-name without ever animating anything.
    const animated = await page.evaluate(() => {
      const names: string[] = [];
      for (const el of document.querySelectorAll(".panelBlock, .scrollCueTicker, .btn")) {
        const s = getComputedStyle(el);
        const rendered = s.display !== "none" && s.visibility !== "hidden";
        if (rendered && s.animationName !== "none" && s.animationDuration !== "0s") {
          names.push(`${el.className}:${s.animationName}`);
        }
      }
      return names;
    });
    expect(animated, `still animating: ${animated.join(", ")}`).toEqual([]);
  });

  test("the page survives a scenario switch mid-recording", { tag: "@gpu" }, async ({ page }) => {
    // The recorder paints from inside the render loop and holds a stream
    // open. Changing the tank underneath it must not throw.
    //
    // Tagged @gpu like the rest of clip capture: it records six seconds of a
    // live canvas and waits for the encoder, which on a software renderer
    // does not finish inside any budget worth setting.
    test.slow();
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
