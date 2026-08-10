"use client";

// A throw anywhere inside the stage used to unmount the whole document —
// canvas, controls, and the fourteen thousand pixels of essay below it — and
// leave a white page with no indication that anything had happened. The essay
// does not depend on the solver, so there is no reason for it to go down with
// it.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown in place of the subtree. Keep it the size of what it replaces. */
  fallback: (retry: () => void) => ReactNode;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console is where a bug report starts; the readout below only says
    // that something failed, not what.
    console.error("Stage failed:", error, info.componentStack);
  }

  private retry = () => this.setState({ failed: false });

  render() {
    return this.state.failed ? this.props.fallback(this.retry) : this.props.children;
  }
}
