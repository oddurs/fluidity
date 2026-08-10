import { test } from "node:test";
import assert from "node:assert/strict";
import { clampParam, clampTank, PARAM_BOUNDS, TANK_BOUNDS } from "./params.ts";

test("solver parameters clamp to their bounds", () => {
  // A permalink is untrusted input. `#j=100000` once asked the render loop
  // for a hundred thousand GPU passes per frame and took the tab with it.
  assert.equal(clampParam("pressureIterations", 100_000), PARAM_BOUNDS.pressureIterations.max);
  assert.equal(clampParam("pressureIterations", -5), PARAM_BOUNDS.pressureIterations.min);
  assert.equal(clampParam("attackAngleDeg", 0), 0);
});

test("tank quantities clamp to their bounds", () => {
  // The canvas callouts are controls now, and a drag can travel a long way
  // past the edge of the tag. Same rule as the sliders: this file owns the
  // range and nothing gets out of it.
  assert.equal(clampTank("windSpeed", 1e6), TANK_BOUNDS.windSpeed.max);
  assert.equal(clampTank("windSpeed", -1e6), TANK_BOUNDS.windSpeed.min);
  assert.equal(clampTank("obstacleRadius", 5), TANK_BOUNDS.obstacleRadius.max);
  assert.equal(clampTank("obstacleRadius", -5), TANK_BOUNDS.obstacleRadius.min);
  assert.equal(clampTank("windSpeed", 170), 170);
});

test("every bound is orderable and has a usable step", () => {
  for (const [name, b] of Object.entries({ ...PARAM_BOUNDS, ...TANK_BOUNDS })) {
    assert.ok(b.min < b.max, `${name}: min is not below max`);
    assert.ok(b.step > 0, `${name}: step must advance`);
    assert.ok(b.step <= b.max - b.min, `${name}: one step overshoots the range`);
  }
});
