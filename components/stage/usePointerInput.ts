"use client";

// Pointer input: stirring, and picking things up.
//
// One listener set handles three different intentions — drag the fluid, carry
// the cylinder, move the probe — and which one applies is decided by what the
// press landed on. Hover does double duty: it advertises what is grabbable
// and stirs gently, so the canvas answers the instant a cursor crosses it.

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { FluidEngine } from "@/lib/fluid/engine";
import type { Scenario } from "@/lib/fluid/scenarios";

export type GrabTarget = "none" | "obstacle" | "probe";

export interface PointerState {
  x: number;
  y: number;
  color: [number, number, number];
  /** What the pointer grabbed: the fluid, the obstacle, or the probe. */
  mode: "splat" | "obstacle" | "probe";
}

export interface PointerInputDeps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  engineRef: RefObject<FluidEngine | null>;
  scenarioRef: RefObject<Scenario>;
  pointersRef: RefObject<Map<number, PointerState>>;
  probeRef: RefObject<{ x: number; y: number; on: boolean }>;
  grabRef: RefObject<GrabTarget>;
  splatCounter: RefObject<number>;
  autopilotRef: RefObject<{ active: boolean }>;
  /** Redraw the annotations now, rather than at the next 10 Hz tick. */
  refreshInstrRef: RefObject<() => void>;
  setDragging: Dispatch<SetStateAction<boolean>>;
  setGrabTarget: Dispatch<SetStateAction<GrabTarget>>;
  setTourIndex: Dispatch<SetStateAction<number | null>>;
}

export function usePointerInput({
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
}: PointerInputDeps) {
  // Destructured out here rather than inside the effect so the dependency
  // list can name each collaborator. Every one is a ref object or a setState
  // function — stable for the life of the component — so this subscribes once,
  // which is what the listeners need. Depending on the params object instead
  // would resubscribe on every render, since that object is new each time.
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
  }, [
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
  ]);
}
