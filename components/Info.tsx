"use client";

// A definition you can ask for. The interface is dense with notation that is
// standard in fluid dynamics and opaque outside it — U∞ is not a statistic,
// it is a boundary condition — and nothing on screen said so.

import { useEffect, useId, useRef, useState } from "react";

export function Info({
  term,
  children,
}: {
  /** The thing being defined, shown as the popover's heading. */
  term: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // A tap outside closes it, which is the only way out on touch.
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <span
      className="info"
      ref={wrapRef}
      // Hover is a convenience for pointers; the button carries the behaviour
      // so keyboard and touch reach it too.
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
    >
      <button
        type="button"
        className="infoDot"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What is ${term}?`}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      <span className="infoCard" id={id} role="tooltip" hidden={!open}>
        <span className="infoTerm">{term}</span>
        {children}
      </span>
    </span>
  );
}
