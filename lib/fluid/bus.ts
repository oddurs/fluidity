// A one-way command bus from the science sections' TRY IT buttons to the
// live stage. Module-level pub/sub — both ends are client code in the same
// bundle, and this avoids threading React context through server components.

import type { SimParams, ViewMode } from "./engine";

export interface LabCommand {
  /** Scenario id to activate (applied before params, which then override). */
  scenario?: string;
  view?: ViewMode;
  params?: Partial<SimParams>;
}

type Listener = (cmd: LabCommand) => void;

const listeners = new Set<Listener>();

export function onLabCommand(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function sendLabCommand(cmd: LabCommand) {
  listeners.forEach((fn) => fn(cmd));
}
