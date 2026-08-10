import { expect, test } from "@playwright/test";

// The canvas callouts wore the control panel's chip styling while doing
// nothing, and people reached for them expecting to drag. These assert the
// affordance is now honest — and that the info button living inside a drag
// handle still behaves like a button.

const speedText = (page: import("@playwright/test").Page) =>
  page.locator(".inletTag").innerText();

const speed = async (page: import("@playwright/test").Page) =>
  Number((await speedText(page)).match(/(\d+)\s*CELLS/)?.[1] ?? 0);

/** The dimension line is exactly the cylinder's diameter in pixels. */
const diameterPx = (page: import("@playwright/test").Page) =>
  page.locator(".dimLine").evaluate((e) => Math.round(e.getBoundingClientRect().height));

test.describe("draggable callouts", () => {
  test("dragging the freestream tag changes the speed it reports", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(4000);
    const before = await speed(page);
    expect(before).toBeGreaterThan(0);

    const box = (await page.locator(".inletTag").boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 230, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect.poll(() => speed(page)).toBeGreaterThan(before);
  });

  test("the speed cannot be driven outside its bounds", async ({ page }) => {
    // A callout is a control now, so it is subject to the same rule as every
    // other one: lib/fluid/params.ts owns the range and nothing exceeds it.
    //
    // The drag stops at the edge of the window rather than running far past
    // it, because Firefox reports clientX as 0 — not as the viewport edge —
    // for a pointer beyond the viewport, which reads as a large drag in the
    // opposite direction. A sweep across the tank is more than enough to
    // overshoot the top of the range anyway.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForTimeout(4000);

    const box = (await page.locator(".inletTag").boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(1278, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => speed(page)).toBe(400);

    // The tag sits at the left edge, so there is no room to drag back down
    // the same way. The keyboard reaches the other bound.
    await page.locator(".inletTag").focus();
    for (let i = 0; i < 90; i++) await page.keyboard.press("ArrowLeft");
    await expect.poll(() => speed(page)).toBe(20);
  });

  test("dragging the D callout resizes the cylinder", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(4000);
    const before = await diameterPx(page);

    const box = (await page.locator(".dimTag").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 80, { steps: 10 });
    await page.mouse.up();

    // Up grows it: the drag tracks the edge the handle sits on.
    await expect.poll(() => diameterPx(page)).toBeGreaterThan(before + 10);
  });

  test("the callouts take arrow keys, not just a pointer", async ({ page }) => {
    // Everything else in the tank is keyboard operable; a control that is
    // only reachable by dragging would be the one exception.
    await page.goto("/");
    await page.waitForTimeout(4000);
    await page.locator(".dimTag").focus();
    const before = await diameterPx(page);
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await expect.poll(() => diameterPx(page)).toBeLessThan(before);

    await page.locator(".inletTag").focus();
    const speedBefore = await speed(page);
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
    await expect.poll(() => speed(page)).toBeGreaterThan(speedBefore);
  });

  test("the callouts report themselves to assistive technology", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(4000);
    const dim = page.locator(".dimTag");
    await expect(dim).toHaveAttribute("role", "slider");
    await expect(dim).toHaveAttribute("aria-label", /diameter/i);

    const before = Number(await dim.getAttribute("aria-valuenow"));
    await dim.focus();
    await page.keyboard.press("ArrowUp");
    // The reported value tracks the cylinder, rather than being set once.
    await expect.poll(async () => Number(await dim.getAttribute("aria-valuenow"))).toBeGreaterThan(
      before,
    );
  });

  test("the info button inside a handle still opens its card", async ({ page }) => {
    // The button is a child of the drag handle, so a press on it reaches the
    // handle's pointerdown — which preventDefault'd the click away.
    await page.goto("/");
    await page.waitForTimeout(4000);
    const before = await diameterPx(page);

    await page.locator(".dimTag .infoDot").click();
    await expect(page.locator(".infoCard")).toBeVisible();
    // And pressing it did not quietly resize the cylinder.
    expect(await diameterPx(page)).toBe(before);
  });
});
