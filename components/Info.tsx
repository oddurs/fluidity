"use client";

// A definition you can ask for. The interface is dense with notation that is
// standard in fluid dynamics and opaque outside it — U∞ is not a statistic,
// it is a boundary condition — and nothing on screen said so.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CARD_W = 262;
const GAP = 10;
const MARGIN = 8;

export function Info({
  term,
  children,
}: {
  /** The thing being defined, shown as the popover's heading. */
  term: string;
  children: React.ReactNode;
}) {
  // Hovering previews; clicking pins. Toggling one flag on both meant a mouse
  // click closed the card that hovering had just opened.
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const h = cardRef.current?.offsetHeight ?? 120;
    // Prefer above; drop below only when there is not room.
    const below = r.top - h - GAP < MARGIN;
    const left = Math.min(
      Math.max(MARGIN, r.left + r.width / 2 - CARD_W / 2),
      window.innerWidth - CARD_W - MARGIN,
    );
    setPos({ left, top: below ? r.bottom + GAP : r.top - h - GAP, below });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setPinned(false);
      setHovered(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !cardRef.current?.contains(t)) close();
    };
    // The control column scrolls independently of the page, so listen in the
    // capture phase to catch either one and keep the card on its trigger.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="infoDot"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What is ${term}?`}
        onClick={() => setPinned((v) => !v)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
      >
        i
      </button>
      {/* Rendered at the document root on purpose: the control column is a
          scroll container, and a card positioned inside it was clipped at the
          panel edge and disappeared behind the canvas. */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={cardRef}
            id={id}
            role="tooltip"
            className="infoCard"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
          >
            <span className="infoTerm">{term}</span>
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
