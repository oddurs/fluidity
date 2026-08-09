// Clip capture: the plate, but moving.
//
// The app is about motion and could only export a frozen frame. This records
// the same framing as the still — header, specimen, data block — by painting
// it into a compositor canvas each frame and capturing that stream. The
// WebGL canvas cannot be captured directly: its drawing buffer is discarded
// at every composite, so the copy has to happen in the same task as a render.

import { paintPlate, plateLayout, type PlateInfo, type PlateLayout } from "./plate.ts";

/**
 * Ordered by preference. WebM is the broad case; MP4 is included because
 * Safari's MediaRecorder has historically had no WebM support, and shipping a
 * clip nobody on that browser can produce is worse than a slightly larger file.
 */
const CANDIDATE_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
];

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function extensionFor(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

export interface ClipResult {
  blob: Blob;
  mime: string;
}

export class ClipRecorder {
  private compositor: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private layout: PlateLayout | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private done: ((r: ClipResult) => void) | null = null;
  readonly fps = 30;

  running = false;
  /** 0..1 through the requested duration; drives the progress readout. */
  progress = 0;
  private startedAt = 0;
  private durationMs = 0;
  private lastPaint = 0;

  /** Set up the compositor and begin. Returns false if capture is unavailable. */
  start(canvas: HTMLCanvasElement, durationMs: number): boolean {
    const mime = pickMimeType();
    if (!mime || typeof canvas.captureStream !== "function") return false;

    const layout = plateLayout(canvas);
    // H.264 will not encode odd dimensions, and MP4 is the fallback on
    // engines without WebM. A pixel off the plate costs nothing.
    layout.W -= layout.W % 2;
    layout.H -= layout.H % 2;
    const compositor = document.createElement("canvas");
    compositor.width = layout.W;
    compositor.height = layout.H;
    const ctx = compositor.getContext("2d");
    if (!ctx) return false;

    let recorder: MediaRecorder;
    try {
      // A fixed frame rate, so a slow frame stretches time rather than
      // dropping it and producing a clip that plays back too fast.
      recorder = new MediaRecorder(compositor.captureStream(this.fps), {
        mimeType: mime,
        videoBitsPerSecond: 12_000_000,
      });
    } catch {
      return false;
    }

    this.chunks = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: mime });
      this.running = false;
      this.progress = 0;
      this.done?.({ blob, mime });
      this.done = null;
      this.compositor = null;
      this.ctx = null;
    };

    this.compositor = compositor;
    this.ctx = ctx;
    this.layout = layout;
    this.recorder = recorder;
    this.durationMs = durationMs;
    this.startedAt = performance.now();
    this.lastPaint = 0;
    this.progress = 0;
    this.running = true;
    recorder.start();
    return true;
  }

  /**
   * Paint one frame. Must be called from the render loop immediately after
   * the engine has drawn, while the drawing buffer is still readable.
   * Returns true once the clip has run its length.
   */
  frame(now: number, canvas: HTMLCanvasElement, info: PlateInfo): boolean {
    if (!this.running || !this.ctx || !this.layout) return false;
    // The tank runs far above 30fps; painting every frame would be waste.
    if (now - this.lastPaint >= 1000 / this.fps) {
      this.lastPaint = now;
      paintPlate(this.ctx, canvas, info, this.layout);
    }
    this.progress = Math.min(1, (now - this.startedAt) / this.durationMs);
    return this.progress >= 1;
  }

  finish(): Promise<ClipResult> {
    // Cleared here rather than in onstop: the render loop calls frame() again
    // before the stop event lands, and would ask for a second finish.
    this.running = false;
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        this.running = false;
        resolve({ blob: new Blob(), mime: "" });
        return;
      }
      this.done = resolve;
      this.recorder.stop();
      this.recorder = null;
    });
  }
}

export function downloadClip(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on a timer rather than immediately: some browsers have not
  // started reading the object URL by the time click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
