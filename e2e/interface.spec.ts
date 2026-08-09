import { expect, test } from "@playwright/test";
import { pressedIn, readout } from "./helpers";

test.describe("interface", () => {
  test("a TRY IT action drives the solver and shows what it changed", async ({ page }) => {
    await page.goto("/");
    await page.locator("#sec-01").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "RUN: FROZEN INK" }).click();

    // It must say which controls moved; the action is otherwise invisible.
    const flashed = page.locator(".sliderRowChanged");
    await expect(flashed).toHaveCount(2);
    await expect(flashed.first()).toContainText("DYE FADE");
    await expect(page.locator(".sliderRow", { hasText: "DYE FADE" })).toContainText("0.00");
    // And it must clear itself.
    await expect(page.locator(".sliderRowChanged")).toHaveCount(0, { timeout: 4000 });
  });

  test("keyboard shortcuts drive scenario and field", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(3000);
    await page.keyboard.press("2");
    await page.keyboard.press("c");
    await expect.poll(() => pressedIn(page, ".scenarioBtn")).toContain("WING");
    await expect.poll(() => pressedIn(page, ".viewBtn")).toContain("CURL");
  });

  test("a permalink restores a non-default configuration", async ({ page }) => {
    await page.goto("/#s=wing&v=curl&c=41&b=0&a=28&f=0.5&g=0.02&j=12&r=0.028");
    await page.waitForTimeout(4000);
    expect(await pressedIn(page, ".scenarioBtn")).toContain("WING");
    expect(await pressedIn(page, ".viewBtn")).toContain("CURL");
    await expect(page.locator(".sliderRow", { hasText: "ANGLE" })).toContainText("28°");
    await expect(page.locator(".sliderRow", { hasText: "JACOBI" })).toContainText("12");
  });

  test("an out-of-range permalink cannot drive the solver out of bounds", async ({ page }) => {
    // Unclamped, #j=100000 asks for 100k GPU passes a frame and hangs the tab.
    await page.goto("/#s=karman&j=100000&c=-9999");
    await page.waitForTimeout(5000);
    await expect(page.locator(".sliderRow", { hasText: "JACOBI" })).toContainText("60");
    await expect(page.locator(".sliderRow", { hasText: "VORTICITY" })).toContainText("0");
    // Still running, not wedged.
    expect(Number(await readout(page, "FPS"))).toBeGreaterThan(5);
  });

  test("the simulation idles when scrolled out of sight", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(4000);
    expect(await readout(page, "STATE")).toBe("RUNNING");
    await page.locator("#sec-03").scrollIntoViewIfNeeded();
    await expect.poll(() => readout(page, "STATE")).toBe("IDLE");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => readout(page, "STATE")).toBe("RUNNING");
  });

  test("the probe readout never resizes or jumps", async ({ page }) => {
    // It reports four values that change ten times a second. Set as a
    // run-on line, every changing digit — and every field that blinked in and
    // out — resized the whole tag, so it shimmered constantly.
    await page.goto("/");
    await page.waitForTimeout(12_000);
    const boxes: string[] = [];
    for (let i = 0; i < 12; i++) {
      boxes.push(
        await page.evaluate(() => {
          const r = document.querySelector(".probeTag")!.getBoundingClientRect();
          return [r.width, r.height, r.left, r.top].map(Math.round).join(",");
        }),
      );
      await page.waitForTimeout(180);
    }
    expect(new Set(boxes).size).toBe(1);
  });

  test("every contents entry resolves to a section", async ({ page }) => {
    await page.goto("/");
    const missing = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>(".contents a")]
        .map((a) => a.getAttribute("href")!.slice(1))
        .filter((id) => !document.getElementById(id)),
    );
    expect(missing).toEqual([]);
  });

  test("equations are numbered uniquely and in order", async ({ page }) => {
    await page.goto("/");
    const nums = await page.locator(".eqNum").allTextContents();
    expect(nums.length).toBeGreaterThan(10);
    expect(nums).toEqual(nums.map((_, i) => `EQ.${String(i + 1).padStart(2, "0")}`));
  });
});
