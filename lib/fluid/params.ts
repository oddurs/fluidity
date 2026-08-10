// Authoritative bounds for every solver parameter a user can set.
//
// Both the control panel and the permalink decoder read these, so a value
// arriving from a hand-edited URL can never exceed what a slider allows.
// Without the clamp, `#j=100000` asks the render loop for a hundred thousand
// GPU passes per frame and takes the tab with it.

import type { SimParams } from "./engine.ts";

export interface ParamBound {
  min: number;
  max: number;
  step: number;
}

export const PARAM_BOUNDS = {
  curl: { min: 0, max: 60, step: 1 },
  buoyancy: { min: 0, max: 150, step: 1 },
  attackAngleDeg: { min: -35, max: 35, step: 1 },
  densityDissipation: { min: 0, max: 4, step: 0.05 },
  velocityDissipation: { min: 0, max: 3, step: 0.05 },
  pressureIterations: { min: 4, max: 60, step: 1 },
  splatRadius: { min: 0.05, max: 1, step: 0.01 },
} as const satisfies Partial<Record<keyof SimParams, ParamBound>>;

export type BoundedParam = keyof typeof PARAM_BOUNDS;

export function clampParam(key: BoundedParam, value: number): number {
  const b = PARAM_BOUNDS[key];
  return Math.min(b.max, Math.max(b.min, value));
}

/**
 * The two quantities the canvas annotations let you drag directly. They are
 * not in SimParams — each scenario sets them on the engine — but they are
 * user-settable, so their ranges belong here with the rest rather than as
 * numbers buried in a drag handler.
 */
export const TANK_BOUNDS = {
  /** Freestream speed, in grid cells per second. */
  windSpeed: { min: 20, max: 400, step: 5 },
  /** Cylinder radius as a fraction of tank height. */
  obstacleRadius: { min: 0.02, max: 0.17, step: 0.005 },
} as const satisfies Record<string, ParamBound>;

export type TankQuantity = keyof typeof TANK_BOUNDS;

export function clampTank(key: TankQuantity, value: number): number {
  const b = TANK_BOUNDS[key];
  return Math.min(b.max, Math.max(b.min, value));
}
