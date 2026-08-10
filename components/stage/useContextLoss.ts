"use client";

// A lost GL context is not a crash and must not be treated as one.
//
// The browser takes the context away on a driver reset, a GPU switch, or
// simply too many live contexts, and it will give it back. Before this, the
// canvas went black permanently while telemetry cheerfully reported 120 FPS —
// a frozen picture and a readout insisting everything was fine, which is the
// one thing the instrument is not allowed to do.

import { useEffect, useState, type RefObject } from "react";

export interface ContextLoss {
  /** True between loss and restore; the overlay reads this. */
  contextLost: boolean;
  /** Bumped on restore. Rebuilds the engine from scratch on the same canvas. */
  glGeneration: number;
}

export function useContextLoss(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  onRestore: () => void,
): ContextLoss {
  const [contextLost, setContextLost] = useState(false);
  const [glGeneration, setGlGeneration] = useState(0);

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
      onRestore();
      setGlGeneration((g) => g + 1);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
    // onRestore is a stable callback over refs; re-subscribing on every render
    // would drop the listeners the loss handler depends on.
  }, [canvasRef, onRestore]);

  return { contextLost, glGeneration };
}
