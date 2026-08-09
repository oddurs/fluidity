import { test } from "node:test";
import assert from "node:assert/strict";
import { estimatePitch } from "./tone.ts";

const HZ = 40;
const N = 160;
const wave = (f: number, amp: number, noise = 0) =>
  Array.from({ length: N }, (_, i) =>
    amp * Math.sin(2 * Math.PI * f * (i / HZ)) + (Math.random() - 0.5) * noise);

test("recovers a known frequency across the shedding range", () => {
  for (const f of [0.75, 1.5, 2.5, 4]) {
    const { freq } = estimatePitch(wave(f, 8), HZ);
    const err = Math.abs(freq - f) / f;
    assert.ok(err < 0.05, `${f}Hz read as ${freq.toFixed(2)}Hz (${(err * 100).toFixed(1)}%)`);
  }
});

test("stays silent on noise rather than inventing a note", () => {
  const { freq, strength } = estimatePitch(
    Array.from({ length: N }, () => (Math.random() - 0.5) * 0.4), HZ);
  assert.equal(freq, 0);
  assert.equal(strength, 0);
});

test("stays silent on a flat trace", () => {
  assert.equal(estimatePitch(Array(N).fill(3.2), HZ).freq, 0);
});

test("finds the signal under heavy noise", () => {
  const { freq } = estimatePitch(wave(1.5, 8, 6), HZ);
  assert.ok(Math.abs(freq - 1.5) < 0.4, `read ${freq}`);
});

test("amplitude modulation biases the estimate low, but boundedly", () => {
  // A real vortex street does not arrive at the probe as a constant-amplitude
  // sine: the wake meanders. Cycles that fall below the hysteresis band go
  // uncounted, so the estimate reads low — about 20% on this trace.
  //
  // This pins that limitation rather than claiming it is fixed. The obvious
  // repair, taking the median interval between crossings instead of counting
  // them, was tried and reverted: see the note in tone.ts, it reads high on
  // real traces and was worse overall. Autocorrelation would fix it properly.
  // Until then the number is honest to within a fifth, which the readout's
  // two decimal places rather oversell.
  const f = 1.5;
  const breathing = Array.from({ length: N }, (_, i) => {
    const t = i / HZ;
    const envelope = 1 + 0.85 * Math.sin(2 * Math.PI * 0.25 * t);
    return 8 * envelope * Math.sin(2 * Math.PI * f * t);
  });
  const { freq } = estimatePitch(breathing, HZ);
  const err = Math.abs(freq - f) / f;
  assert.ok(err < 0.25, `${f}Hz read as ${freq.toFixed(2)}Hz (${(err * 100).toFixed(1)}%)`);
});

test("a trace too short to judge reports nothing", () => {
  assert.equal(estimatePitch([1, 2, 3], HZ).freq, 0);
});

test("never returns a non-finite pitch", () => {
  // A NaN would reach AudioParam.setTargetAtTime and throw.
  for (const t of [[], [NaN, NaN, NaN, NaN], Array(N).fill(0)]) {
    const { freq, strength } = estimatePitch(t as number[], HZ);
    assert.ok(Number.isFinite(freq) && Number.isFinite(strength));
  }
});
