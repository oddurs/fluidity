import { expect, test } from "@playwright/test";
import { readout } from "./helpers";

// COPY LINK claims a link reproduces what you were looking at. The encoder is
// unit-tested; this asserts the claim end to end, through a real reload —
// which is where it was quietly false, because the two quantities the canvas
// callouts set were never written into the hash at all.

const speed = async (page: import("@playwright/test").Page) =>
  Number((await page.locator(".inletTag").innerText()).match(/(\d+)\s*CELLS/)?.[1] ?? 0);

const diameterPx = (page: import("@playwright/test").Page) =>
  page.locator(".dimLine").evaluate((e) => Math.round(e.getBoundingClientRect().height));

test.describe("permalinks", () => {
  test("a copied link reproduces the tank, not just the scenario", async ({ page }) => {
    // Two full page loads with a settle each, plus eleven key presses. Alone
    // that is seconds; on the software renderer CI runs it is not.
    test.slow();
    await page.goto("/");
    await page.waitForTimeout(4000);

    // Move both callouts off their defaults, and a slider besides.
    await page.locator(".inletTag").focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
    await page.locator(".dimTag").focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowUp");

    const wantSpeed = await speed(page);
    const wantDiameter = await diameterPx(page);
    expect(wantSpeed).not.toBe(170);

    // COPY LINK writes the hash; read it from the address bar rather than the
    // clipboard, which needs permissions that differ per engine.
    await page.locator(".btn", { hasText: "LINK" }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).not.toBe("");
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toMatch(/u=/);
    expect(hash).toMatch(/d=/);

    // A fresh load of that link has to land in the same place.
    await page.goto(`/${hash}`);
    await page.waitForTimeout(4500);
    expect(await speed(page)).toBe(wantSpeed);
    expect(Math.abs((await diameterPx(page)) - wantDiameter)).toBeLessThan(3);
  });

  test("a hand-edited link cannot drive the tank out of range", async ({ page }) => {
    // A link is untrusted input. #j=100000 once asked the render loop for a
    // hundred thousand GPU passes a frame and took the tab with it.
    await page.goto("/#s=karman&v=dye&j=100000&u=99999&d=9&c=-500");
    await page.waitForTimeout(4500);

    expect(await speed(page)).toBe(400);
    expect(Number(await readout(page, "SIM GRID").then((t) => t!.split("×")[0]))).toBeGreaterThan(0);
    // Still solving, rather than wedged behind an impossible iteration count.
    expect(await readout(page, "STATE")).toBe("RUNNING");
    const iter = await page
      .locator(".sliderRow", { hasText: "JACOBI ITER" })
      .locator(".sliderValue")
      .textContent();
    expect(Number(iter)).toBeLessThanOrEqual(60);
  });

  test("a link with no tank values leaves the scenario's own", async ({ page }) => {
    // Older links exist, and a scenario has to be free to set its own tank.
    await page.goto("/#s=karman&v=dye");
    await page.waitForTimeout(4500);
    expect(await speed(page)).toBe(170);
  });
});
