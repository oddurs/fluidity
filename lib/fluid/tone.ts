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

/** The band a shed wake can plausibly occupy, in tank Hz. */
const MIN_TRACE_HZ = 0.35;
const MAX_TRACE_HZ = 6;

/**
 * Estimate the dominant frequency of a pressure trace by autocorrelation.
 *
 * This counted mean crossings for a long time, and crossing-counting has a
 * failure the tank hits constantly: a real wake meanders, so the trace is
 * amplitude-modulated, and the quietest cycles never clear the hysteresis
 * band. Every uncounted cycle is a permanent bias, not noise — it read a
 * breathing 1.5 Hz trace as 1.19, and in the tank it would report half or
 * three-halves of the true rate and sit there stably enough to look right.
 *
 * Autocorrelation asks a different question — "how far do I have to shift
 * this signal before it looks like itself again?" — and a cycle that is
 * merely quiet still contributes to the match. Taking the median interval
 * between crossings was tried first and was worse: on a real trace the gaps
 * are strongly skewed, so the median lands on a sub-cycle interval.
 */
export function estimatePitch(trace: number[], sampleHz: number): Pitch {
  const n = trace.length;
  if (n < 16) return { freq: 0, strength: 0 };

  // Detrended, not just mean-removed. Tank pressure wanders on a slower
  // timescale than it oscillates, and a sloping baseline correlates strongly
  // with itself at every lag — which flattens the peaks the period has to be
  // read from, and was enough to make the estimate refuse to answer at all.
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += trace[i];
    sxx += i * i;
    sxy += i * trace[i];
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const intercept = (sy - slope * sx) / n;
  const x = new Array<number>(n);
  for (let i = 0; i < n; i++) x[i] = trace[i] - (slope * i + intercept);

  let rms = 0;
  for (const v of x) rms += v * v;
  rms = Math.sqrt(rms / n);

  // Below this the trace is drift and grid noise, not an oscillation.
  if (rms < 0.35) return { freq: 0, strength: 0 };
  const strength = Math.min(1, rms / 6);

  const minLag = Math.max(2, Math.floor(sampleHz / MAX_TRACE_HZ));
  // Two full periods have to fit in the window, or the correlation at that
  // lag is computed from too few overlapping samples to mean anything.
  const maxLag = Math.min(Math.floor(n / 2), Math.ceil(sampleHz / MIN_TRACE_HZ));
  if (maxLag <= minLag) return { freq: 0, strength: 0 };

  // Normalised at every lag: the overlap shrinks as the lag grows, and an
  // unnormalised correlation therefore always favours the shortest one.
  const r = new Array<number>(maxLag + 1).fill(0);
  for (let k = minLag; k <= maxLag; k++) {
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i + k < n; i++) {
      const a = x[i];
      const b = x[i + k];
      num += a * b;
      da += a * a;
      db += b * b;
    }
    r[k] = num / (Math.sqrt(da * db) + 1e-12);
  }

  let peak = -Infinity;
  let peakLag = minLag;
  for (let k = minLag; k <= maxLag; k++) {
    if (r[k] > peak) {
      peak = r[k];
      peakLag = k;
    }
  }
  // Nothing repeats: better to say so than to name a note.
  if (peak < 0.25) return { freq: 0, strength: 0 };

  // The *first* lag that comes close to the best one, not the best one
  // itself. A periodic signal correlates just as well at twice its period,
  // and picking the highest peak reports an octave down as readily as the
  // truth — which is the failure this replaces.
  let lag = 0;
  for (let k = minLag + 1; k < maxLag; k++) {
    if (r[k] >= peak * 0.85 && r[k] >= r[k - 1] && r[k] >= r[k + 1]) {
      lag = k;
      break;
    }
  }
  // The strongest lag, if no interior local maximum qualified — a peak
  // sitting on the edge of the search band has no neighbour to be higher
  // than. Something repeated well enough to clear the threshold, so the
  // readout should say what rather than fall silent.
  if (!lag) lag = Math.min(maxLag - 1, Math.max(minLag + 1, peakLag));

  // Parabolic interpolation through the peak: the true period rarely lands on
  // a whole sample, and at 1 Hz against 40 Hz sampling the rounding alone is
  // worth a few percent.
  const y0 = r[lag - 1];
  const y1 = r[lag];
  const y2 = r[lag + 1];
  const denom = y0 - 2 * y1 + y2;
  const refined = denom !== 0 ? lag + (0.5 * (y0 - y2)) / denom : lag;

  const freq = refined > 0 ? sampleHz / refined : 0;
  if (!Number.isFinite(freq) || freq <= 0) return { freq: 0, strength: 0 };
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
