"use client";

// The stage, with a floor under it.
//
// The fallback lives here rather than in the page because a render prop
// cannot cross from a server component into a client one, and it lives here
// rather than inside ErrorBoundary because the boundary itself has no opinion
// about fluid dynamics.

import { ErrorBoundary } from "./ErrorBoundary";
import { Stage } from "./Stage";

export function StageBoundary() {
  return (
    <ErrorBoundary
      fallback={(retry) => (
        <section className="stage stageFailed" aria-label="The simulation stopped">
          <div className="stageFailedCard">
            <p className="panelLabel">TANK OFFLINE</p>
            <p>
              The simulation stopped. The mathematics below is unaffected, and the
              console has the details.
            </p>
            <button className="btn" onClick={retry}>
              RESTART THE TANK
            </button>
          </div>
        </section>
      )}
    >
      <Stage />
    </ErrorBoundary>
  );
}
