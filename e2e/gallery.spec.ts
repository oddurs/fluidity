import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { canvasStats, readout } from "./helpers";

// Seven scenarios and five fields, and until now only two of the seven and
// one of the five were ever looked at by anything. A scenario that settles to
// black, or a field that renders the same picture as its neighbour, is a
// silent failure: the app keeps running and the telemetry keeps saying so.

const SCENARIOS = [
  "KÁRMÁN.ST",
  "WING",
  "INK.PLAY",
  "PLUME",
  "VORTEX.PAIR",
  "STORM",
  "RAYLEIGH.T",
];

const VIEWS = ["DYE", "VELOCITY", "PRESSURE", "CURL", "HEAT"];

/** Mean brightness and the share of the frame that is effectively empty. */
function frameStats(buffer: Buffer) {
  const png = PNG.sync.read(buffer);
  let sum = 0;
  let dark = 0;
  const n = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    const l = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
    sum += l;
    if (l < 12) dark++;
  }
  return { luma: sum / n, darkPct: (100 * dark) / n };
}

test.describe("the gallery", () => {
  for (const name of SCENARIOS) {
    test(`${name} renders something worth looking at`, { tag: "@gpu" }, async ({ page }) => {
      test.slow();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

      await page.goto("/");
      await page.waitForTimeout(3000);
      await page.locator(".scenarioBtn", { hasText: name }).click();
      await page.waitForTimeout(9000);

      const shot = await page.locator(".fluidCanvas").screenshot();
      const { luma, darkPct } = frameStats(shot);

      // Not black, not a white-out, and not mostly empty. These bounds are
      // deliberately loose — the scenarios are meant to look different from
      // each other — and exist to catch one that has stopped working at all.
      expect(luma, `${name} is too dark`).toBeGreaterThan(8);
      expect(darkPct, `${name} is mostly empty`).toBeLessThan(80);
      const { blown } = await canvasStats(page);
      expect(blown, `${name} is blown out`).toBeLessThan(0.5);

      // And it must still be moving: a frozen frame passes every check above.
      const a = await page.locator(".fluidCanvas").screenshot();
      await page.waitForTimeout(900);
      const b = await page.locator(".fluidCanvas").screenshot();
      expect(Buffer.compare(a, b), `${name} is frozen`).not.toBe(0);

      expect(errors).toEqual([]);
    });
  }

  test("every field shows a different picture", { tag: "@gpu" }, async ({ page }) => {
    // The X-rays read different textures out of the solver. If two of them
    // agree pixel for pixel, one is not reading what it says it is — which is
    // exactly what a copy-paste in the display shader would produce.
    test.slow();
    await page.goto("/");
    await page.waitForTimeout(6000);

    const seen = new Map<string, { luma: number; darkPct: number }>();
    for (const v of VIEWS) {
      await page.locator(".viewBtn", { hasText: v }).click();
      await page.waitForTimeout(2500);
      const shot = await page.locator(".fluidCanvas").screenshot();
      const stats = frameStats(shot);
      expect(stats.luma, `${v} renders black`).toBeGreaterThan(4);
      seen.set(v, stats);
    }

    // Compared by their statistics rather than byte equality: the solver moves
    // between captures, so two frames of the *same* field never match either.
    const lumas = [...seen.entries()];
    for (let i = 0; i < lumas.length; i++) {
      for (let j = i + 1; j < lumas.length; j++) {
        const [an, a] = lumas[i];
        const [bn, b] = lumas[j];
        const same =
          Math.abs(a.luma - b.luma) < 0.5 && Math.abs(a.darkPct - b.darkPct) < 0.5;
        expect(same, `${an} and ${bn} render the same picture`).toBe(false);
      }
    }
  });

  test("switching scenarios does not leave the last one behind", { tag: "@gpu" }, async ({
    page,
  }) => {
    // Every scenario sets its own tank on load. One that forgot to clear left
    // the previous dye in the field, which reads as the new scenario being
    // wrong rather than as a stale buffer.
    test.slow();
    await page.goto("/");
    await page.waitForTimeout(6000);
    await page.locator(".scenarioBtn", { hasText: "STORM" }).click();
    await page.waitForTimeout(8000);
    const busy = frameStats(await page.locator(".fluidCanvas").screenshot());

    await page.locator(".scenarioBtn", { hasText: "PLUME" }).click();
    // Immediately after the switch, before the new scenario has built up.
    await page.waitForTimeout(700);
    const justAfter = frameStats(await page.locator(".fluidCanvas").screenshot());
    expect(justAfter.luma, "the previous scenario is still in the tank").toBeLessThan(
      busy.luma * 0.75,
    );
  });

  test("the telemetry never reports a frame it did not draw", async ({ page }) => {
    // Telemetry never lies is a rule here. Paused, the readout must say so
    // rather than keep reporting the frame rate it had while running.
    await page.goto("/");
    await page.waitForTimeout(4000);
    expect(await readout(page, "STATE")).toBe("RUNNING");
    await page.locator(".btn", { hasText: "PAUSE" }).click();
    await expect.poll(() => readout(page, "STATE")).toBe("PAUSED");
    await page.locator(".btn", { hasText: "RESUME" }).click();
    await expect.poll(() => readout(page, "STATE")).toBe("RUNNING");
  });
});
