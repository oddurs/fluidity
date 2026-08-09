"use client";

// Industrial control station: scenario selector, field X-ray, live solver
// parameters, and telemetry readouts. Everything shown is real state.

import type { SimParams, ViewMode } from "@/lib/fluid/engine";
import { type BoundedParam, PARAM_BOUNDS } from "@/lib/fluid/params";
import type { Scenario } from "@/lib/fluid/scenarios";
import { Info } from "./Info";
import type { Telemetry } from "./Stage";

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "dye", label: "DYE" },
  { id: "velocity", label: "VELOCITY" },
  { id: "pressure", label: "PRESSURE" },
  { id: "curl", label: "CURL" },
  { id: "heat", label: "HEAT" },
];

/** Ranges come from PARAM_BOUNDS so the sliders and permalinks cannot drift. */
interface SliderSpec {
  key: BoundedParam;
  label: string;
  /** Set in the maths faces so it matches the equation it names. */
  sym?: string;
  /** Plain-language definition, offered behind an (i). */
  info: string;
  format: (v: number) => string;
}

const SLIDERS: SliderSpec[] = [
  { info: 'Vorticity confinement strength. Numerical smearing quietly eats small eddies, so the solver measures the rotation that remains and pushes it back in. Not physics — a correction for a coarse grid. At 0 the flow goes lifeless; high values shatter the dye into curling filaments.', key: "curl", label: "VORTICITY", sym: "ε", format: (v) => v.toFixed(0) },
  { info: 'How hard warm fluid rises and cold fluid sinks, per unit of temperature. This is the whole Boussinesq approximation: density is ignored everywhere except here. At 0 the plume and the falling fingers stop entirely.', key: "buoyancy", label: "BUOYANCY", sym: "β", format: (v) => v.toFixed(0) },
  { info: 'The angle between the wing section and the oncoming flow. Positive is nose-up. Lift grows with it until roughly 15–25°, where the flow can no longer follow the upper surface and the section stalls.', key: "attackAngleDeg", label: "ANGLE", sym: "α", format: (v) => `${v.toFixed(0)}°` },
  { info: 'How quickly the dye fades as it travels. Purely a visualisation choice — dye is a passive tracer and carries no momentum, so this changes what you can see, never how the fluid moves.', key: "densityDissipation", label: "DYE FADE", format: (v) => v.toFixed(2) },
  { info: 'How quickly motion itself decays. Standing in for drag the solver does not otherwise model. At 0 a single stroke keeps folding the ink for minutes.', key: "velocityDissipation", label: "DRAG", format: (v) => v.toFixed(2) },
  { info: 'How many Jacobi sweeps are spent solving for pressure each frame. It is an iterative solve, so this is really "how converged". Drop it to 4 and the fluid becomes visibly compressible — piling up and vanishing.', key: "pressureIterations", label: "JACOBI ITER", format: (v) => v.toFixed(0) },
  { info: 'The size of the Gaussian blob your cursor stamps into the velocity and dye fields. Small values draw fine threads; large ones shove the whole tank.', key: "splatRadius", label: "SPLAT RADIUS", format: (v) => v.toFixed(2) },
];

interface Props {
  scenarios: Scenario[];
  activeScenario: Scenario;
  onScenario: (id: string) => void;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  params: SimParams;
  onParam: (key: keyof SimParams, value: number) => void;
  /** Param keys just set from the document, flashed so the change is seen. */
  changedParams: string[];
  paused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
  onBurst: () => void;
  autopilot: boolean;
  onToggleAutopilot: () => void;
  probe: boolean;
  onToggleProbe: () => void;
  tone: boolean;
  onToggleTone: () => void;
  onSavePlate: () => void;
  onCopyLink: () => void;
  onToggleKeys: () => void;
  telemetry: Telemetry;
}

export function ControlPanel({
  scenarios,
  activeScenario,
  onScenario,
  viewMode,
  onViewMode,
  params,
  onParam,
  changedParams,
  paused,
  onTogglePause,
  onClear,
  onBurst,
  autopilot,
  onToggleAutopilot,
  probe,
  onToggleProbe,
  tone,
  onToggleTone,
  onSavePlate,
  onCopyLink,
  onToggleKeys,
  telemetry,
}: Props) {
  return (
    <aside className="panel" aria-label="Simulation controls">
      {/* A nameplate, the way a piece of equipment carries its own. The
          wordmark used to appear both here and across the canvas; on the
          canvas it needed a difference blend to stay legible over moving dye,
          which turned it arbitrary colours and covered a third of the tank. */}
      <div className="panelMark">
        <h1 className="markWord">FLUIDITY</h1>
        <p className="markTag">A NAVIER–STOKES PLAYGROUND</p>
      </div>

      <div className="panelBlock">
        <p className="panelLabel">SCENARIO</p>
        <div className="scenarioGrid" role="group" aria-label="Choose a scenario">
          {scenarios.map((s, i) => (
            <button
              key={s.id}
              className="btn scenarioBtn"
              aria-pressed={s.id === activeScenario.id}
              onClick={() => onScenario(s.id)}
            >
              {/* The panel's numbering is the canvas FIG. numbering — one
                  index for the same specimen in both places. */}
              <span className="scenarioNum">{String(i + 1).padStart(2, "0")}</span>
              {s.name}
            </button>
          ))}
        </div>
        <p className="scenarioBlurb">{activeScenario.blurb}</p>
      </div>

      <div className="panelBlock">
        <p className="panelLabel">FIELD X-RAY</p>
        <div className="viewGrid" role="group" aria-label="Choose which field to display">
          {VIEW_MODES.map((m) => (
            <button
              key={m.id}
              className="btn viewBtn"
              aria-pressed={m.id === viewMode}
              onClick={() => onViewMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panelBlock">
        <p className="panelLabel">SOLVER PARAMETERS</p>
        {SLIDERS.map((s) => {
          const b = PARAM_BOUNDS[s.key];
          return (
          <label
            key={s.key}
            className={`sliderRow${changedParams.includes(s.key) ? " sliderRowChanged" : ""}`}
          >
            <span className="sliderLabel">
              {s.label}
              {s.sym && <span className="sliderSym"> {s.sym}</span>}
              <Info term={s.sym ? `${s.label} ${s.sym}` : s.label}>{s.info}</Info>
            </span>
            <input
              type="range"
              min={b.min}
              max={b.max}
              step={b.step}
              value={params[s.key]}
              onChange={(e) => onParam(s.key, Number(e.target.value))}
              style={
                {
                  "--fill": `${((params[s.key] - b.min) / (b.max - b.min)) * 100}%`,
                } as React.CSSProperties
              }
            />
            <span className="sliderValue">{s.format(params[s.key])}</span>
          </label>
          );
        })}
      </div>

      <div className="panelBlock">
        <p className="panelLabel">ACTIONS</p>
        <div className="actionRow actionRow3">
          <button className="btn" onClick={onTogglePause} aria-pressed={paused}>
            {paused ? "RESUME" : "PAUSE"}
          </button>
          <button className="btn" onClick={onBurst}>
            BURST
          </button>
          <button className="btn" onClick={onClear}>
            CLEAR
          </button>
        </div>
        <div className="actionRow">
          <button className="btn" onClick={onToggleAutopilot} aria-pressed={autopilot}>
            {autopilot ? "STOP TOUR" : "AUTO.PILOT"}
          </button>
          <button className="btn" onClick={onToggleProbe} aria-pressed={probe}>
            {probe ? "PROBE: ON" : "PROBE: OFF"}
          </button>
          <button className="btn" onClick={onSavePlate}>
            SAVE PLATE
          </button>
          <button className="btn" onClick={onCopyLink}>
            COPY LINK
          </button>
        </div>
        <div className="actionRow">
          <button className="btn" onClick={onToggleTone} aria-pressed={tone}>
            {tone ? "TONE: ON" : "TONE: OFF"}
          </button>
          <button className="btn" onClick={onToggleKeys}>
            KEYBOARD ?
          </button>
        </div>
      </div>

      <div className="panelBlock telemetry">
        <p className="panelLabel">TELEMETRY</p>
        <dl className="readouts">
          <div>
            <dt>FPS</dt>
            <dd>{telemetry.active && telemetry.fps ? telemetry.fps : "——"}</dd>
          </div>
          <div>
            <dt>FRAME</dt>
            <dd>
              {telemetry.active && telemetry.frameMs
                ? `${telemetry.frameMs.toFixed(1)}MS`
                : "——"}
            </dd>
          </div>
          <div>
            <dt>SIM GRID</dt>
            <dd>
              {telemetry.simW}×{telemetry.simH}
            </dd>
          </div>
          <div>
            <dt>DYE GRID</dt>
            <dd>
              {telemetry.dyeW}×{telemetry.dyeH}
            </dd>
          </div>
          <div>
            <dt>QUALITY</dt>
            <dd>{telemetry.quality}</dd>
          </div>
          <div>
            <dt>STATE</dt>
            <dd>
              {!telemetry.active
                ? "IDLE"
                : autopilot
                  ? "AUTOPILOT"
                  : paused
                    ? "HELD"
                    : "RUNNING"}
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
