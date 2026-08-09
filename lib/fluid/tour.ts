// The AUTO.PILOT script: a looping, hands-free tour of every scenario and
// field view. Each step applies a lab command, shows a caption, and may
// drive a "ghost hand" that stirs the tank the way a visitor would.

import type { LabCommand } from "./bus";
import { ink, scale } from "./colormaps.ts";
import type { FluidEngine } from "./engine";

export interface TourStep {
  caption: string;
  /** Seconds before advancing to the next step. */
  duration: number;
  command: LabCommand;
  /** Ghost hand: called every frame with seconds elapsed in this step. */
  stir?: (engine: FluidEngine, t: number) => void;
}

export const TOUR: TourStep[] = [
  {
    caption: "FLOW PAST A CYLINDER. THE WAKE IS UNSTABLE — VORTICES PEEL OFF IN A STAGGERED RHYTHM.",
    duration: 14,
    command: { scenario: "karman", view: "dye" },
  },
  {
    caption: "SAME FLOW, CURL X-RAY. YELLOW SPINS CLOCKWISE, PURPLE COUNTER. THIS IS THE KÁRMÁN VORTEX STREET.",
    duration: 10,
    command: { view: "curl" },
  },
  {
    caption: "THE CYLINDER MOVES; THE STREET RE-FORMS BEHIND IT. BOUNDARIES ARE JUST MORE EQUATIONS.",
    duration: 12,
    command: { view: "dye" },
    stir: (e, t) => {
      e.obstacle.y = 0.5 + 0.2 * Math.sin(t * 0.9);
    },
  },
  {
    caption: "A SYMMETRIC WING, PITCHING. IT TURNS THE FLOW DOWNWARD; THE FLOW PUSHES THE WING UP.",
    duration: 12,
    command: { scenario: "wing", view: "dye" },
    stir: (e, t) => {
      e.params.attackAngleDeg = 14 * Math.sin(t * 0.55);
    },
  },
  {
    caption: "PRESSURE X-RAY OF THE SAME WING: BLUE ABOVE, ORANGE BELOW. THAT DIFFERENCE IS LIFT.",
    duration: 11,
    command: { view: "pressure", params: { attackAngleDeg: 14 } },
  },
  {
    caption: "A CLOSED TANK AND A GHOST HAND. SEMI-LAGRANGIAN ADVECTION CARRIES THE INK — IT CANNOT BLOW UP.",
    duration: 12,
    command: { scenario: "ink", view: "dye" },
    stir: (e, t) => {
      const a = t * 1.8;
      const x = 0.5 + 0.27 * Math.cos(a);
      const y = 0.5 + 0.24 * Math.sin(a * 1.35);
      // Budgeted against INK.PLAY's own ambient ribbon, which runs at the
      // same time: the two deposits add, and at the original figure the tank
      // saturated to flat white within seconds.
      const c = scale(ink(t * 0.7), 0.03);
      e.splat(x, y, -Math.sin(a) * 0.004, Math.cos(a * 1.35) * 0.004, c);
    },
  },
  {
    caption: "THE SAME MOMENT, VELOCITY X-RAY: HUE IS DIRECTION, BRIGHTNESS IS SPEED. THE UNKNOWN ITSELF.",
    duration: 9,
    command: { view: "velocity" },
    stir: (e, t) => {
      const a = t * 1.8 + 21.6;
      const x = 0.5 + 0.27 * Math.cos(a);
      const y = 0.5 + 0.24 * Math.sin(a * 1.35);
      e.splat(x, y, -Math.sin(a) * 0.004, Math.cos(a * 1.35) * 0.004, [0, 0, 0]);
    },
  },
  {
    caption: "TWO BURNERS, NO SCRIPTED LIFT. BUOYANCY ALONE RAISES THE COLUMN AND ROLLS THE MUSHROOM HEADS.",
    duration: 13,
    command: { scenario: "plume", view: "dye" },
  },
  {
    caption: "HEAT X-RAY OF THE SAME FIRE: EMBERS RISE, SPREAD, COOL, AND STALL.",
    duration: 9,
    command: { view: "heat" },
  },
  {
    caption: "COLD RAIN INTO WARM AMBIENT. HEAVY-OVER-LIGHT IS UNSTABLE — RAYLEIGH–TAYLOR FINGERS ERUPT.",
    duration: 14,
    command: { scenario: "rayleigh", view: "dye" },
  },
  {
    caption: "STORM: IMPULSES ARRIVE FASTER THAN DISSIPATION REMOVES THEM. VORTICITY ε AT 48 KEEPS EVERY EDDY ALIVE.",
    duration: 12,
    command: { scenario: "storm", view: "dye" },
  },
  {
    caption: "THE PRESSURE FIELD, FIGHTING TO KEEP THE FLUID INCOMPRESSIBLE — 20 JACOBI SWEEPS PER FRAME. THE TOUR LOOPS; TOUCH ANYTHING TO TAKE OVER.",
    duration: 10,
    command: { view: "pressure" },
  },
];
