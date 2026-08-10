"use client";

// A number you can drag, or nudge with the arrow keys.
//
// The canvas callouts looked like controls long before they were any — a
// filled chip with a hard edge is what every button in this interface wears —
// and people reached for them expecting to drag. This makes that true rather
// than styling the expectation away.
//
// Keyboard is not an afterthought here: the same handle takes arrow keys when
// focused, so the cylinder can be resized without a pointer, like everything
// else in the tank.

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from "react";

export interface DragHandle {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

export interface DragHandleOptions {
  /** "x" drags horizontally, "y" vertically. Only one axis ever applies. */
  axis: "x" | "y";
  /** Units per pixel dragged. Negative to invert (screen y grows downward). */
  perPixel: number;
  /** Units per arrow press. */
  step: number;
  /** Current value, read at gesture start. */
  read: () => number;
  /** Called with each new value; expected to clamp. */
  write: (value: number) => void;
}

export function useDragHandle({ axis, perPixel, step, read, write }: DragHandleOptions): DragHandle {
  const start = useRef({ pos: 0, value: 0 });

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      // The info button lives inside the handle. Without this, pressing it
      // starts a drag and the preventDefault below eats its click.
      if ((e.target as HTMLElement).closest(".infoDot")) return;
      // Without this the press also reaches the canvas underneath and stirs
      // the fluid, so every resize left a splat behind it.
      e.preventDefault();
      e.stopPropagation();
      start.current = { pos: axis === "x" ? e.clientX : e.clientY, value: read() };

      // On window, not on the element with pointer capture. Capture is meant
      // to keep delivering moves once the cursor leaves the element, and in
      // Firefox it did not — a drag that ran off the tag stopped updating
      // after a few pixels, so the value never reached its bound. The window
      // hears every move regardless of what is under the cursor.
      const move = (ev: globalThis.PointerEvent) => {
        const now = axis === "x" ? ev.clientX : ev.clientY;
        write(start.current.value + (now - start.current.pos) * perPixel);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [axis, perPixel, read, write],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const bigger = axis === "x" ? "ArrowRight" : "ArrowUp";
      const smaller = axis === "x" ? "ArrowLeft" : "ArrowDown";
      if ((e.target as HTMLElement).closest(".infoDot")) return;
      if (e.key !== bigger && e.key !== smaller) return;
      // The tank claims arrows for the probe and the obstacle; while this
      // handle has focus they belong to it.
      e.preventDefault();
      e.stopPropagation();
      write(read() + (e.key === bigger ? step : -step));
    },
    [axis, step, read, write],
  );

  return { onPointerDown, onKeyDown };
}
