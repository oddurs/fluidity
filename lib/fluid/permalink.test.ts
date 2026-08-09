import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeState, encodeState } from "./permalink.ts";
import { DEFAULT_PARAMS, type SimParams } from "./engine.ts";

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
