import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// The app is about motion and could only export a frozen frame. These assert
// the clip is a real, decodable video of the right length and framing, and —
// the part that is easy to get wrong — that making it does not disturb the
// solver it is recording.

/** Read a named TELEMETRY value out of the panel. */
const readout = (page: import("@playwright/test").Page, label: string) =>
  page.locator(`.readouts div:has(dt:text-is("${label}")) dd`).textContent();

/** MediaRecorder + captureStream is not universal; skip rather than fail. */
async function captureSupported(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    if (typeof MediaRecorder === "undefined") return false;
    if (typeof HTMLCanvasElement.prototype.captureStream !== "function") return false;
    return ["video/webm;codecs=vp9", "video/webm", "video/mp4"].some((t) =>
      MediaRecorder.isTypeSupported(t),
    );
  });
}

test.describe("clip capture", () => {
  test("RECORD produces a decodable video of the right length and framing", { tag: "@gpu" }, async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(4000);
    test.skip(!(await captureSupported(page)), "no MediaRecorder in this engine");

    const downloadPromise = page.waitForEvent("download", { timeout: 40_000 });
    await page.getByRole("button", { name: "CLIP" }).click();

    // The button reports the capture is live, and reverts when it is not.
    await expect(page.getByRole("button", { name: "RECORDING" })).toBeVisible();

    const download = await downloadPromise;
    const path = await download.path();
    const bytes = readFileSync(path!);

    // A blank or header-only file would still "download". Six seconds of a
    // vortex street at 12Mbit is hundreds of kilobytes at minimum.
    expect(bytes.byteLength).toBeGreaterThan(100_000);
    expect(download.suggestedFilename()).toMatch(/^fluidity-karman-\d+\.(webm|mp4)$/);

    // And it decodes. MediaRecorder does not write a duration into the WebM
    // header, so the seek-to-the-end trick is needed to make one appear.
    const meta = await page.evaluate(async (data) => {
      const blob = new Blob([new Uint8Array(data)]);
      const v = document.createElement("video");
      v.src = URL.createObjectURL(blob);
      await new Promise((res, rej) => {
        v.onloadedmetadata = res;
        v.onerror = () => rej(new Error("undecodable"));
      });
      if (!Number.isFinite(v.duration)) {
        await new Promise((res) => {
          v.onseeked = res;
          v.currentTime = 1e6;
        });
      }
      return { duration: v.duration, w: v.videoWidth, h: v.videoHeight };
    }, Array.from(bytes));

    expect(meta.duration).toBeGreaterThan(4);
    expect(meta.duration).toBeLessThan(11);
    // Plate framing, not bare canvas: the header and data block add height, so
    // the clip must be taller than the specimen it contains.
    expect(meta.w).toBeGreaterThan(600);
    expect(meta.h).toBeGreaterThan(meta.w * 0.4);
  });

  test("recording does not degrade the tank it is recording", { tag: "@gpu" }, async ({ page }) => {
    // The compositor costs real time per frame. If the quality controller
    // reads that as GPU overload it drops the grid mid-clip, and the clip
    // records the degradation. It is suspended for the duration instead.
    await page.goto("/");
    await page.waitForTimeout(6000);
    test.skip(!(await captureSupported(page)), "no MediaRecorder in this engine");

    const gridBefore = await readout(page, "SIM GRID");

    const downloadPromise = page.waitForEvent("download", { timeout: 40_000 });
    await page.getByRole("button", { name: "CLIP" }).click();
    await page.waitForTimeout(3000);

    const gridDuring = await readout(page, "SIM GRID");
    const fpsDuring = Number(await readout(page, "FPS"));

    await downloadPromise;
    const gridAfter = await readout(page, "SIM GRID");

    expect(gridDuring).toBe(gridBefore);
    expect(gridAfter).toBe(gridBefore);
    // The solver must still be running at a usable rate, not stalled behind
    // the encoder.
    expect(fpsDuring).toBeGreaterThan(15);
  });

  test("the shortcut and the button are the same action", { tag: "@gpu" }, async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(4000);
    test.skip(!(await captureSupported(page)), "no MediaRecorder in this engine");

    await page.locator(".fluidCanvas").focus();
    await page.keyboard.press("m");
    await expect(page.getByRole("button", { name: "RECORDING" })).toBeVisible();

    // Pressing again mid-capture must not start a second recorder.
    await page.keyboard.press("m");
    await expect(page.getByRole("button", { name: "RECORDING" })).toBeVisible();

    const download = await page.waitForEvent("download", { timeout: 40_000 });
    expect(await download.path()).toBeTruthy();
    await expect(page.getByRole("button", { name: "CLIP" })).toBeVisible();
  });
});
