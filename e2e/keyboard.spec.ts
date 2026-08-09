import { expect, test } from "@playwright/test";

// Every button and slider was already reachable by keyboard. The interaction
// the whole app is built around — stirring, moving the cylinder, placing the
// probe — was not. These assert it is.

const probeCoord = (page: import("@playwright/test").Page) =>
  page.locator(".probeCoord").textContent();

test.describe("keyboard control of the tank", () => {
  test("the tank is reachable by tab and takes focus", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(3000);
    await page.keyboard.press("Tab");
    await expect(page.locator(".fluidCanvas")).toBeFocused();
  });

  test("arrows move the probe", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(4000);
    await page.locator(".fluidCanvas").focus();
    const before = await probeCoord(page);
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
    await expect.poll(() => probeCoord(page)).not.toBe(before);
  });

  test("O switches to the obstacle and arrows carry it", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(4000);
    await page.locator(".fluidCanvas").focus();
    const top = () =>
      page.evaluate(() => Math.round(document.querySelector(".dimLine")!.getBoundingClientRect().top));
    const before = await top();
    await page.keyboard.press("o");
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowUp");
    await expect.poll(top).not.toBe(before);
    // And the probe should not have moved with it.
    const coord = await probeCoord(page);
    expect(coord).toContain("0.62");
  });

  test("Enter stirs, and the action is announced", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(4000);
    await page.locator(".fluidCanvas").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[role="status"][aria-live="polite"]')).toHaveText(/stirred/i);
  });

  test("arrows still scroll the page when the tank is not focused", async ({ page }) => {
    // The document is 14,000px long. Claiming arrows globally would break it.
    await page.goto("/");
    await page.waitForTimeout(3000);
    await page.locator(".scrollCue").focus();
    const before = await page.evaluate(() => window.scrollY);
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  });

  test("the tank describes itself in words", async ({ page }) => {
    await page.goto("/");
    // Long enough for the probe trace to fill and a frequency to be measured.
    await page.waitForTimeout(16_000);
    const text = await page
      .locator('section[aria-label="State of the simulation"] p')
      .textContent();

    // Not a static sentence: it must carry the actual state of the solver.
    expect(text).toContain("KÁRMÁN");
    expect(text).toMatch(/cylinder sits \d+ percent across/);
    expect(text).toMatch(/probe, \d+ percent across/);
    expect(text).toMatch(/reads speed \d+, pressure -?\d/);
    expect(text).toMatch(/oscillating at \d+\.\d+ hertz/);
  });

  test("the state account is not a live region", async ({ page }) => {
    // The solver changes four times a second; announcing that continuously
    // would make the page unusable with a screen reader.
    await page.goto("/");
    await page.waitForTimeout(3000);
    const live = await page.evaluate(() =>
      document
        .querySelector('section[aria-label="State of the simulation"]')
        ?.getAttribute("aria-live"),
    );
    expect(live).toBeNull();
  });
});
