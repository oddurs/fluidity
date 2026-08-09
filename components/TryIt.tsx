"use client";

// The TRY IT box: prose instruction plus buttons that actually perform it —
// each button sends a command to the live solver and scrolls the stage into
// view so you see the consequence of the math you just read.

import { LabCommand, sendLabCommand } from "@/lib/fluid/bus";

export interface LabAction {
  label: string;
  command: LabCommand;
}

export function TryIt({ actions, children }: { actions?: LabAction[]; children: React.ReactNode }) {
  const run = (action: LabAction) => {
    sendLabCommand(action.command);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(".stage")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div className="tryIt">
      <span className="tryItLabel">TRY IT</span>
      <div className="tryItBody">
        <p>{children}</p>
        {actions && actions.length > 0 && (
          <div className="tryItActions">
            {actions.map((action) => (
              <button key={action.label} className="btn tryBtn" onClick={() => run(action)}>
                ▶ {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
