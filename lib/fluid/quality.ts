// Adaptive quality.
//
// The solver's cost is dominated by fullscreen passes over the sim and dye
// grids, so resolution is the honest dial to turn when a machine cannot hold
// the frame budget. The controller only ever steps down: silently degrading
// under load is a kindness, but silently *upgrading* invites oscillation
// between two tiers that both sit near the threshold.

export interface QualityTier {
  name: string;
  simResolution: number;
  dyeResolution: number;
}

/** Ordered best to worst; index 0 is the default on capable hardware. */
export const TIERS: QualityTier[] = [
  { name: "HIGH", simResolution: 256, dyeResolution: 1024 },
  { name: "MEDIUM", simResolution: 192, dyeResolution: 768 },
  { name: "LOW", simResolution: 128, dyeResolution: 512 },
  { name: "MINIMUM", simResolution: 96, dyeResolution: 384 },
];

/** Absolute floor for "slow" (ms). Nothing under this is ever a problem. */
const SLOW_FRAME_MS = 22; // ≈45 fps

/**
 * A frame only counts as slow if it also exceeds this multiple of the best
 * frame the environment has managed. Without it, any capped refresh rate —
 * a 30Hz display, low-power mode, a throttled tab, headless rendering —
 * looks like permanent overload, and quality ratchets to the floor while the
 * GPU sits idle. The cap is not something resolution can fix.
 */
const SLOW_FRAME_RATIO = 1.4;

/** How many slow frames in the window before stepping down. */
const SLOW_FRAMES_TO_DROP = 45;

/** Frames to ignore after a change, while the new tier settles. */
const SETTLE_FRAMES = 60;

/**
 * If a step down does not actually buy this much improvement, resolution was
 * not the bottleneck — stop stepping.
 */
const REQUIRED_GAIN = 0.9;

/**
 * Where to begin. The controller can only step down, and it needs about a
 * second of sustained slow frames to react — starting a phone at desktop
 * resolution spends that whole second janking. A coarse pointer on a small
 * screen is the cheapest reliable signal for "probably a phone".
 */
export function initialTier(): number {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return 0;
  // MEDIUM for anything touch-driven. The controller cannot step back up —
  // frame time is vsync-capped, so a device comfortably holding 60 fps is
  // indistinguishable from one barely making it, and probing upward would
  // be guesswork. Starting one tier down costs a modern phone very little
  // and saves a weak one from a second of jank before the first drop.
  return window.matchMedia("(pointer: coarse)").matches ? 1 : 0;
}

export class QualityController {
  index = initialTier();
  private slowFrames = 0;
  private settle = SETTLE_FRAMES;
  /** Best frame time seen; stands in for the environment's refresh cap. */
  private best = Infinity;
  /** Frame time just before the last step down, to judge whether it helped. */
  private beforeDrop = 0;
  private sinceDrop = 0;
  private observed = 0;
  /** Set once a step down fails to help; no further drops are attempted. */
  private locked = false;

  get tier(): QualityTier {
    return TIERS[this.index];
  }

  /** The threshold a frame must beat, given what this device can achieve. */
  private slowThreshold(): number {
    if (!Number.isFinite(this.best)) return SLOW_FRAME_MS;
    return Math.max(SLOW_FRAME_MS, this.best * SLOW_FRAME_RATIO);
  }

  /**
   * Feed one frame's wall time. Returns the new tier when a step down is
   * warranted, otherwise null.
   */
  sample(frameMs: number): QualityTier | null {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return null;

    if (this.settle > 0) {
      this.settle--;
      // Right after a drop, check that it bought anything.
      if (this.settle === 0 && this.beforeDrop > 0) {
        this.sinceDrop = frameMs;
        if (this.sinceDrop > this.beforeDrop * REQUIRED_GAIN) {
          // Resolution was not the limit. Give the quality back and stop.
          if (this.index > 0) this.index--;
          this.locked = true;
          this.beforeDrop = 0;
          return this.tier;
        }
        this.beforeDrop = 0;
      }
      return null;
    }

    // Track the floor only once settled: the first frames of a session run
    // before the compositor has locked to vsync, and one stray fast frame
    // there would set an unreachable baseline and trigger a needless drop.
    this.best = Math.min(this.best, frameMs);
    if (++this.observed % 600 === 0) this.best *= 1.05;

    if (this.locked || this.index >= TIERS.length - 1) return null;

    if (frameMs > this.slowThreshold()) {
      this.slowFrames++;
      if (this.slowFrames >= SLOW_FRAMES_TO_DROP) {
        this.beforeDrop = frameMs;
        this.index++;
        this.slowFrames = 0;
        this.settle = SETTLE_FRAMES;
        return this.tier;
      }
    } else if (this.slowFrames > 0) {
      // Recovering frames pay down the debt, so a brief hitch — a scenario
      // switch, a GC pause — never drops the tier on its own.
      this.slowFrames--;
    }
    return null;
  }

  /** Called after a deliberate disruption so it is not counted as load. */
  resettle() {
    this.settle = SETTLE_FRAMES;
    this.slowFrames = 0;
    this.beforeDrop = 0;
  }
}
