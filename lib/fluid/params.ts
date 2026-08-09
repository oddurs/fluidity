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
