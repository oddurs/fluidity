// The simulation's color system.
//
// Dye color is never picked by walking raw HSV — that produces the
// full-spectrum rainbow common to WebGL demos, whose hues encode nothing and
// whose apparent brightness swings wildly between bands. Instead every
// scenario draws from a named ramp or a named ink, so color is a decision
// with a reason behind it.
//
// The ramps are the perceptually-uniform matplotlib family (Smith & van der
// Walt, 2015), which is what scientific figures actually use.

export type RGB = [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Perceptually-uniform ramps, as evenly-spaced control points. */
export const RAMPS = {
  // Violet → magenta → amber → yellow. No green, so it stays cohesive.
  plasma: ["#0d0887", "#4b03a1", "#7d03a8", "#a82296", "#cb4679", "#e56b5d", "#f89441", "#fdc328", "#f0f921"],
  // Near-black → purple → red → orange → white. Built for fire-like data.
  inferno: ["#000004", "#1b0c41", "#4a0c6b", "#781c6d", "#a52c60", "#cf4446", "#ed6925", "#fb9b06", "#f7d13d", "#fcffa4"],
  // Deep blue → teal → green → chartreuse.
  viridis: ["#440154", "#472d7b", "#3b528b", "#2c728e", "#21918c", "#28ae80", "#5ec962", "#addc30", "#fde725"],
  // Custom: abyssal navy → glacier → frost. For cold, dense fluid.
  ice: ["#02111f", "#06304a", "#0a5c78", "#1b8fa8", "#4fc3d4", "#a8e6f0", "#eafcff"],
}.valueOf() as Record<string, string[]>;

export type RampName = keyof typeof RAMPS;

/** Sample a ramp at t ∈ [0,1] with linear interpolation between stops. */
export function sample(ramp: string[], t: number): RGB {
  const clamped = Math.min(1, Math.max(0, t));
  const x = clamped * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = hex(ramp[i]);
  const b = hex(ramp[i + 1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Rec. 709 relative luminance. */
export function luma(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * Rescale a color to a target luminance, preserving hue.
 *
 * Streaklines must all be equally legible on black — a ramp's built-in
 * light-to-dark sweep would make the low end disappear. Equalizing keeps the
 * ramp's hue progression while flattening its brightness.
 */
export function equalize(c: RGB, target = 0.55): RGB {
  const l = luma(c);
  if (l <= 0.0001) return [target, target, target];

  const k = target / l;
  const scaled: RGB = [c[0] * k, c[1] * k, c[2] * k];
  const peak = Math.max(...scaled);
  if (peak <= 1) return scaled;

  // Scaling alone cannot lift a dark, saturated colour to the target without
  // leaving the gamut — which is exactly what a ramp's deep end is. Take it
  // as bright as the gamut allows, then make up the rest by desaturating
  // toward white. A lighter tint of the same hue reads far better than a
  // filament left too dim to follow.
  const capped: RGB = [scaled[0] / peak, scaled[1] / peak, scaled[2] / peak];
  const lo = luma(capped);
  if (lo >= target) return capped;
  const m = Math.min(1, (target - lo) / (1 - lo));
  return [
    capped[0] + (1 - capped[0]) * m,
    capped[1] + (1 - capped[1]) * m,
    capped[2] + (1 - capped[2]) * m,
  ];
}

/**
 * Named inks, for scenarios where the user is painting rather than reading a
 * field. Chosen as pigments rather than hues so the free-play palette has
 * material character instead of spectrum coverage.
 */
export const INKS: Record<string, RGB> = {
  vermilion: [1.0, 0.27, 0.05],
  cadmium: [1.0, 0.58, 0.0],
  processYellow: [1.0, 0.86, 0.05],
  chartreuse: [0.62, 0.95, 0.12],
  viridian: [0.0, 0.75, 0.52],
  processCyan: [0.05, 0.74, 1.0],
  cobalt: [0.16, 0.4, 0.98],
  ultramarine: [0.34, 0.2, 0.95],
  processMagenta: [1.0, 0.13, 0.6],
  bone: [0.96, 0.94, 0.88],
};

/** The free-play ink rotation, ordered so neighbours stay distinguishable. */
export const INK_CYCLE: RGB[] = [
  INKS.processCyan,
  INKS.vermilion,
  INKS.chartreuse,
  INKS.processMagenta,
  INKS.cadmium,
  INKS.ultramarine,
  INKS.viridian,
  INKS.processYellow,
  INKS.cobalt,
  INKS.bone,
];

export function scale(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** Pick from the ink cycle by a continuously advancing counter. */
export function ink(t: number): RGB {
  const i = Math.floor(Math.abs(t)) % INK_CYCLE.length;
  return INK_CYCLE[i];
}
