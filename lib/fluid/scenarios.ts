// Scenario presets. Every scenario runs on the same solver — what changes
// is the parameter set, the dye palette, and the emitters that inject
// momentum each frame.

import { equalize, ink, INKS, RAMPS, sample, scale } from "./colormaps.ts";
import type { FluidEngine, SimParams } from "./engine";

export type RGB = [number, number, number];

export interface Scenario {
  id: string;
  name: string;
  /** One-line description shown in the control panel. */
  blurb: string;
  /** Overlay hint on the canvas; defaults to the drag prompt. */
  hint?: string;
  /** Lab-report figure caption shown top-right on the canvas. */
  fig?: string;
  params: Partial<SimParams>;
  /** Dye color for interactive splats; t advances per splat. */
  palette: (t: number) => RGB;
  /** Called every frame with elapsed time — programmatic emitters live here. */
  emit?: (engine: FluidEngine, time: number, dt: number) => void;
  /** Called once when the scenario is activated. */
  onLoad?: (engine: FluidEngine) => void;
}

/** A burst of radial splats — used on load so the canvas is never empty. */
export function burst(engine: FluidEngine, palette: (t: number) => RGB, count = 12) {
  for (let i = 0; i < count; i++) {
    // ×10 dates from before bloom and before these scenarios held their dye
    // this long: it saturated the tank white for the first second after any
    // scenario that opens with a burst.
    const color = scale(palette(Math.random()), 3);
    const x = 0.2 + 0.6 * Math.random();
    const y = 0.2 + 0.6 * Math.random();
    const angle = Math.random() * Math.PI * 2;
    const mag = 0.02 + Math.random() * 0.06;
    engine.splat(x, y, Math.cos(angle) * mag, Math.sin(angle) * mag, color);
  }
}

// Wind-tunnel streaklines. Colors walk the plasma ramp — violet through
// magenta to amber, no green — and are luminance-equalized so every line is
// equally legible against black. Each line also carries a thermal signature
// (warm at mid-span, cool at the walls) so the HEAT view reads as a
// heated-wire visualization of the same wake.
const STREAKLINES = Array.from({ length: 11 }, (_, i) => {
  const y = 0.14 + (0.72 * i) / 10;
  const d = y - 0.5;
  // The plasma ramp runs violet at the floor to gold at the ceiling, so a
  // filament's color still tells you which side of the obstacle it came
  // from — and because both limbs sit in the same half of the wheel, warm
  // and cool filaments mix to plum rather than to grey. A true diverging
  // map (ember over ice) reads beautifully upstream but washes the wake out
  // to grey, since additive dye mixing of complements makes white.
  const c = sample(RAMPS.plasma, 0.1 + (0.9 * i) / 10);
  return {
    y,
    // Budgeted against an OPEN tunnel. When the outlet was (wrongly) a wall,
    // dye recirculated and built up, so a deposit this small still saturated.
    // With the outlet open the dye leaves, and the same figure produced a
    // washed-out tank — steady-state concentration is set by injection
    // against outflow, not by accumulation.
    // A lower equalize target keeps the deep end of the ramp deep: reaching
    // for more luminance forces a desaturation toward white, and the violet
    // filaments turn lavender.
    color: scale(equalize(c, 0.33), 0.021),
    heat: 0.1 * Math.exp(-(d * d) / 0.02) - 0.03,
  };
});

/** Inlet emitters shared by the wind-tunnel scenarios. */
function tunnelInlet(e: FluidEngine) {
  for (const line of STREAKLINES) {
    e.splat(0.015, line.y, 0, 0, line.color);
    e.splatHeat(0.015, line.y, line.heat);
  }
}

export const SCENARIOS: Scenario[] = [
  {
    id: "karman",
    fig: "FIG.01 — VORTEX SHEDDING PAST A CYLINDER",
    name: "KÁRMÁN.ST",
    blurb: "Flow past a cylinder sheds alternating vortices — a Kármán vortex street. Drag the cylinder.",
    hint: "DRAG THE CYLINDER — OR STIR THE WAKE",
    params: {
      densityDissipation: 0.32,
      velocityDissipation: 0.02,
      curl: 8,
      splatRadius: 0.028,
      pressureIterations: 40,
      bloom: 0.4,
      exposure: 1.05,
    },
    palette: (t) => scale(equalize(sample(RAMPS.plasma, (t * 0.37) % 1), 0.7), 0.15),
    onLoad: (e) => {
      e.obstacle = { x: 0.28, y: 0.5, radius: 0.065 };
      e.wind = { speed: 170, pull: 0.1 };
      // Break the symmetry so shedding starts immediately instead of
      // waiting on numerical noise.
      e.splat(0.42, 0.53, 0, 0.015, [0, 0, 0]);
    },
    emit: tunnelInlet,
  },
  {
    id: "wing",
    fig: "FIG.02 — SYMMETRIC SECTION AT ANGLE OF ATTACK",
    name: "WING",
    blurb: "A symmetric wing section. Pressure X-ray shows lift; past ~25° the flow separates — stall.",
    hint: "TILT WITH THE ANGLE α SLIDER — THEN X-RAY THE PRESSURE",
    params: {
      densityDissipation: 0.3,
      velocityDissipation: 0.02,
      curl: 6,
      splatRadius: 0.028,
      pressureIterations: 44,
      attackAngleDeg: 12,
      bloom: 0.4,
      exposure: 1.05,
    },
    palette: (t) => scale(equalize(sample(RAMPS.plasma, (t * 0.37) % 1), 0.7), 0.15),
    onLoad: (e) => {
      // A symmetric NACA 0015 section: unmistakably a wing, and its
      // identical upper and lower surfaces are the point (see SEC.07).
      e.obstacle = { x: 0.3, y: 0.5, radius: 0.15, shape: "airfoil", thickness: 0.15 };
      e.wind = { speed: 170, pull: 0.1 };
    },
    emit: tunnelInlet,
  },
  {
    id: "ink",
    fig: "FIG.03 — FREE ADVECTION, CLOSED TANK",
    name: "INK.PLAY",
    blurb: "Free play. Drag to inject momentum and dye; vorticity confinement keeps the eddies alive.",
    params: {
      // Was 1.0, which erased the opening burst in a few seconds and left
      // anyone who clicked this scenario staring at an empty black tank.
      densityDissipation: 0.42,
      velocityDissipation: 0.12,
      curl: 30,
      splatRadius: 0.25,
      pressureIterations: 24,
      bloom: 0.8,
      exposure: 1.15,
    },
    palette: (t) => scale(ink(t), 0.16),
    emit: (e, time) => {
      // A slow drifting ribbon, well below the strength of a real stroke.
      // The tank should always be alive, but it must never compete with you.
      const a = time * 0.47;
      const x = 0.5 + 0.3 * Math.cos(a) * Math.cos(a * 0.37);
      const y = 0.5 + 0.28 * Math.sin(a * 0.83);
      e.splat(x, y, -Math.sin(a) * 0.0016, Math.cos(a * 0.83) * 0.0016,
        scale(ink(time * 0.22), 0.11));
    },
    onLoad: (e) => burst(e, (t) => ink(t * 10), 16),
  },
  {
    id: "plume",
    fig: "FIG.04 — BUOYANT PLUME, TWO SOURCES",
    name: "PLUME",
    blurb: "Two burners heat the floor. No upward push is scripted — buoyancy alone lifts the smoke.",
    hint: "DRAG TO PAINT FIRE — YOUR STROKES RISE",
    params: {
      densityDissipation: 1.4,
      velocityDissipation: 0.15,
      curl: 22,
      splatRadius: 0.16,
      pressureIterations: 28,
      buoyancy: 55,
      temperatureDissipation: 0.5,
      bloom: 0.95,
      exposure: 1.12,
    },
    palette: (t) => scale(sample(RAMPS.inferno, 0.55 + 0.4 * ((t * 0.31) % 1)), 0.16),
    emit: (e, time) => {
      for (const [seed, x0] of [[0, 0.35], [7, 0.65]] as const) {
        const flicker = Math.sin(time * 9 + seed) * 0.4 + Math.sin(time * 23 + seed * 3) * 0.2;
        const x = x0 + Math.sin(time * 2.2 + seed) * 0.015;
        // Ride the inferno ramp's ember band; flicker rocks it up and down.
        const t = 0.64 + 0.15 * Math.sin(time * 1.3 + seed);
        const c = scale(sample(RAMPS.inferno, t), 0.3 + 0.14 * flicker);
        // Heat + smoke only. The velocity comes from the buoyancy term.
        e.splat(x, 0.02, flicker * 0.0012, 0, c);
        e.splatHeat(x, 0.02, 0.5 + 0.2 * flicker);
      }
    },
  },
  {
    id: "orbit",
    fig: "FIG.05 — FORCED ROTATION, EMITTER PAIR",
    name: "VORTEX.PAIR",
    blurb: "Two emitters orbit a common center, stirring the field tangentially. A steady forced rotation.",
    params: {
      densityDissipation: 0.7,
      velocityDissipation: 0.1,
      curl: 12,
      splatRadius: 0.2,
      pressureIterations: 32,
      bloom: 0.5,
      exposure: 1.05,
    },
    palette: (t) => scale(t % 2 < 1 ? INKS.processCyan : INKS.processMagenta, 0.16),
    emit: (e, time) => {
      const R = 0.22;
      const omega = 1.6;
      for (const phase of [0, Math.PI]) {
        const a = time * omega + phase;
        const x = 0.5 + R * Math.cos(a);
        const y = 0.5 + R * Math.sin(a);
        // Push tangentially — along the direction of travel.
        const dx = -Math.sin(a) * 0.006;
        const dy = Math.cos(a) * 0.006;
        const c = phase === 0 ? INKS.processCyan : INKS.processMagenta;
        e.splat(x, y, dx, dy, scale(c, 0.075));
      }
    },
    onLoad: (e) => burst(e, (t) => (t < 0.5 ? INKS.processCyan : INKS.processMagenta), 6),
  },
  {
    id: "storm",
    fig: "FIG.06 — RANDOM FORCING, HIGH VORTICITY",
    name: "STORM",
    blurb: "Random impulse bursts at high vorticity. Energy injects faster than dissipation removes it.",
    params: {
      densityDissipation: 0.95,
      velocityDissipation: 0.08,
      curl: 48,
      splatRadius: 0.19,
      pressureIterations: 20,
      bloom: 0.62,
      exposure: 1.08,
    },
    palette: (t) => scale(ink(t + 3), 0.16),
    emit: (e, time, dt) => {
      // Poisson-ish bursts: on average one every 0.7 s.
      if (Math.random() < dt / 0.5) {
        const color = scale(ink(Math.random() * 10), 10);
        const angle = Math.random() * Math.PI * 2;
        const mag = 0.04 + Math.random() * 0.08;
        e.splat(
          0.15 + 0.7 * Math.random(),
          0.15 + 0.7 * Math.random(),
          Math.cos(angle) * mag,
          Math.sin(angle) * mag,
          color,
        );
      }
    },
    onLoad: (e) => burst(e, (t) => ink(t * 10), 20),
  },
  {
    id: "rayleigh",
    fig: "FIG.07 — RAYLEIGH–TAYLOR INSTABILITY",
    name: "RAYLEIGH.T",
    blurb: "Cold, dense fluid rains from the ceiling into warm ambient — the Rayleigh–Taylor instability.",
    hint: "WATCH THE FINGERS GROW — OR STIR THEM",
    params: {
      densityDissipation: 1.05,
      velocityDissipation: 0.1,
      curl: 14,
      splatRadius: 0.12,
      pressureIterations: 32,
      buoyancy: 55,
      temperatureDissipation: 0.15,
      bloom: 0.5,
      exposure: 1.12,
    },
    palette: (t) => scale(sample(RAMPS.ice, 0.4 + 0.4 * ((t * 0.29) % 1)), 0.16),
    onLoad: (e) => {
      e.clear();
      // Perturb the interface so distinct fingers form instead of a sheet.
      for (let i = 0; i < 7; i++) {
        e.splatHeat(0.08 + (0.84 * i) / 6, 0.93, -0.35, 1.5);
      }
    },
    emit: (e, time) => {
      // A cold, dyed layer continuously supplied along the ceiling.
      for (let i = 0; i < 13; i++) {
        const x = 0.04 + (0.92 * i) / 12;
        const wobble = 0.15 * Math.sin(time * 0.9 + i * 2.1);
        e.splatHeat(x, 0.985, -0.16 * (1 + wobble));
        // Stay in the ice ramp's saturated middle; its pale end accumulates
        // to flat white within seconds at this emitter count.
        e.splat(x, 0.985, 0, 0, scale(sample(RAMPS.ice, 0.42 + 0.12 * Math.sin(i * 1.7)), 0.011));
      }
    },
  },
];
