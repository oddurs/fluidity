// Aeolian tone: the sound the simulated flow is actually making.
//
// Section 06 explains why a wire sings in the wind — vortices shed at
// f ≈ 0.2·U/D, and that periodic pressure fluctuation is the note. The probe
// already samples pressure over time, so the pitch here is *measured* from
// the running solver rather than synthesised from the parameters. When
// nothing is shedding, there is nothing to hear.

export interface Pitch {
  /** Shedding frequency in Hz, as it happens in the tank. */
  freq: number;
  /** 0..1 oscillation strength; drives loudness. */
  strength: number;
}

/**
 * Estimate the dominant frequency of a pressure trace by counting mean
 * crossings. The trace is already low-passed on the way in, so this is
 * stable enough for a note and far cheaper than an FFT.
 */
export function estimatePitch(trace: number[], sampleHz: number): Pitch {
  const n = trace.length;
  if (n < 16) return { freq: 0, strength: 0 };

  let mean = 0;
  for (const v of trace) mean += v;
  mean /= n;

  let rms = 0;
  for (const v of trace) rms += (v - mean) * (v - mean);
  rms = Math.sqrt(rms / n);

  // Below this the trace is drift and grid noise, not an oscillation.
  if (rms < 0.35) return { freq: 0, strength: 0 };

  // Count crossings with a hysteresis band so noise around the mean does
  // not register as cycles. The first exceedance only establishes the sign,
  // so measure across the crossings actually seen rather than across the
  // whole window — dividing by the window undercounts by exactly one
  // crossing, a constant 0.125 Hz error at this trace length.
  const band = rms * 0.35;
  const at: number[] = [];
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const d = trace[i] - mean;
    if (sign <= 0 && d > band) {
      if (sign !== 0) at.push(i);
      sign = 1;
    } else if (sign >= 0 && d < -band) {
      if (sign !== 0) at.push(i);
      sign = -1;
    }
  }

  const strength = Math.min(1, rms / 6);
  if (at.length < 2) return { freq: 0, strength: 0 };

  // Cycles per second over the span actually observed. This averages across
  // every cycle in the window, which is what makes it hold steady on a real
  // pressure trace.
  //
  // Rejected: the median interval between crossings. It is the textbook
  // robust answer and it does fix the amplitude-modulation bias below, but on
  // a real trace the gaps are strongly skewed — clusters of rapid crossings
  // separated by quiet stretches — so the median lands on a sub-cycle
  // interval and reads high. Measured in the tank it reported 1.67 Hz against
  // a true 1.0, worse and more often than the bias it set out to fix.
  // Correcting this properly means autocorrelation, not a different average.
  const halfCycles = at.length - 1;
  const seconds = (at[at.length - 1] - at[0]) / sampleHz;
  const freq = seconds > 0 ? halfCycles / 2 / seconds : 0;
  return { freq, strength };
}

/** Shedding is ~0.5–4 Hz; this lifts it into a comfortable listening range. */
const PITCH_SCALE = 115;
const MIN_HZ = 70;
const MAX_HZ = 780;

export class AeolianTone {
  private ctx: AudioContext | null = null;
  private fundamental: OscillatorNode | null = null;
  private overtone: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private overtoneGain: GainNode | null = null;
  running = false;

  /** Must be called from a user gesture — browsers block audio otherwise. */
  async start(): Promise<boolean> {
    if (this.running) return true;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      const ctx = this.ctx ?? new Ctor();
      this.ctx = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1600;
      filter.Q.value = 0.7;

      const fundamental = ctx.createOscillator();
      fundamental.type = "sine";
      fundamental.frequency.value = 180;

      // A quiet octave keeps a pure sine from sounding like a test tone.
      const overtone = ctx.createOscillator();
      overtone.type = "sine";
      overtone.frequency.value = 360;
      const overtoneGain = ctx.createGain();
      overtoneGain.gain.value = 0.22;

      fundamental.connect(gain);
      overtone.connect(overtoneGain).connect(gain);
      gain.connect(filter).connect(ctx.destination);
      fundamental.start();
      overtone.start();

      this.fundamental = fundamental;
      this.overtone = overtone;
      this.overtoneGain = overtoneGain;
      this.gain = gain;
      this.running = true;
      return true;
    } catch {
      return false;
    }
  }

  stop() {
    this.running = false;
    const { ctx, gain, fundamental, overtone } = this;
    if (!ctx || !gain) return;
    // Fade before tearing down, so stopping never clicks.
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    const f = fundamental;
    const o = overtone;
    window.setTimeout(() => {
      try {
        f?.stop();
        o?.stop();
        f?.disconnect();
        o?.disconnect();
      } catch {
        // Already torn down.
      }
    }, 250);
    this.fundamental = null;
    this.overtone = null;
    this.gain = null;
  }

  /** Feed the latest measurement; all changes are ramped, never stepped. */
  update({ freq, strength }: Pitch) {
    const { ctx, gain, fundamental, overtone } = this;
    if (!this.running || !ctx || !gain || !fundamental || !overtone) return;

    const audible = Math.min(MAX_HZ, Math.max(MIN_HZ, freq * PITCH_SCALE));
    const t = ctx.currentTime;
    // A long time constant on pitch: the estimate wanders by a few percent
    // between windows and an un-smoothed note warbles badly.
    fundamental.frequency.setTargetAtTime(audible, t, 0.28);
    overtone.frequency.setTargetAtTime(audible * 2, t, 0.28);
    const target = freq > 0 ? 0.075 * strength : 0;
    gain.gain.setTargetAtTime(target, t, 0.18);
  }

  dispose() {
    this.stop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
