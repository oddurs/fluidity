import { StageBoundary } from "@/components/StageBoundary";
import { Science } from "@/components/Science";

export default function Home() {
  return (
    <>
      {/* No top bar: it repeated the wordmark that already sits on the canvas,
          and put a bright band above a dark simulation. The stage now owns
          the whole viewport. */}
      {/* The essay does not depend on the solver, so a solver that throws
          should not take fourteen thousand pixels of prose down with it. */}
      <StageBoundary />
      <a className="scrollCue" href="#sec-00" aria-label="Scroll to the mathematics">
        <span className="scrollCueTicker" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <span className="scrollCueRun" key={i}>
              SCROLL FOR THE MATHEMATICS <em>▼</em>{" "}
              <span className="sym">∂u/∂t = −(u·∇)u − ∇p/ρ + ν∇²u + F</span> <em>▼</em>{" "}
              <span className="sym">∇·u = 0</span> <em>▼</em>{" "}
            </span>
          ))}
        </span>
        <span className="scrollCueStatic">SCROLL FOR THE MATHEMATICS ▼</span>
      </a>
      <Science />
    </>
  );
}
