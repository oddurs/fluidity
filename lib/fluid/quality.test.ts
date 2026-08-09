import { test } from "node:test";
import assert from "node:assert/strict";
import { QualityController, TIERS } from "./quality.ts";

const feed = (qc: QualityController, ms: number, n: number) => {
  for (let i = 0; i < n; i++) qc.sample(ms);
};

test("healthy frames never degrade quality", () => {
  const qc = new QualityController();
  feed(qc, 8, 2000);
  assert.equal(qc.index, 0);
});

/** Genuine GPU overload: coarser grids really do render faster. */
const overload = (qc: QualityController, start = 40, rounds = 400) => {
  feed(qc, 6, 200); // establish what this device can actually do
  let frame = start;
  for (let i = 0; i < rounds; i++) {
    if (qc.sample(frame)) frame *= 0.55;
  }
};

test("sustained slow frames step down under genuine load", () => {
  const qc = new QualityController();
  feed(qc, 6, 200);
  let frame = 40;
  for (let i = 0; i < 120; i++) {
    if (qc.sample(frame)) frame *= 0.55;
  }
  assert.equal(qc.index, 1);
});

test("the lowest tier is a floor", () => {
  // Load heavy enough that every step down helps and still misses budget.
  const qc = new QualityController();
  feed(qc, 6, 200);
  let frame = 400;
  for (let i = 0; i < 2000; i++) {
    if (qc.sample(frame)) frame *= 0.5;
  }
  assert.equal(qc.index, TIERS.length - 1);
  assert.ok(frame > 22, "test should still be over budget at the floor");
});

test("a brief hitch is forgiven", () => {
  // A scenario switch or a GC pause must not cost the user quality.
  const qc = new QualityController();
  feed(qc, 8, 100);
  feed(qc, 60, 20);
  feed(qc, 8, 100);
  assert.equal(qc.index, 0);
});

test("alternating fast and slow frames do not drift downward", () => {
  const qc = new QualityController();
  feed(qc, 8, 100);
  for (let i = 0; i < 2000; i++) qc.sample(i % 2 ? 40 : 8);
  assert.equal(qc.index, 0);
});

test("quality never improves on its own after a real drop", () => {
  // Frame time is vsync-capped, so headroom is not observable; probing
  // upward would be guesswork and would oscillate.
  const qc = new QualityController();
  overload(qc);
  const dropped = qc.index;
  assert.ok(dropped >= 1);
  feed(qc, 4, 5000);
  assert.equal(qc.index, dropped);
});

test("every tier is coarser than the one before it", () => {
  for (let i = 1; i < TIERS.length; i++) {
    assert.ok(TIERS[i].simResolution < TIERS[i - 1].simResolution);
    assert.ok(TIERS[i].dyeResolution < TIERS[i - 1].dyeResolution);
  }
});

test("a capped refresh rate is not mistaken for overload", () => {
  // Headless rendering, a 30Hz display, low-power mode and a throttled tab
  // all pin the frame time. Resolution cannot fix any of them, and treating
  // them as load ratcheted the solver down to a 96-cell grid on idle GPUs.
  for (const capped of [33.3, 50, 16.7]) {
    const qc = new QualityController();
    for (let i = 0; i < 4000; i++) qc.sample(capped + (i % 3) * 0.05);
    assert.equal(qc.index, 0, `${capped}ms cap degraded quality`);
  }
});

test("a step down that does not help is given back", () => {
  const qc = new QualityController();
  // Genuinely fast baseline, then a sustained stall that resolution cannot
  // fix — the frame time stays put no matter how coarse the grid gets.
  for (let i = 0; i < 200; i++) qc.sample(6);
  for (let i = 0; i < 2000; i++) qc.sample(40);
  assert.equal(qc.index, 0, "quality should have been returned and locked");
});

test("real GPU overload still steps down", () => {
  const qc = new QualityController();
  for (let i = 0; i < 200; i++) qc.sample(6);
  let frame = 40;
  for (let i = 0; i < 400; i++) {
    const dropped = qc.sample(frame);
    // A real bottleneck: each coarser tier genuinely renders faster.
    if (dropped) frame *= 0.5;
  }
  assert.ok(qc.index >= 1, "should have stepped down under true load");
});

test("garbage frame times are ignored", () => {
  const qc = new QualityController();
  for (const bad of [NaN, Infinity, -1, 0]) {
    for (let i = 0; i < 500; i++) qc.sample(bad);
  }
  assert.equal(qc.index, 0);
});
