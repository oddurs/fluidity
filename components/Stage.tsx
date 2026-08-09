"use client";

// The playground: canvas + control panel. Owns the engine instance,
// the requestAnimationFrame loop, pointer input, and telemetry.

import { useCallback, useEffect, useRef, useState } from "react";
import { LabCommand, onLabCommand } from "@/lib/fluid/bus";
import { DEFAULT_PARAMS, FluidEngine, SimParams, ViewMode } from "@/lib/fluid/engine";
import { burst, Scenario, SCENARIOS } from "@/lib/fluid/scenarios";
import { decodeState, encodeState } from "@/lib/fluid/permalink";
import { buildPlate, downloadPlate } from "@/lib/fluid/plate";
import { QualityController } from "@/lib/fluid/quality";
import { AeolianTone, estimatePitch } from "@/lib/fluid/tone";
import { TOUR } from "@/lib/fluid/tour";
import { Annotations, InstrumentSnapshot, TraceView } from "./Annotations";
import { ControlPanel } from "./ControlPanel";

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

interface PointerState {
  x: number;
  y: number;
  color: [number, number, number];
  /** What the pointer grabbed: the fluid, the obstacle, or the probe. */
  mode: "splat" | "obstacle" | "probe";
}

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

  // A lost GL context can be restored by the browser; bumping the generation
  // rebuilds the engine from scratch on the same canvas.
  const [glGeneration, setGlGeneration] = useState(0);
  const [contextLost, setContextLost] = useState(false);

  const qualityRef = useRef(new QualityController());
  /** Stepping only runs while the canvas is visible and the tab is focused. */
  const activeRef = useRef(true);

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
  const [showKeys, setShowKeys] = useState(false);

  // What the cursor is currently over, so the canvas can advertise that the
  // cylinder and the probe are things you can pick up.
  const [grabTarget, setGrabTarget] = useState<"none" | "obstacle" | "probe">("none");
  const [dragging, setDragging] = useState(false);
  const grabRef = useRef<"none" | "obstacle" | "probe">("none");

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

  // Aeolian tone: the shedding frequency, made audible. Off until asked for.
  const toneRef = useRef<AeolianTone | null>(null);
  const [tone, setTone] = useState(false);
  const [shedHz, setShedHz] = useState(0);

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
      const drop = qualityRef.current.sample(rawDt * 1000);
      if (drop) {
        engine.setResolution(drop.simResolution, drop.dyeResolution);
      }

      const ap = autopilotRef.current;
      if (ap.active) {
        const tIn = (now - ap.stepStart) / 1000;
        if (tIn >= TOUR[ap.index].duration) {
          ap.index = (ap.index + 1) % TOUR.length;
          ap.stepStart = now;
          applyLabRef.current?.(TOUR[ap.index].command);
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
  }, [glGeneration]);

  // WebGL context loss — a GPU reset, a driver update, or simply waking a
  // laptop. Without this the canvas stays black forever while the loop keeps
  // spinning and telemetry keeps reporting a healthy frame rate.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onLost = (e: Event) => {
      // Preventing the default is what makes the context restorable at all.
      e.preventDefault();
      setContextLost(true);
    };
    const onRestored = () => {
      setContextLost(false);
      qualityRef.current.resettle();
      setGlGeneration((g) => g + 1);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, []);

  // Idle when the tab is hidden or the stage is scrolled out of view.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let onScreen = true;
    const update = () => {
      activeRef.current = onScreen && !document.hidden;
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        update();
      },
      { threshold: 0 },
    );
    observer.observe(canvas);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  // Pointer input → splats
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toUV = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: 1 - (e.clientY - rect.top) / rect.height,
      };
    };

    // A fingertip is far less precise than a cursor, so grab targets grow on
    // touch devices rather than demanding pixel accuracy.
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const PROBE_GRAB_PX = coarse ? 30 : 18;
    const OBSTACLE_GRAB = coarse ? 2.1 : 1.6;

    /** Which grabbable thing, if any, sits under this point. */
    const hitTest = (x: number, y: number): "none" | "obstacle" | "probe" => {
      const engine = engineRef.current;
      if (!engine) return "none";
      const rect = canvas.getBoundingClientRect();
      const pr = probeRef.current;
      if (pr.on && Math.hypot((x - pr.x) * rect.width, (y - pr.y) * rect.height) < PROBE_GRAB_PX) {
        return "probe";
      }
      const obs = engine.obstacle;
      if (obs.radius > 0) {
        const ddx = (x - obs.x) * (rect.width / rect.height);
        const ddy = y - obs.y;
        if (Math.hypot(ddx, ddy) < obs.radius * OBSTACLE_GRAB) return "obstacle";
      }
      return "none";
    };

    const hoverPrev = { current: null as { x: number; y: number } | null };

    const down = (e: PointerEvent) => {
      // Capture is an optimisation, not a requirement — and it throws on
      // some engines for pointer ids they consider inactive. Letting that
      // escape would abort the handler and the drag would never begin.
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Without capture the drag still tracks while the pointer stays
        // over the canvas, which is the common case.
      }
      const engine = engineRef.current;
      const { x, y } = toUV(e);

      const hit = hitTest(x, y);
      setDragging(true);

      // Grabbing the probe is passive measurement, so it does not interrupt
      // the autopilot the way disturbing the fluid does.
      if (hit === "probe") {
        pointersRef.current.set(e.pointerId, { x, y, color: [0, 0, 0], mode: "probe" });
        return;
      }

      // Touching the fluid takes over from the autopilot.
      if (autopilotRef.current.active) {
        autopilotRef.current.active = false;
        setTourIndex(null);
      }

      if (hit === "obstacle") {
        pointersRef.current.set(e.pointerId, { x, y, color: [0, 0, 0], mode: "obstacle" });
        return;
      }

      const color = scenarioRef.current.palette(splatCounter.current++);
      pointersRef.current.set(e.pointerId, { x, y, color, mode: "splat" });
      engine?.splat(x, y, 0, 0, [color[0] * 10, color[1] * 10, color[2] * 10]);
    };

    const move = (e: PointerEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      const { x, y } = toUV(e);
      const p = pointersRef.current.get(e.pointerId);
      if (!p) {
        // Hover: no button held. Advertise anything grabbable under the
        // cursor, then stir gently so the canvas responds the instant a
        // cursor crosses it.
        if (e.pointerType === "mouse") {
          const hit = hitTest(x, y);
          if (hit !== grabRef.current) {
            grabRef.current = hit;
            setGrabTarget(hit);
          }
          if (hit !== "none") {
            hoverPrev.current = { x, y };
            return;
          }
          const color = scenarioRef.current.palette(splatCounter.current);
          const prev = hoverPrev.current;
          if (prev) {
            const dx = x - prev.x;
            const dy = y - prev.y;
            if (Math.abs(dx) + Math.abs(dy) > 0.0005) {
              splatCounter.current += 0.02;
              engine.splat(x, y, dx * 0.6, dy * 0.6, [color[0] * 0.25, color[1] * 0.25, color[2] * 0.25]);
            }
          }
          hoverPrev.current = { x, y };
        }
        return;
      }
      const dx = x - p.x;
      const dy = y - p.y;
      p.x = x;
      p.y = y;
      if (p.mode === "probe") {
        const pr = probeRef.current;
        pr.x = Math.min(0.98, Math.max(0.02, x));
        pr.y = Math.min(0.98, Math.max(0.02, y));
        refreshInstrRef.current();
        return;
      }
      if (p.mode === "obstacle") {
        // Carry the cylinder with the pointer and stir the fluid it sweeps
        // through, so moving it sheds a wake.
        const obs = engine.obstacle;
        obs.x = Math.min(0.92, Math.max(0.08, x));
        obs.y = Math.min(0.9, Math.max(0.1, y));
        if (Math.abs(dx) + Math.abs(dy) > 0.0002) {
          engine.splat(obs.x, obs.y, dx * 0.8, dy * 0.8, [0, 0, 0]);
        }
        // The cylinder is drawn by the shader every frame, so its dimension
        // annotation has to keep up with the pointer too — left to the 10 Hz
        // instrument tick it visibly lagged and stuttered behind the drag.
        refreshInstrRef.current();
        return;
      }
      if (Math.abs(dx) + Math.abs(dy) > 0.0002) {
        // Drift the hue as the stroke travels, so long drags leave a
        // rainbow wake instead of a single-color smear.
        splatCounter.current += 0.03;
        p.color = scenarioRef.current.palette(splatCounter.current);
        engine.splat(x, y, dx, dy, p.color);
        // Strokes always deposit heat. With buoyancy on it lifts; with it
        // off the heat is a passive tracer you can still watch advect.
        engine.splatHeat(x, y, 0.1);
      }
    };

    const up = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size === 0) setDragging(false);
    };

    const leave = () => {
      hoverPrev.current = null;
      grabRef.current = "none";
      setGrabTarget("none");
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", leave);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", leave);
    };
  }, []);

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

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash((cur) => (cur === msg ? null : cur)), 2200);
  }, []);

  const savePlate = useCallback(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const scenario = scenarioRef.current;
    const [simW, simH] = engine.simSize;
    const [dyeW, dyeH] = engine.dyeSize;
    const now = new Date();
    const stamp = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    try {
      const url = buildPlate(engine, canvas, {
        fig: scenario.fig ?? "FIG. — SPECIMEN",
        scenarioName: scenario.name,
        view: engine.viewMode,
        params: engine.params,
        simGrid: `${simW}×${simH}`,
        dyeGrid: `${dyeW}×${dyeH}`,
        stamp,
      });
      downloadPlate(url, `fluidity-${scenario.id}-${now.getTime()}.png`);
      showFlash("PLATE SAVED");
    } catch {
      showFlash("PLATE EXPORT FAILED");
    }
  }, [showFlash]);

  const copyLink = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const hash = encodeState(scenarioRef.current.id, engine.viewMode, engine.params);
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
    const id = setInterval(() => {
      const pitch = probeRef.current.on
        ? estimatePitch(traceRef.current, 1000 / TRACE_INTERVAL_MS)
        : { freq: 0, strength: 0 };
      setShedHz(pitch.freq);
      toneRef.current?.update(pitch);
    }, 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => toneRef.current?.dispose(), []);

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
      ap.applying = false;
    };
  }, [selectScenario, selectViewMode]);

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
    copyLink,
    toggleTone,
  ]);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];

  return (
    <section className="stage" aria-label="Fluid simulation playground">
      <div className="canvasWrap">
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
            data-grab={grabTarget}
            data-dragging={dragging ? "true" : undefined}
            aria-label="Interactive fluid simulation. Drag to stir the fluid."
          />
        )}
        <p className="stageHint">{scenario.hint ?? "DRAG TO DISTURB THE FIELD"}</p>
        {!glError && instr && (
          <Annotations
            snap={instr}
            trace={trace}
            probeHover={grabTarget === "probe"}
            shedHz={shedHz}
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
                ["1–7", "SPECIMEN"],
                ["D V P C H", "FIELD X-RAY"],
                ["SPACE", "PAUSE"],
                ["B / X", "BURST / CLEAR"],
                ["A", "AUTO.PILOT"],
                ["R", "PROBE"],
                ["S", "SAVE PLATE"],
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
        onCopyLink={copyLink}
        onToggleKeys={() => setShowKeys((s) => !s)}
        telemetry={telemetry}
      />
    </section>
  );
}
