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

test("reads the true frequency when the wake breathes", () => {
  // A real vortex street does not arrive at the probe as a constant-amplitude
  // sine: the wake meanders. Counting crossings missed the quiet cycles and
  // read this 20% low, every time, in the same direction — the bias that sent
  // the shedding readout an octave out in the tank.
  const f = 1.5;
  const breathing = Array.from({ length: N }, (_, i) => {
    const t = i / HZ;
    const envelope = 1 + 0.85 * Math.sin(2 * Math.PI * 0.25 * t);
    return 8 * envelope * Math.sin(2 * Math.PI * f * t);
  });
  const { freq } = estimatePitch(breathing, HZ);
  const err = Math.abs(freq - f) / f;
  assert.ok(err < 0.08, `${f}Hz read as ${freq.toFixed(2)}Hz (${(err * 100).toFixed(1)}%)`);
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

test("does not report an octave down on a harmonic-rich trace", () => {
  // A wake is not a pure sine: it carries its own harmonics, and a signal
  // correlates with itself just as well at twice its period. Picking the
  // strongest match rather than the first good one reports half the rate.
  const f = 1.25;
  const rich = Array.from({ length: N }, (_, i) => {
    const t = i / HZ;
    return (
      8 * Math.sin(2 * Math.PI * f * t) +
      3.5 * Math.sin(2 * Math.PI * 2 * f * t + 0.7) +
      1.5 * Math.sin(2 * Math.PI * 3 * f * t + 1.9)
    );
  });
  const { freq } = estimatePitch(rich, HZ);
  const err = Math.abs(freq - f) / f;
  assert.ok(err < 0.08, `${f}Hz read as ${freq.toFixed(2)}Hz (${(err * 100).toFixed(1)}%)`);
});

test("recovers a frequency that falls between samples", () => {
  // 1.37 Hz at 40 Hz sampling is a period of 29.2 samples. Without
  // interpolating the peak the answer can only ever be 29 or 30.
  const { freq } = estimatePitch(wave(1.37, 8), HZ);
  assert.ok(Math.abs(freq - 1.37) / 1.37 < 0.03, `read ${freq.toFixed(3)}`);
});

test("a drifting baseline does not silence the estimate", () => {
  // Tank pressure wanders on a slower timescale than it oscillates. A sloping
  // baseline correlates with itself at every lag, flattening the peak the
  // period is read from — and the readout went quiet mid-experiment.
  const f = 1.5;
  const drifting = Array.from({ length: N }, (_, i) => {
    const t = i / HZ;
    return 8 * Math.sin(2 * Math.PI * f * t) + 26 * t - 14;
  });
  const { freq } = estimatePitch(drifting, HZ);
  assert.ok(freq > 0, "went silent on a drifting trace");
  assert.ok(Math.abs(freq - f) / f < 0.08, `read ${freq.toFixed(2)}`);
});
