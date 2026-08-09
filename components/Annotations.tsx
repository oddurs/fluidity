"use client";

import { Info } from "./Info";
import { Sym } from "./Sym";


// The lab-report layer: measurement annotations drawn over the canvas in
// the manner of a wind-tunnel technical report. Everything shown is read
// from the running solver — nothing is decorative.

export interface ProbeReading {
  u: number;
  v: number;
  p: number;
  curl: number;
  T: number;
}

export interface InstrumentSnapshot {
  /** Canvas pixel size, for aspect-correct annotation geometry. */
  w: number;
  h: number;
  obstacle: { x: number; y: number; radius: number; shape?: string };
  windSpeed: number;
  attackAngleDeg: number;
  probe: { x: number; y: number } | null;
  reading: ProbeReading;
  fig?: string;
}

const fmt = (n: number, digits = 2) => (n < 0 ? "−" : "+") + Math.abs(n).toFixed(digits);

/** The trace and the eased vertical scale it should be drawn against. */
export interface TraceView {
  points: number[];
  mid: number;
  half: number;
}

const TRACE_W = 176;
const TRACE_H = 28;

/** The tag never resizes, so its footprint is known up front. */
const PROBE_TAG_W = 206;
const PROBE_TAG_H = 130;

/**
 * The probe's pressure history as a trace. A single number cannot show that
 * pressure behind a cylinder *oscillates* — this makes the shedding rhythm
 * visible as a waveform, which is the whole point of the Strouhal number.
 */
/**
 * Catmull-Rom through the samples, emitted as cubic Béziers. A polyline of
 * 160 points has 160 corners; this reads as one continuous instrument trace.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function Sparkline({ trace }: { trace: TraceView }) {
  const { points: values, mid, half } = trace;
  if (values.length < 4) return null;

  const step = TRACE_W / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: i * step,
    // Clamp so an outlier that outruns the eased scale bends rather than
    // escaping the frame.
    y: Math.max(
      1,
      Math.min(TRACE_H - 1, TRACE_H / 2 - ((v - mid) / half) * (TRACE_H / 2 - 2)),
    ),
  }));
  const d = smoothPath(pts);

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${TRACE_W} ${TRACE_H}`}
      preserveAspectRatio="none"
      height={TRACE_H}
      aria-hidden="true"
    >
      <line x1="0" y1={TRACE_H / 2} x2={TRACE_W} y2={TRACE_H / 2} className="sparkZero" />
      <path d={d} className="sparkLine" />
    </svg>
  );
}

export function Annotations({
  snap,
  trace,
  probeHover = false,
  shedHz = 0,
}: {
  snap: InstrumentSnapshot;
  trace: TraceView;
  probeHover?: boolean;
  /** Measured oscillation frequency of the trace, in tank Hz. */
  shedHz?: number;
}) {
  const { w, h, obstacle, windSpeed, attackAngleDeg, probe, reading, fig } = snap;
  if (w === 0 || h === 0) return null;

  // Obstacle geometry in pixels: radius is a fraction of tank height.
  const ox = obstacle.x * w;
  const oy = (1 - obstacle.y) * h;
  const rPx = obstacle.radius * h;
  // Diameter only means something for the cylinder; angle of attack only
  // means something for a section. Testing "not a plate" silently drew a
  // D dimension across the airfoil once that shape existed.
  const present = obstacle.radius > 0;
  const isCircle = present && (obstacle.shape ?? "circle") === "circle";
  const hasAngle = present && (obstacle.shape === "plate" || obstacle.shape === "airfoil");

  const px = probe ? probe.x * w : 0;
  const py = probe ? (1 - probe.y) * h : 0;
  const speed = Math.hypot(reading.u, reading.v);

  return (
    <div className="annotations" aria-hidden="true">
      {/* Registration marks: the test section is a framed specimen. */}
      <span className="regMark regTL" />
      <span className="regMark regTR" />
      <span className="regMark regBL" />
      <span className="regMark regBR" />

      {fig && <span className="figLabel">{fig}</span>}

      {windSpeed > 0 && (
        <span className="annoTag inletTag">
          U<Sym>∞</Sym> ⟶ {Math.round(windSpeed)} TX/S
          <Info term="U∞ — freestream velocity">
            The speed of the undisturbed flow entering the tunnel, before it
            meets anything. The ∞ means &ldquo;far away&rdquo;. It is a fixed
            inlet condition this scenario sets, not a measurement — the tunnel
            is driven at this speed. Units are simulation texels per second:
            grid cells, not metres. It is the U in the Reynolds number and in
            the shedding rate f ≈ 0.2·U/D.
          </Info>
        </span>
      )}

      {isCircle && (
        <div
          className="dimLine"
          style={{ left: ox - rPx - 18, top: oy - rPx, height: 2 * rPx }}
        >
          <span className="annoTag dimTag">
            D
            <Info term="D — cylinder diameter">
              The width of the obstacle across the flow. It sets the length
              scale for both dimensionless numbers on this page: the Reynolds
              number Re = U·D/ν, and the shedding rate f ≈ 0.2·U/D — which is
              why a thin wire whistles high and a thick cable moans low.
            </Info>
          </span>
        </div>
      )}

      {hasAngle && (
        <span className="annoTag" style={{ position: "absolute", left: ox + 10, top: oy - rPx - 26 }}>
          α = {Math.round(attackAngleDeg)}°
          <Info term="α — angle of attack">
            The tilt between the wing section and the oncoming flow. This
            section is symmetric, so at 0° it makes no lift at all; tilt it and
            it turns the flow downward, and the flow pushes back.
          </Info>
        </span>
      )}

      {probe && (
        <>
          <div className="probeHairV" style={{ left: px }} />
          <div className="probeHairH" style={{ top: py }} />
          <div
            className={`probeSquare${probeHover ? " probeSquareHot" : ""}`}
            style={{ left: px - 5, top: py - 5 }}
          />
          {/* Fixed width, fixed rows, right-aligned tabular values. Set as a
              run-on line, every changing digit and every field that blinked in
              and out resized the whole tag. It reports; it should not move. */}
          <div
            className="probeTag"
            style={{
              left: px + 14 + PROBE_TAG_W > w ? px - PROBE_TAG_W - 14 : px + 14,
              top: py + 14 + PROBE_TAG_H > h ? py - PROBE_TAG_H - 14 : py + 14,
            }}
          >
            <div className="probeHead">
              <span>
                PROBE
                <Info term="The probe">
                  A movable measurement point — drag it anywhere. It reads the
                  solver&rsquo;s own fields where it sits: |u| flow speed, p
                  pressure, ω rotation, T temperature. The trace below is its
                  pressure over the last four seconds, and in a wake it
                  oscillates once per shed vortex.
                </Info>
              </span>
              <span className="probeCoord">
                {probe.x.toFixed(2)}, {probe.y.toFixed(2)}
              </span>
            </div>
            <dl className="probeGrid">
              <div>
                <dt>|u|</dt>
                <dd>{speed.toFixed(0)}</dd>
              </div>
              <div>
                <dt>p</dt>
                <dd>{fmt(reading.p, 1)}</dd>
              </div>
              <div>
                <dt>ω</dt>
                <dd>{fmt(reading.curl, 1)}</dd>
              </div>
              <div>
                <dt>T</dt>
                <dd>{fmt(reading.T, 1)}</dd>
              </div>
            </dl>
            <Sparkline trace={trace} />
            <div className="probeFoot">
              <span>PRESSURE · 4S</span>
              <span>{shedHz > 0 ? `${shedHz.toFixed(2)} HZ` : "—— HZ"}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
