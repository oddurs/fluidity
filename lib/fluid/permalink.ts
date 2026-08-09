// Permalinks: encode a configuration into the URL hash so any state you
// find can be shared or bookmarked. Short keys keep the link readable.

import type { LabCommand } from "./bus";
import type { SimParams, ViewMode } from "./engine";
import { type BoundedParam, clampParam } from "./params.ts";

const PARAM_KEYS: Record<string, BoundedParam> = {
  c: "curl",
  b: "buoyancy",
  a: "attackAngleDeg",
  f: "densityDissipation",
  g: "velocityDissipation",
  j: "pressureIterations",
  r: "splatRadius",
};

const VIEWS: ViewMode[] = ["dye", "velocity", "pressure", "curl", "heat"];

export function encodeState(scenario: string, view: ViewMode, params: SimParams): string {
  const parts = [`s=${scenario}`, `v=${view}`];
  for (const [short, key] of Object.entries(PARAM_KEYS)) {
    const value = params[key];
    // Trim trailing zeros so the link stays short and human-readable.
    parts.push(`${short}=${Number(value.toFixed(3))}`);
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

  return cmd.scenario || cmd.view || cmd.params ? cmd : null;
}
