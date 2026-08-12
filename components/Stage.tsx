"use client";

// The playground: canvas + control panel. Owns the engine instance,
// the requestAnimationFrame loop, pointer input, and telemetry.

import { useCallback, useEffect, useRef, useState } from "react";
import { LabCommand, onLabCommand } from "@/lib/fluid/bus";
import { DEFAULT_PARAMS, FluidEngine, SimParams, ViewMode } from "@/lib/fluid/engine";
import { burst, Scenario, SCENARIOS } from "@/lib/fluid/scenarios";
import { clampTank } from "@/lib/fluid/params";
import { decodeState, encodeState } from "@/lib/fluid/permalink";
import { QualityController } from "@/lib/fluid/quality";
import { AeolianTone, estimatePitch } from "@/lib/fluid/tone";
import { TOUR } from "@/lib/fluid/tour";
import { Annotations, InstrumentSnapshot, TraceView } from "./Annotations";
import { ControlPanel } from "./ControlPanel";
import { useContextLoss } from "./stage/useContextLoss";
import { useCapture } from "./stage/useCapture";
import { usePointerInput, type GrabTarget, type PointerState } from "./stage/usePointerInput";
import { useActiveWhileVisible, useDock } from "./stage/useTankVisibility";

export interface Telemetry {
  fps: number;
  frameMs: number;
  simW: number;
  simH: number;
  dyeW: number;
  dyeH: number;
  quality: string;
  /** False while the tab is hidden or the canvas is scrolled out of view. */
  active: boolean;
}

/** Probe trace: 160 samples at 40 Hz ≈ 4 s of history. */
const TRACE_LEN = 160;
const TRACE_INTERVAL_MS = 25;

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FluidEngine | null>(null);
  const scenarioRef = useRef<Scenario>(SCENARIOS[0]);
  const pointersRef = useRef<Map<number, PointerState>>(new Map());
  const splatCounter = useRef(0);

  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [viewMode, setViewMode] = useState<ViewMode>("dye");
  const [paused, setPaused] = useState(false);
  const [params, setParams] = useState<SimParams>({ ...DEFAULT_PARAMS, ...SCENARIOS[0].params });
  const [telemetry, setTelemetry] = useState<Telemetry>({
    fps: 0,
    frameMs: 0,
    simW: 0,
    simH: 0,
    dyeW: 0,
    dyeH: 0,
    quality: "HIGH",
    active: true,
  });
  const [glError, setGlError] = useState<string | null>(null);

  const qualityRef = useRef(new QualityController());
  /** Stepping only runs while the canvas is visible and the tab is focused. */
  const activeRef = useRef(true);

  /**
   * Once the stage scrolls away, the tank docks to a corner and keeps
   * running. The essay is 14,000px long and every TRY IT acts on the solver;
   * without this you fire an action at something you cannot see, then have to
   * scroll back and find your place again.
   */
  const { docked, dockSize } = useDock(canvasRef);
  useActiveWhileVisible(canvasRef, activeRef);

  const resettleQuality = useCallback(() => qualityRef.current.resettle(), []);
  const { contextLost, glGeneration } = useContextLoss(canvasRef, resettleQuality);

  // AUTO.PILOT: a looping scripted tour. The RAF loop reads the ref; React
  // state only mirrors the current step for the caption overlay.
  const autopilotRef = useRef({ active: false, index: 0, stepStart: 0, applying: false });
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const applyLabRef = useRef<((cmd: LabCommand) => void) | null>(null);

  // The measurement layer: a draggable probe reading real solver fields,
  // plus dimension annotations. Refreshed at 10 Hz (and on probe drag).
  const probeRef = useRef({ x: 0.62, y: 0.5, on: true });
  const probeReadRef = useRef({ t: -Infinity, value: { u: 0, v: 0, p: 0, curl: 0, T: 0 } });
  const [instr, setInstr] = useState<InstrumentSnapshot | null>(null);
  const refreshInstrRef = useRef<() => void>(() => {});

  // Transient confirmation for capture/share actions.
  const [flash, setFlash] = useState<string | null>(null);
  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash((cur) => (cur === msg ? null : cur)), 2200);
  }, []);
  const [showKeys, setShowKeys] = useState(false);

  // What the cursor is currently over, so the canvas can advertise that the
  // cylinder and the probe are things you can pick up.
  const [grabTarget, setGrabTarget] = useState<GrabTarget>("none");
  const [dragging, setDragging] = useState(false);
  const grabRef = useRef<GrabTarget>("none");

  /** Rolling pressure history behind the probe, for the sparkline. */
  const traceRef = useRef<number[]>([]);
  const [trace, setTrace] = useState<TraceView>({ points: [], mid: 0, half: 1.5 });
  /**
   * The sparkline's vertical scale, eased. Recomputing it from each frame's
   * min/max made the whole waveform jump whenever a peak entered or left the
   * window. It is eased here rather than in the component because mutating a
   * ref during render is unsound when a render can be replayed.
   */
  const traceScaleRef = useRef<{ mid: number; half: number } | null>(null);

  /** Solver params just changed by a TRY IT action, flashed in the panel. */
  const [changedParams, setChangedParams] = useState<string[]>([]);

  /**
   * Keyboard control of the tank itself. Every button and slider was already
   * reachable, but the one interaction the whole app is built around —
   * stirring the fluid, moving the cylinder, placing the probe — required a
   * pointer. Arrows drive whichever instrument is selected; the model mirrors
   * the mouse (move, then act) rather than inventing a second one.
   */
  const [kbTarget, setKbTarget] = useState<"probe" | "obstacle">("probe");
  const canvasFocusedRef = useRef(false);
  const [canvasFocused, setCanvasFocused] = useState(false);
  /** Last direction nudged, so a stir has something to push along. */
  const lastDirRef = useRef({ x: 1, y: 0 });
  /** Announcements for assistive technology. Discrete events only. */
  const [announcement, setAnnouncement] = useState("");
  const [narration, setNarration] = useState("");

  /** Clip capture and plate export. The app is about motion; a still alone
      could never show it. */
  const { recording, recordProgress, savePlate, recordClip, captureFrame, isRecording } =
    useCapture(engineRef, canvasRef, scenarioRef, showFlash);

  // Aeolian tone: the shedding frequency, made audible. Off until asked for.
  const toneRef = useRef<AeolianTone | null>(null);
  const [tone, setTone] = useState(false);
  const [shedHz, setShedHz] = useState(0);
  // Mirrored so describe() can stay a stable callback over refs.
  const shedHzRef = useRef(0);

  // Engine + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: FluidEngine;
    const tier = qualityRef.current.tier;
    try {
      engine = new FluidEngine(canvas, {
        ...DEFAULT_PARAMS,
        ...scenarioRef.current.params,
        simResolution: tier.simResolution,
        dyeResolution: tier.dyeResolution,
      });
    } catch (err) {
      // Deferred so the failure path does not set state synchronously inside
      // the effect. This runs at most once, when WebGL2 is unavailable.
      const message = err instanceof Error ? err.message : String(err);
      queueMicrotask(() => setGlError(message));
      return;
    }
    engineRef.current = engine;
    engine.resize();
    scenarioRef.current.onLoad?.(engine);

    let raf = 0;
    let last = performance.now();
    let simTime = 0;
    let fpsEma = 60;
    let frameEma = 16;
    let lastFlush = 0;
    let traceTick = -Infinity;
    const lastObs = { x: NaN, y: NaN };

    const loop = (now: number) => {
      const rawDt = (now - last) / 1000;
      last = now;
      const dt = Math.min(rawDt, 1 / 30);

      // Idle out of sight: the document below the fold is long, and there is
      // no reason to burn a GPU on a simulation nobody is looking at.
      if (!activeRef.current) {
        autopilotRef.current.stepStart = now;
        qualityRef.current.resettle();
        setTelemetry((t) => (t.active ? { ...t, active: false } : t));
        raf = requestAnimationFrame(loop);
        return;
      }

      if (engine.isLost) {
        raf = requestAnimationFrame(loop);
        return;
      }

      engine.resize();

      // Adaptive quality: drop resolution when the frame budget is missed.
      // Suspended while recording — the compositor makes frames slower, and
      // degrading the tank halfway through a clip is exactly wrong.
      const drop = isRecording() ? null : qualityRef.current.sample(rawDt * 1000);
      if (drop) {
        engine.setResolution(drop.simResolution, drop.dyeResolution);
      }

      const ap = autopilotRef.current;
      if (ap.active) {
        const tIn = (now - ap.stepStart) / 1000;
        if (tIn >= TOUR[ap.index].duration) {
          const nextIndex = (ap.index + 1) % TOUR.length;
          const next = TOUR[nextIndex];
          // Each step of the tour is a separate exhibit. Dye normally carries
          // across a scenario change, which looks good when you switch by
          // hand, but the tour walks from the open tunnel into a closed tank
          // where that dye has nowhere to leave — it piled up and washed the
          // step out. A view change within one scenario is left alone.
          if (next.command.scenario && next.command.scenario !== scenarioRef.current.id) {
            engine.clear();
          }
          ap.index = nextIndex;
          ap.stepStart = now;
          applyLabRef.current?.(next.command);
          setTourIndex(ap.index);
        } else if (!engine.paused) {
          TOUR[ap.index].stir?.(engine, tIn);
        }
      }

      // Ease the obstacle rim toward its hover state so the affordance
      // appears and fades rather than snapping.
      const wantHover = grabRef.current === "obstacle" ? 1 : 0;
      engine.obstacleHover += (wantHover - engine.obstacleHover) * Math.min(1, dt * 14);

      if (!engine.paused) {
        simTime += dt;
        scenarioRef.current.emit?.(engine, simTime, dt);
        engine.step(dt);
      }
      engine.render();

      // The cylinder is drawn by the shader every frame; its dimension
      // callout is a DOM element on a 10 Hz tick. Whenever something moves
      // the obstacle without going through the pointer handler — the tour
      // script, a keyboard nudge — the label was left stepping along ten
      // times a second behind a circle moving at the frame rate. Refresh on
      // actual movement, so the cost is paid only while it is moving.
      const obs = engine.obstacle;
      if (obs.x !== lastObs.x || obs.y !== lastObs.y) {
        lastObs.x = obs.x;
        lastObs.y = obs.y;
        refreshInstrRef.current();
      }

      // Clip capture paints here, in the same task as the render, for the
      // same reason the still export does.
      captureFrame(now, canvas);

      // Sample the probe faster than the readout refreshes: the sparkline
      // needs the resolution, but React does not need the updates. Gate on
      // elapsed time rather than frame count so the trace's horizontal axis
      // stays a true time axis at any frame rate.
      if (probeRef.current.on && now - traceTick >= TRACE_INTERVAL_MS) {
        traceTick = now;
        const pr = probeRef.current;
        const buf = traceRef.current;
        const raw = engine.readProbe(pr.x, pr.y).p;
        // Light low-pass: the shedding signal is ~1–3 Hz against a 40 Hz
        // sample rate, so this removes grid noise without touching the wave.
        const prev = buf.length ? buf[buf.length - 1] : raw;
        buf.push(prev + (raw - prev) * 0.4);
        if (buf.length > TRACE_LEN) buf.splice(0, buf.length - TRACE_LEN);
      }

      fpsEma += (1 / Math.max(rawDt, 1e-4) - fpsEma) * 0.05;
      frameEma += (rawDt * 1000 - frameEma) * 0.05;
      if (now - lastFlush > 250) {
        lastFlush = now;
        const [simW, simH] = engine.simSize;
        const [dyeW, dyeH] = engine.dyeSize;
        setTelemetry({
          fps: Math.round(fpsEma),
          frameMs: frameEma,
          simW,
          simH,
          dyeW,
          dyeH,
          quality: qualityRef.current.tier.name,
          active: true,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      engine.dispose();
      engineRef.current = null;
    };
    // Re-runs when the GL context is restored, rebuilding the whole engine.
  }, [glGeneration, captureFrame, isRecording]);

  usePointerInput({
    canvasRef,
    engineRef,
    scenarioRef,
    pointersRef,
    probeRef,
    grabRef,
    splatCounter,
    autopilotRef,
    refreshInstrRef,
    setDragging,
    setGrabTarget,
    setTourIndex,
  });

  const stopAutopilot = useCallback(() => {
    autopilotRef.current.active = false;
    setTourIndex(null);
  }, []);

  /** Manual control takes over: stop the tour unless the tour itself is acting. */
  const userAct = useCallback(() => {
    const ap = autopilotRef.current;
    if (ap.active && !ap.applying) stopAutopilot();
  }, [stopAutopilot]);

  const selectScenario = useCallback((id: string) => {
    userAct();
    const scenario = SCENARIOS.find((s) => s.id === id);
    const engine = engineRef.current;
    if (!scenario || !engine) return;
    scenarioRef.current = scenario;
    setScenarioId(id);
    const next = { ...DEFAULT_PARAMS, ...scenario.params };
    Object.assign(engine.params, next);
    setParams(next);
    // Scenarios opt back in to these via onLoad.
    engine.obstacle = { ...engine.obstacle, radius: 0 };
    engine.wind = { speed: 0, pull: 0 };
    scenario.onLoad?.(engine);
  }, [userAct]);

  const updateParam = useCallback((key: keyof SimParams, value: number) => {
    userAct();
    const engine = engineRef.current;
    if (engine) engine.params[key] = value;
    setParams((prev) => ({ ...prev, [key]: value }));
  }, [userAct]);

  const selectViewMode = useCallback((mode: ViewMode) => {
    userAct();
    if (engineRef.current) engineRef.current.viewMode = mode;
    setViewMode(mode);
  }, [userAct]);

  const togglePause = useCallback(() => {
    userAct();
    setPaused((prev) => {
      if (engineRef.current) engineRef.current.paused = !prev;
      return !prev;
    });
  }, [userAct]);

  const clearField = useCallback(() => {
    userAct();
    engineRef.current?.clear();
  }, [userAct]);

  const fireBurst = useCallback(() => {
    userAct();
    const engine = engineRef.current;
    if (engine) burst(engine, (t) => scenarioRef.current.palette(t * 40).map((c) => c / 0.15) as [number, number, number], 14);
  }, [userAct]);

  /** A sentence describing the tank as it stands, for a screen reader. */
  const describe = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return "The simulation is not running.";
    const sc = scenarioRef.current;
    const pr = probeRef.current;
    const r = probeReadRef.current.value;
    const parts = [`${sc.name}, showing the ${engine.viewMode} field.`];
    if (engine.wind.speed > 0) {
      parts.push(`Flow enters from the left at ${Math.round(engine.wind.speed)} texels per second.`);
    }
    const o = engine.obstacle;
    if (o.radius > 0) {
      const shape = o.shape === "airfoil" ? "wing section" : o.shape === "plate" ? "plate" : "cylinder";
      parts.push(
        `A ${shape} sits ${Math.round(o.x * 100)} percent across and ${Math.round(o.y * 100)} percent up.`,
      );
      if (o.shape === "airfoil" || o.shape === "plate") {
        parts.push(`Its angle of attack is ${Math.round(engine.params.attackAngleDeg)} degrees.`);
      }
    }
    if (pr.on) {
      parts.push(
        `The probe, ${Math.round(pr.x * 100)} percent across and ${Math.round(pr.y * 100)} percent up, reads speed ${Math.round(Math.hypot(r.u, r.v))}, pressure ${r.p.toFixed(1)}, vorticity ${r.curl.toFixed(1)}, temperature ${r.T.toFixed(1)}.`,
      );
      const f = shedHzRef.current;
      if (f > 0) parts.push(`Its pressure is oscillating at ${f.toFixed(2)} hertz.`);
    }
    return parts.join(" ");
  }, []);

  const announce = useCallback((msg: string) => setAnnouncement(msg), []);

  const copyLink = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const hash = encodeState(scenarioRef.current.id, engine.viewMode, engine.params, {
      windSpeed: engine.wind.speed,
      obstacleRadius: engine.obstacle.radius,
    });
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    window.history.replaceState(null, "", `#${hash}`);
    navigator.clipboard?.writeText(url).then(
      () => showFlash("LINK COPIED"),
      () => showFlash("LINK IN ADDRESS BAR"),
    );
  }, [showFlash]);

  const toggleAutopilot = useCallback(() => {
    const ap = autopilotRef.current;
    if (ap.active) {
      stopAutopilot();
      return;
    }
    if (engineRef.current?.paused) togglePause();
    ap.active = true;
    ap.index = 0;
    ap.stepStart = performance.now();
    applyLabRef.current?.(TOUR[0].command);
    setTourIndex(0);
  }, [stopAutopilot, togglePause]);

  // Instrument refresh: read the probe from the GPU and snapshot the
  // annotation geometry. Cheap (four 1×1 readbacks), runs at 10 Hz.
  const refreshInstr = useCallback(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const pr = probeRef.current;

    // Geometry is cheap and must track the pointer; the probe readback is a
    // GPU stall and must not. Reuse the last reading between reads so this
    // can safely be called at pointer rate.
    const now = performance.now();
    const cache = probeReadRef.current;
    if (!pr.on) {
      cache.value = { u: 0, v: 0, p: 0, curl: 0, T: 0 };
    } else if (now - cache.t >= 60) {
      cache.t = now;
      cache.value = engine.readProbe(pr.x, pr.y);
    }

    setInstr({
      w: canvas.clientWidth,
      h: canvas.clientHeight,
      obstacle: { ...engine.obstacle },
      windSpeed: engine.wind.speed,
      attackAngleDeg: engine.params.attackAngleDeg,
      probe: pr.on ? { x: pr.x, y: pr.y } : null,
      reading: cache.value,
      fig: scenarioRef.current.fig,
    });
  }, []);

  // The trace republishes on its own, faster loop. At the instrument's 10 Hz
  // it advanced four samples per update and visibly stepped sideways; at
  // 30 Hz the scroll reads as continuous.
  useEffect(() => {
    const id = setInterval(() => {
      if (!probeRef.current.on) {
        setTrace({ points: [], mid: 0, half: 1.5 });
        return;
      }
      const points = traceRef.current.slice();
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of points) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const targetMid = points.length ? (lo + hi) / 2 : 0;
      // A floor on the range keeps a nearly-flat signal reading flat rather
      // than being amplified into meaningless noise.
      const targetHalf = points.length ? Math.max((hi - lo) / 2, 1.5) : 1.5;
      const prev = traceScaleRef.current;
      const k = 0.12;
      const mid = prev ? prev.mid + (targetMid - prev.mid) * k : targetMid;
      const half = prev ? prev.half + (targetHalf - prev.half) * k : targetHalf;
      traceScaleRef.current = { mid, half };
      setTrace({ points, mid, half });
    }, 33);
    return () => clearInterval(id);
  }, []);

  // Read the shedding frequency off the same trace the sparkline draws, and
  // feed it to the tone. Slow, because the note follows the flow, not the
  // frame rate.
  useEffect(() => {
    // Reported as a running median, not as each window's raw answer. A four
    // second window of a real wake is a small sample: measured on the tank the
    // estimate walks 0.5 · 0.5 · 3.0 · 1.1 · 0.7 while the shedding itself is
    // steady, and a readout that jumps by a factor of six is unreadable —
    // worse, it is untrue, because the thing it describes is not doing that.
    // Nine samples at 200ms is under two seconds of lag on a quantity that
    // changes over tens of seconds.
    const recent: number[] = [];
    const id = setInterval(() => {
      const pitch = probeRef.current.on
        ? estimatePitch(traceRef.current, 1000 / TRACE_INTERVAL_MS)
        : { freq: 0, strength: 0 };

      recent.push(pitch.freq);
      if (recent.length > 9) recent.shift();
      const sorted = [...recent].sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1];

      shedHzRef.current = median;
      setShedHz(median);
      // The tone follows the same median: an octave leap every fifth of a
      // second is the audible version of the same lie.
      toneRef.current?.update({ freq: median, strength: pitch.strength });
    }, 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => toneRef.current?.dispose(), []);

  // Keep the readable account current without announcing it. Refreshed on a
  // slow timer rather than during render, which cannot read refs safely.
  useEffect(() => {
    const update = () => setNarration(describe());
    update();
    const id = setInterval(update, 2000);
    return () => clearInterval(id);
  }, [describe]);

  /** Move the selected instrument, in UV where y is up. */
  const nudge = useCallback(
    (dx: number, dy: number, coarse: boolean) => {
      const engine = engineRef.current;
      if (!engine) return;
      const step = coarse ? 0.05 : 0.01;
      lastDirRef.current = { x: dx, y: dy };
      if (kbTarget === "obstacle" && engine.obstacle.radius > 0) {
        const o = engine.obstacle;
        o.x = Math.min(0.92, Math.max(0.08, o.x + dx * step));
        o.y = Math.min(0.9, Math.max(0.1, o.y + dy * step));
        announce(`Obstacle at ${Math.round(o.x * 100)}, ${Math.round(o.y * 100)}`);
      } else {
        const pr = probeRef.current;
        pr.x = Math.min(0.98, Math.max(0.02, pr.x + dx * step));
        pr.y = Math.min(0.98, Math.max(0.02, pr.y + dy * step));
        announce(`Probe at ${Math.round(pr.x * 100)}, ${Math.round(pr.y * 100)}`);
      }
      refreshInstr();
    },
    [kbTarget, announce, refreshInstr],
  );

  /** Stamp momentum and dye, the keyboard equivalent of a drag. */
  const stir = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const at = kbTarget === "obstacle" && engine.obstacle.radius > 0 ? engine.obstacle : probeRef.current;
    const d = lastDirRef.current;
    splatCounter.current += 1;
    const color = scenarioRef.current.palette(splatCounter.current);
    engine.splat(at.x, at.y, d.x * 0.03, d.y * 0.03, color);
    engine.splatHeat(at.x, at.y, 0.1);
    announce("Stirred");
  }, [kbTarget, announce]);

  const cycleTarget = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || engine.obstacle.radius <= 0) {
      announce("This scenario has no obstacle; the probe stays selected.");
      return;
    }
    setKbTarget((t) => {
      const next = t === "probe" ? "obstacle" : "probe";
      announce(`${next === "probe" ? "Probe" : "Obstacle"} selected`);
      return next;
    });
  }, [announce]);

  const toggleTone = useCallback(async () => {
    if (tone) {
      toneRef.current?.stop();
      setTone(false);
      return;
    }
    // Probing is what produces the signal, so the tone implies it.
    if (!probeRef.current.on) {
      probeRef.current.on = true;
      refreshInstr();
    }
    const t = toneRef.current ?? (toneRef.current = new AeolianTone());
    const ok = await t.start();
    setTone(ok);
    if (!ok) showFlash("AUDIO UNAVAILABLE");
  }, [tone, refreshInstr, showFlash]);

  useEffect(() => {
    refreshInstrRef.current = refreshInstr;
    const id = setInterval(refreshInstr, 100);
    return () => clearInterval(id);
  }, [refreshInstr]);

  /**
   * The two quantities the canvas callouts adjust directly. Neither lives in
   * SimParams — each scenario sets them on the engine — so they are written
   * through here, clamped, and the annotation redrawn at once rather than at
   * the next 10 Hz tick.
   */
  const setWindSpeed = useCallback(
    (v: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      userAct();
      engine.wind.speed = clampTank("windSpeed", v);
      refreshInstr();
    },
    [userAct, refreshInstr],
  );

  const setObstacleRadius = useCallback(
    (v: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      userAct();
      engine.obstacle.radius = clampTank("obstacleRadius", v);
      refreshInstr();
    },
    [userAct, refreshInstr],
  );

  const toggleProbe = useCallback(() => {
    probeRef.current.on = !probeRef.current.on;
    refreshInstr();
  }, [refreshInstr]);

  // Shared command applier, used by TRY IT buttons and the autopilot.
  useEffect(() => {
    applyLabRef.current = (cmd: LabCommand) => {
      const ap = autopilotRef.current;
      ap.applying = true;
      if (cmd.scenario) selectScenario(cmd.scenario);
      if (cmd.view) selectViewMode(cmd.view);
      if (cmd.params) {
        const engine = engineRef.current;
        if (engine) Object.assign(engine.params, cmd.params);
        setParams((prev) => ({ ...prev, ...cmd.params }));
        // A TRY IT action scrolls you to the stage; without this the control
        // it changed is the one thing you cannot see it changed.
        const keys = Object.keys(cmd.params);
        setChangedParams(keys);
        window.setTimeout(
          () => setChangedParams((cur) => (cur === keys ? [] : cur)),
          1400,
        );
      }
      if (cmd.tank) {
        // After selectScenario, which sets these on the engine — otherwise
        // the scenario's own values would land on top of the link's.
        const engine = engineRef.current;
        if (engine) {
          if (cmd.tank.windSpeed != null) {
            engine.wind.speed = clampTank("windSpeed", cmd.tank.windSpeed);
          }
          if (cmd.tank.obstacleRadius != null && engine.obstacle.radius > 0) {
            engine.obstacle.radius = clampTank("obstacleRadius", cmd.tank.obstacleRadius);
          }
          refreshInstr();
        }
      }
      ap.applying = false;
    };
  }, [selectScenario, selectViewMode, refreshInstr]);

  // Commands arriving from TRY IT buttons take over from the autopilot.
  useEffect(() => {
    return onLabCommand((cmd) => {
      stopAutopilot();
      applyLabRef.current?.(cmd);
    });
  }, [stopAutopilot]);

  // A shared link restores its configuration once the engine exists.
  useEffect(() => {
    if (!engineRef.current) return;
    const cmd = decodeState(window.location.hash);
    if (cmd) applyLabRef.current?.(cmd);
    // Runs once on mount; applyLabRef is populated by the effect above.
  }, []);

  // Keyboard: drive the whole instrument without touching the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      if (e.key === "Escape") {
        if (autopilotRef.current.active) stopAutopilot();
        return;
      }

      // Arrows belong to the page unless the tank has been focused. Claiming
      // them globally would break scrolling through a 14,000px document.
      if (canvasFocusedRef.current) {
        const arrows: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, 1],
          ArrowDown: [0, -1],
        };
        const dir = arrows[e.key];
        if (dir) {
          e.preventDefault();
          nudge(dir[0], dir[1], e.shiftKey);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          stir();
          return;
        }
        if (e.key.toLowerCase() === "o") {
          e.preventDefault();
          cycleTarget();
          return;
        }
      }

      // Read the tank aloud, from anywhere.
      if (e.key === ".") {
        setNarration(describe());
        announce(describe());
        return;
      }

      const digit = Number(e.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= SCENARIOS.length) {
        selectScenario(SCENARIOS[digit - 1].id);
        return;
      }

      const views: Record<string, ViewMode> = {
        d: "dye",
        v: "velocity",
        p: "pressure",
        c: "curl",
        h: "heat",
      };
      const key = e.key.toLowerCase();
      if (views[key]) {
        selectViewMode(views[key]);
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        togglePause();
      } else if (key === "b") fireBurst();
      else if (key === "x") clearField();
      else if (key === "a") toggleAutopilot();
      else if (key === "r") toggleProbe();
      else if (key === "s") savePlate();
      else if (key === "m") recordClip();
      else if (key === "l") copyLink();
      else if (key === "t") void toggleTone();
      else if (key === "?" || (e.shiftKey && key === "/")) setShowKeys((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    stopAutopilot,
    selectScenario,
    selectViewMode,
    togglePause,
    fireBurst,
    clearField,
    toggleAutopilot,
    toggleProbe,
    savePlate,
    recordClip,
    copyLink,
    toggleTone,
    nudge,
    stir,
    cycleTarget,
    describe,
    announce,
  ]);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];

  return (
    <section className="stage" aria-label="Fluid simulation playground">
      <div
        className={`canvasWrap${docked ? " canvasWrapDocked" : ""}`}
        style={docked && dockSize ? { width: dockSize.w, height: dockSize.h } : undefined}
      >
        {glError ? (
          <div className="glError" role="alert">
            <p className="glErrorTitle">SOLVER OFFLINE</p>
            <p>{glError}</p>
            <p>Open this page in a browser with WebGL2 and float-texture support to run the simulation.</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="fluidCanvas"
            tabIndex={0}
            // role=application so arrow keys reach the tank instead of being
            // swallowed by a screen reader's browse mode.
            role="application"
            data-grab={grabTarget}
            data-dragging={dragging ? "true" : undefined}
            data-kb={canvasFocused ? kbTarget : undefined}
            aria-label={
              "Fluid tank. Drag to stir. With this focused, arrow keys move the " +
              (kbTarget === "obstacle" ? "obstacle" : "probe") +
              ", O switches between probe and obstacle, Enter stirs, and full stop reads the tank aloud."
            }
            onFocus={() => {
              canvasFocusedRef.current = true;
              setCanvasFocused(true);
              announce(
                `Tank focused. Arrow keys move the ${kbTarget}. Press O to switch, Enter to stir, full stop to hear the readings.`,
              );
            }}
            onBlur={() => {
              canvasFocusedRef.current = false;
              setCanvasFocused(false);
            }}
          />
        )}
        <p className="stageHint">{scenario.hint ?? "DRAG TO DISTURB THE FIELD"}</p>

        {/* Readable at any time in browse mode, and deliberately NOT a live
            region: the solver changes four times a second and announcing that
            continuously would make the page unusable. */}
        <section className="srOnly" aria-label="State of the simulation">
          <p>{narration}</p>
        </section>

        {/* Discrete events only — a move, a selection, a stir. */}
        <p className="srOnly" role="status" aria-live="polite">
          {announcement}
        </p>
        {!glError && instr && (
          <Annotations
            snap={instr}
            trace={trace}
            probeHover={grabTarget === "probe" || (canvasFocused && kbTarget === "probe")}
            shedHz={shedHz}
            onWindSpeed={setWindSpeed}
            onObstacleRadius={setObstacleRadius}
          />
        )}
        {contextLost && (
          <p className="flash flashHold" role="status">
            GPU CONTEXT LOST — WAITING FOR RESTORE
          </p>
        )}
        {flash && !contextLost && (
          <p className="flash" role="status">
            {flash}
          </p>
        )}
        {showKeys && (
          <div className="keysCard" role="dialog" aria-label="Keyboard shortcuts">
            <p className="keysTitle">KEYBOARD</p>
            <dl className="keysList">
              {[
                ["TAB", "FOCUS THE TANK"],
                ["↑ ↓ ← →", "MOVE SELECTION"],
                ["SHIFT + ↑", "COARSE STEP"],
                ["O", "PROBE / OBSTACLE"],
                ["ENTER", "STIR"],
                [".", "READ THE TANK"],
                ["1–7", "SPECIMEN"],
                ["D V P C H", "FIELD X-RAY"],
                ["SPACE", "PAUSE"],
                ["B / X", "BURST / CLEAR"],
                ["A", "AUTO.PILOT"],
                ["R", "PROBE"],
                ["S", "SAVE PLATE"],
                ["M", "RECORD CLIP"],
                ["L", "COPY LINK"],
                ["T", "AEOLIAN TONE"],
                ["ESC", "TAKE OVER"],
                ["?", "CLOSE"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {tourIndex !== null && !glError && (
          <div className="tourCaption" role="status">
            <span className="tourStep">
              AUTO.PILOT {String(tourIndex + 1).padStart(2, "0")}/{String(TOUR.length).padStart(2, "0")} — ESC OR TOUCH TO TAKE OVER
            </span>
            <p>{TOUR[tourIndex].caption}</p>
            <div
              className="tourProgress"
              key={tourIndex}
              style={{ animationDuration: `${TOUR[tourIndex].duration}s` }}
            />
          </div>
        )}
      </div>
      {docked && (
        <button
          type="button"
          className="dockBar"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={
            {
              // Unscaled: the stylesheet multiplies by --dock-scale, which
              // it also uses for the transform. Two copies of that number
              // disagreed the moment the phone dock needed a different one.
              "--dock-w-raw": `${dockSize?.w ?? 0}px`,
            } as React.CSSProperties
          }
        >
          <span className="dockFig">{scenario.name}</span>
          {/* Three words wrap to three lines in a 133px strip on a phone. */}
          <span className="dockBack">
            <span className="dockBackLong">RETURN TO THE TANK </span>↑
          </span>
        </button>
      )}

      <ControlPanel
        scenarios={SCENARIOS}
        activeScenario={scenario}
        onScenario={selectScenario}
        viewMode={viewMode}
        onViewMode={selectViewMode}
        params={params}
        onParam={updateParam}
        defaults={{ ...DEFAULT_PARAMS, ...scenario.params }}
        obstacleShape={instr?.obstacle.shape ?? "circle"}
        changedParams={changedParams}
        paused={paused}
        onTogglePause={togglePause}
        onClear={clearField}
        onBurst={fireBurst}
        autopilot={tourIndex !== null}
        onToggleAutopilot={toggleAutopilot}
        probe={instr ? instr.probe !== null : true}
        onToggleProbe={toggleProbe}
        tone={tone}
        onToggleTone={toggleTone}
        onSavePlate={savePlate}
        onRecord={recordClip}
        recording={recording}
        recordProgress={recordProgress}
        onCopyLink={copyLink}
        onToggleKeys={() => setShowKeys((s) => !s)}
        telemetry={telemetry}
      />
    </section>
  );
}
