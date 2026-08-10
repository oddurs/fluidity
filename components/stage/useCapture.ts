"use client";

// Taking the tank away with you: one frame, or six seconds of them.
//
// Both exports share a layout — header rule, full-bleed specimen, data block —
// so they share the code that paints it. The still is one frame of what the
// clip records thirty times a second.
//
// The awkward part, and the reason this hook exposes a per-frame function
// instead of owning a timer: `preserveDrawingBuffer` is false, so the canvas
// can only be read in the same task as the render that filled it. `frame()`
// has to be called from inside the render loop.

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { FluidEngine } from "@/lib/fluid/engine";
import { buildPlate, downloadPlate, type PlateInfo } from "@/lib/fluid/plate";
import { ClipRecorder, downloadClip, extensionFor, pickMimeType } from "@/lib/fluid/recorder";
import type { Scenario } from "@/lib/fluid/scenarios";

/** Long enough to show several shedding cycles, short enough to send. */
const CLIP_MS = 6000;

/**
 * The progress fill has about twenty legible steps. Re-rendering on every
 * frame instead is exactly the disturbance a capture is not allowed to cause.
 */
const PROGRESS_STEPS = 20;

export interface Capture {
  recording: boolean;
  recordProgress: number;
  savePlate: () => void;
  recordClip: () => void;
  /**
   * Call from the render loop, immediately after the engine has drawn. Cheap
   * and inert when no capture is running.
   */
  captureFrame: (now: number, canvas: HTMLCanvasElement) => void;
  /** True while a clip is running; the quality controller stands down for it. */
  isRecording: () => boolean;
}

export function useCapture(
  engineRef: RefObject<FluidEngine | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  scenarioRef: RefObject<Scenario>,
  flash: (msg: string) => void,
): Capture {
  const recorderRef = useRef<ClipRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const stepRef = useRef(-1);

  /** Built fresh each frame so the data block tracks the running solver. */
  const plateInfo = useCallback((): PlateInfo => {
    const engine = engineRef.current!;
    const scenario = scenarioRef.current;
    const [simW, simH] = engine.simSize;
    const [dyeW, dyeH] = engine.dyeSize;
    return {
      fig: scenario.fig ?? "FIG. — SPECIMEN",
      scenarioName: scenario.name,
      view: engine.viewMode,
      params: engine.params,
      simGrid: `${simW}×${simH}`,
      dyeGrid: `${dyeW}×${dyeH}`,
      stamp: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
    };
  }, [engineRef, scenarioRef]);

  const savePlate = useCallback(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    try {
      const url = buildPlate(engine, canvas, plateInfo());
      downloadPlate(url, `fluidity-${scenarioRef.current.id}-${Date.now()}.png`);
      flash("PLATE SAVED");
    } catch {
      flash("PLATE EXPORT FAILED");
    }
  }, [engineRef, canvasRef, scenarioRef, plateInfo, flash]);

  const recordClip = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || recorderRef.current?.running) return;
    if (!pickMimeType()) {
      flash("CLIP CAPTURE UNAVAILABLE");
      return;
    }
    const rec = recorderRef.current ?? (recorderRef.current = new ClipRecorder());
    if (!rec.start(canvas, CLIP_MS)) {
      flash("CLIP CAPTURE UNAVAILABLE");
      return;
    }
    stepRef.current = -1;
    setRecording(true);
    setRecordProgress(0);
  }, [canvasRef, flash]);

  const captureFrame = useCallback(
    (now: number, canvas: HTMLCanvasElement) => {
      const rec = recorderRef.current;
      if (!rec?.running) return;

      const finished = rec.frame(now, canvas, plateInfo());

      const step = Math.floor(rec.progress * PROGRESS_STEPS);
      if (step !== stepRef.current) {
        stepRef.current = step;
        setRecordProgress(rec.progress);
      }
      if (!finished) return;

      const scenarioId = scenarioRef.current.id;
      void rec.finish().then(({ blob, mime }) => {
        setRecording(false);
        setRecordProgress(0);
        if (!blob.size) {
          flash("CLIP CAPTURE FAILED");
          return;
        }
        downloadClip(blob, `fluidity-${scenarioId}-${Date.now()}.${extensionFor(mime)}`);
        flash("CLIP SAVED");
      });
    },
    [plateInfo, scenarioRef, flash],
  );

  const isRecording = useCallback(() => !!recorderRef.current?.running, []);

  // A clip in flight when the stage goes away would otherwise hold its
  // compositor and stream open with nothing left to paint into them.
  useEffect(() => () => void recorderRef.current?.finish(), []);

  return { recording, recordProgress, savePlate, recordClip, captureFrame, isRecording };
}
