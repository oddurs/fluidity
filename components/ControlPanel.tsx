"use client";

// Industrial control station: scenario selector, field X-ray, live solver
// parameters, and telemetry readouts. Everything shown is real state.

import type { SimParams, ViewMode } from "@/lib/fluid/engine";
import { type BoundedParam, PARAM_BOUNDS } from "@/lib/fluid/params";
import type { Scenario } from "@/lib/fluid/scenarios";
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
  format: (v: number) => string;
}

const SLIDERS: SliderSpec[] = [
  { key: "curl", label: "VORTICITY ε", format: (v) => v.toFixed(0) },
  { key: "buoyancy", label: "BUOYANCY β", format: (v) => v.toFixed(0) },
  { key: "attackAngleDeg", label: "ANGLE α", format: (v) => `${v.toFixed(0)}°` },
  { key: "densityDissipation", label: "DYE FADE", format: (v) => v.toFixed(2) },
  { key: "velocityDissipation", label: "DRAG", format: (v) => v.toFixed(2) },
  { key: "pressureIterations", label: "JACOBI ITER", format: (v) => v.toFixed(0) },
  { key: "splatRadius", label: "SPLAT RADIUS", format: (v) => v.toFixed(2) },
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
            <span className="sliderLabel">{s.label}</span>
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
