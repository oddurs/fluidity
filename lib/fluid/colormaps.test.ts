import { test } from "node:test";
import assert from "node:assert/strict";
import { equalize, ink, INK_CYCLE, luma, RAMPS, sample, scale } from "./colormaps.ts";

const inGamut = (c: number[]) => c.every((v) => v >= 0 && v <= 1);

test("every ramp samples in gamut across its whole range", () => {
  for (const [name, ramp] of Object.entries(RAMPS)) {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      assert.ok(inGamut(sample(ramp, t)), `${name} @ ${t.toFixed(2)}`);
    }
  }
});

test("sampling clamps outside 0..1 instead of extrapolating", () => {
  for (const ramp of Object.values(RAMPS)) {
    assert.deepEqual(sample(ramp, -5), sample(ramp, 0));
    assert.deepEqual(sample(ramp, 5), sample(ramp, 1));
  }
});

test("equalize brings colours to a common luminance", () => {
  // Streaklines rely on this: an un-equalized ramp loses its dark end
  // against black.
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const c = equalize(sample(RAMPS.plasma, t), 0.45);
    assert.ok(inGamut(c), `out of gamut at ${t}`);
    assert.ok(Math.abs(luma(c) - 0.45) < 0.12, `luma ${luma(c).toFixed(2)} at ${t}`);
  }
});

test("equalize survives a black input", () => {
  const c = equalize([0, 0, 0], 0.5);
  assert.ok(inGamut(c) && luma(c) > 0);
});

test("the ink cycle is stable and gives distinguishable neighbours", () => {
  assert.equal(ink(0), INK_CYCLE[0]);
  assert.equal(ink(INK_CYCLE.length), INK_CYCLE[0]);
  assert.equal(ink(-1), INK_CYCLE[1]);
  for (let i = 0; i < INK_CYCLE.length; i++) {
    const a = INK_CYCLE[i];
    const b = INK_CYCLE[(i + 1) % INK_CYCLE.length];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    assert.ok(d > 0.35, `inks ${i} and ${i + 1} are too close (${d.toFixed(2)})`);
  }
});

test("scale is linear and never produces NaN", () => {
  const c = scale([0.5, 0.25, 1], 0.5);
  assert.deepEqual(c, [0.25, 0.125, 0.5]);
  assert.ok(scale([1, 1, 1], 0).every((v) => v === 0));
});
