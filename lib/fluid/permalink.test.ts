import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeState, encodeState } from "./permalink.ts";
import { DEFAULT_PARAMS, type SimParams } from "./engine.ts";
import { TANK_BOUNDS } from "./params.ts";

const params: SimParams = {
  ...DEFAULT_PARAMS,
  curl: 41,
  buoyancy: 12,
  attackAngleDeg: 28,
  pressureIterations: 12,
};

test("a configuration survives a round trip", () => {
  const cmd = decodeState("#" + encodeState("wing", "curl", params));
  assert.equal(cmd?.scenario, "wing");
  assert.equal(cmd?.view, "curl");
  assert.equal(cmd?.params?.curl, 41);
  assert.equal(cmd?.params?.attackAngleDeg, 28);
  assert.equal(cmd?.params?.pressureIterations, 12);
});

test("an empty or absent hash decodes to nothing", () => {
  assert.equal(decodeState(""), null);
  assert.equal(decodeState("#"), null);
});

test("unknown keys are ignored rather than trusted", () => {
  const cmd = decodeState("#s=wing&nonsense=1&__proto__=x");
  assert.equal(cmd?.scenario, "wing");
  assert.equal(cmd?.params, undefined);
});

test("a scenario id that is not a bare word is rejected", () => {
  for (const bad of ["<script>", "../../etc", "a b", "WING", "wing;rm"]) {
    assert.equal(decodeState(`#s=${encodeURIComponent(bad)}`)?.scenario, undefined, bad);
  }
});

test("an unknown view is rejected", () => {
  assert.equal(decodeState("#v=hologram")?.view, undefined);
});

test("non-finite parameter values are rejected", () => {
  for (const bad of ["abc", "NaN", "Infinity", "-Infinity", ""]) {
    assert.equal(decodeState(`#c=${bad}`)?.params?.curl, undefined, bad);
  }
});

test("parameters are clamped to the range the controls allow", () => {
  // A hand-edited link must not be able to drive the solver out of bounds.
  assert.equal(decodeState("#c=99999")?.params?.curl, 60);
  assert.equal(decodeState("#c=-40")?.params?.curl, 0);
  assert.equal(decodeState("#j=100000")?.params?.pressureIterations, 60);
  assert.equal(decodeState("#a=-900")?.params?.attackAngleDeg, -35);
});

test("the encoded link stays short and readable", () => {
  const s = encodeState("karman", "dye", DEFAULT_PARAMS);
  assert.ok(s.length < 90, `link too long: ${s.length}`);
  assert.ok(!/%/.test(s), "link should need no escaping");
});

test("a link carries the quantities the canvas callouts set", () => {
  // The callouts are controls, and COPY LINK claimed to reproduce what you
  // were looking at while dropping both of them on the floor.
  const hash = encodeState("karman", "dye", DEFAULT_PARAMS, {
    windSpeed: 245,
    obstacleRadius: 0.0925,
  });
  const back = decodeState("#" + hash);
  assert.equal(back?.tank?.windSpeed, 245);
  assert.equal(back?.tank?.obstacleRadius, 0.0925);
});

test("a link cannot drive the tank out of bounds either", () => {
  const out = decodeState("#s=karman&u=99999&d=9");
  assert.equal(out?.tank?.windSpeed, TANK_BOUNDS.windSpeed.max);
  assert.equal(out?.tank?.obstacleRadius, TANK_BOUNDS.obstacleRadius.max);
});

test("a scenario with no obstacle writes no diameter", () => {
  const hash = encodeState("plume", "dye", DEFAULT_PARAMS, {
    windSpeed: 0,
    obstacleRadius: 0,
  });
  assert.ok(!hash.includes("d="), hash);
  assert.ok(!hash.includes("u="), hash);
});
