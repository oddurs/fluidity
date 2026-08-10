// Permalinks: encode a configuration into the URL hash so any state you
// find can be shared or bookmarked. Short keys keep the link readable.

import type { LabCommand } from "./bus";
import type { SimParams, ViewMode } from "./engine";
import { type BoundedParam, clampParam, clampTank, type TankQuantity } from "./params.ts";

const PARAM_KEYS: Record<string, BoundedParam> = {
  c: "curl",
  b: "buoyancy",
  a: "attackAngleDeg",
  f: "densityDissipation",
  g: "velocityDissipation",
  j: "pressureIterations",
  r: "splatRadius",
};

/**
 * The canvas callouts are controls, so their values travel in the link too.
 * They are not in SimParams — each scenario sets them on the engine — and
 * leaving them out meant you could resize the cylinder, copy the link, and
 * send someone a view that reproduced neither the cylinder nor the wind.
 */
const TANK_KEYS: Record<string, TankQuantity> = {
  u: "windSpeed",
  d: "obstacleRadius",
};

const VIEWS: ViewMode[] = ["dye", "velocity", "pressure", "curl", "heat"];

export function encodeState(
  scenario: string,
  view: ViewMode,
  params: SimParams,
  tank?: { windSpeed: number; obstacleRadius: number },
): string {
  const parts = [`s=${scenario}`, `v=${view}`];
  for (const [short, key] of Object.entries(PARAM_KEYS)) {
    const value = params[key];
    // Trim trailing zeros so the link stays short and human-readable.
    parts.push(`${short}=${Number(value.toFixed(3))}`);
  }
  if (tank) {
    for (const [short, key] of Object.entries(TANK_KEYS)) {
      // A scenario with no obstacle, or no wind, has nothing to say about it;
      // writing a zero would only be noise in the link.
      if (tank[key] > 0) parts.push(`${short}=${Number(tank[key].toFixed(4))}`);
    }
  }
  return parts.join("&");
}

/** Parse a hash into a lab command. Returns null when nothing is encoded. */
export function decodeState(hash: string): LabCommand | null {
  const raw = hash.replace(/^#/, "");
  if (!raw) return null;
  const q = new URLSearchParams(raw);
  const cmd: LabCommand = {};

  const s = q.get("s");
  if (s && /^[a-z]+$/.test(s)) cmd.scenario = s;

  const v = q.get("v");
  if (v && (VIEWS as string[]).includes(v)) cmd.view = v as ViewMode;

  const params: Partial<SimParams> = {};
  for (const [short, key] of Object.entries(PARAM_KEYS)) {
    const val = q.get(short);
    // Number("") is 0, so an empty value would silently mean "zero" rather
    // than "absent". Require actual digits.
    if (val == null || val.trim() === "") continue;
    const n = Number(val);
    if (!Number.isFinite(n)) continue;
    // A link is untrusted input: never let it exceed the controls' range.
    params[key] = clampParam(key, n);
  }
  if (Object.keys(params).length > 0) cmd.params = params;

  const tank: { windSpeed?: number; obstacleRadius?: number } = {};
  for (const [short, key] of Object.entries(TANK_KEYS)) {
    const val = q.get(short);
    if (val == null || val.trim() === "") continue;
    const n = Number(val);
    if (!Number.isFinite(n)) continue;
    // Same rule as the sliders: a link is untrusted input.
    tank[key] = clampTank(key, n);
  }
  if (Object.keys(tank).length > 0) cmd.tank = tank;

  return cmd.scenario || cmd.view || cmd.params || cmd.tank ? cmd : null;
}
