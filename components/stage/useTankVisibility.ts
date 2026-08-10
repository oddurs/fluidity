"use client";

// Where the tank is, and whether it should be running.
//
// Two questions that sound like one and are not. "Is the stage off screen?"
// decides whether to dock the tank into a corner so the essay's TRY IT
// actions still have something visible to act on. "Is the canvas off screen,
// or the tab hidden?" decides whether to step the solver at all. They watch
// different elements and one is allowed to be true while the other is false.

import { useEffect, useState, type RefObject } from "react";

/** Below this a docked thumbnail would cover the text it accompanies. */
const MIN_DOCK_W = 900;
const MIN_DOCK_H = 560;

export interface Dock {
  docked: boolean;
  /**
   * The wrap's measured size, frozen at the moment of docking. State rather
   * than a ref because it is read during render, and a ref read there is
   * unsound when a render can be discarded and replayed.
   */
  dockSize: { w: number; h: number } | null;
}

/**
 * Dock the tank when the stage leaves the viewport. The element keeps its
 * measured size and is scaled down, so the drawing buffer never changes and
 * the simulation is not disturbed by docking.
 */
export function useDock(canvasRef: RefObject<HTMLCanvasElement | null>): Dock {
  const [docked, setDocked] = useState(false);
  const [dockSize, setDockSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const wrap = canvasRef.current?.parentElement;
    const stage = wrap?.parentElement;
    if (!wrap || !stage) return;
    const roomy = () => window.innerWidth >= MIN_DOCK_W && window.innerHeight >= MIN_DOCK_H;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const shouldDock = !entry.isIntersecting && roomy();
        if (shouldDock) {
          const r = wrap.getBoundingClientRect();
          // Exact, not rounded: half a pixel of difference changes the canvas
          // client size and rebuilds every framebuffer on dock.
          setDockSize({ w: r.width, h: r.height });
        }
        setDocked(shouldDock);
      },
      { threshold: 0 },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, [canvasRef]);

  return { docked, dockSize };
}

/**
 * Keep `activeRef` current: the solver steps only while the canvas is on
 * screen and the tab is visible. A ref because the render loop reads it every
 * frame and must not re-subscribe to do so.
 */
export function useActiveWhileVisible(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  activeRef: RefObject<boolean>,
) {
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
  }, [canvasRef, activeRef]);
}
