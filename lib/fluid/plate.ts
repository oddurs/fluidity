// Plate export: compose the live specimen into a downloadable figure —
// header rule, clean image, and a data block, the way a wind-tunnel report
// prints a plate. Everything in the block is read from the running solver.

import type { FluidEngine, SimParams, ViewMode } from "./engine";

export interface PlateInfo {
  fig: string;
  scenarioName: string;
  view: ViewMode;
  params: SimParams;
  simGrid: string;
  dyeGrid: string;
  /** Wall-clock stamp, passed in so this module stays deterministic. */
  stamp: string;
}

/** Resolve a next/font CSS variable to a family usable in canvas 2D. */
function family(cssVar: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

export function buildPlate(engine: FluidEngine, canvas: HTMLCanvasElement, info: PlateInfo): string {
  // Render and copy in the same task — the drawing buffer is discarded at
  // the next composite, so nothing here may be deferred or awaited.
  engine.render();

  const W = canvas.width;
  const s = W / 1600;
  const headerH = Math.round(70 * s);
  const footerH = Math.round(150 * s);
  const pad = Math.round(28 * s);
  const H = headerH + canvas.height + footerH;

  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const g = out.getContext("2d")!;

  // Copy the live drawing buffer first, while it is still valid.
  g.drawImage(canvas, 0, headerH);

  const mono = family("--font-plex-mono", "monospace");
  const display = family("--font-archivo-black", "sans-serif");
  const INK = "#101010";
  const PAPER = "#e9e7df";
  const ACCENT = "#ff4400";

  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, headerH);
  g.fillRect(0, headerH + canvas.height, W, footerH);

  // Header: wordmark left, figure caption right.
  g.fillStyle = INK;
  g.font = `${Math.round(26 * s)}px ${display}`;
  g.textBaseline = "middle";
  g.fillText("FLUIDITY", pad, headerH / 2);

  g.font = `600 ${Math.round(13 * s)}px ${mono}`;
  g.textAlign = "right";
  g.fillText(info.fig, W - pad, headerH / 2);
  g.textAlign = "left";

  // Rules above and below the specimen.
  g.fillStyle = INK;
  g.fillRect(0, headerH - Math.round(2 * s), W, Math.round(2 * s));
  g.fillRect(0, headerH + canvas.height, W, Math.round(2 * s));

  // Data block: two columns of measured settings.
  const rows: [string, string][] = [
    ["SPECIMEN", info.scenarioName],
    ["FIELD", info.view.toUpperCase()],
    ["VORTICITY ε", info.params.curl.toFixed(0)],
    ["BUOYANCY β", info.params.buoyancy.toFixed(0)],
    ["ANGLE α", `${info.params.attackAngleDeg.toFixed(0)}°`],
    ["JACOBI ITER", `${info.params.pressureIterations.toFixed(0)}×/FRAME`],
    ["SIM GRID", info.simGrid],
    ["DYE GRID", info.dyeGrid],
  ];

  const top = headerH + canvas.height + Math.round(26 * s);
  const colW = (W - pad * 2) / 4;
  const lineH = Math.round(26 * s);
  g.font = `600 ${Math.round(11 * s)}px ${mono}`;

  rows.forEach(([k, v], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = pad + col * colW;
    const y = top + row * lineH;
    g.fillStyle = "rgba(16,16,16,0.5)";
    g.fillText(k, x, y);
    g.fillStyle = INK;
    g.fillText(v, x + Math.round(112 * s), y);
  });

  // Footer rule: accent tick, provenance, stamp.
  const footY = H - Math.round(26 * s);
  g.fillStyle = ACCENT;
  g.fillRect(pad, footY - Math.round(7 * s), Math.round(9 * s), Math.round(9 * s));
  g.fillStyle = "rgba(16,16,16,0.55)";
  g.font = `600 ${Math.round(10 * s)}px ${mono}`;
  g.fillText("SOLVED IN BROWSER · WEBGL2 · STABLE FLUIDS (STAM 1999)", pad + Math.round(20 * s), footY);
  g.textAlign = "right";
  g.fillText(info.stamp, W - pad, footY);
  g.textAlign = "left";

  return out.toDataURL("image/png");
}

export function downloadPlate(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
