// Diagrams for the parts of the solver you cannot see.
//
// The simulation shows you the result; it cannot show you the method. Tracing
// backwards through a grid and averaging a five-point stencil are spatial
// ideas, and the essay was explaining them in words alone.

function Figure({
  n,
  caption,
  children,
  viewBox,
}: {
  n: string;
  caption: React.ReactNode;
  children: React.ReactNode;
  viewBox: string;
}) {
  return (
    <figure className="diagram">
      <svg viewBox={viewBox} role="img" aria-label={typeof caption === "string" ? caption : n}>
        {children}
      </svg>
      <figcaption>
        <span className="diagramNum">FIG.{n}</span>
        {caption}
      </figcaption>
    </figure>
  );
}

/** A 3×3 patch of cells, used as the ground for both diagrams. */
function Grid({ x, y, cell, cols, rows }: { x: number; y: number; cell: number; cols: number; rows: number }) {
  const lines = [];
  for (let i = 0; i <= cols; i++) {
    lines.push(<line key={`v${i}`} x1={x + i * cell} y1={y} x2={x + i * cell} y2={y + rows * cell} className="dgGrid" />);
  }
  for (let j = 0; j <= rows; j++) {
    lines.push(<line key={`h${j}`} x1={x} y1={y + j * cell} x2={x + cols * cell} y2={y + j * cell} className="dgGrid" />);
  }
  return <>{lines}</>;
}

/**
 * Semi-Lagrangian advection: instead of pushing values forward, which can
 * overshoot, each cell asks where its contents came from and goes to fetch it.
 */
export function AdvectionFigure() {
  const c = 56;
  const gx = 60;
  const gy = 30;
  // Destination cell centre, and the point it traces back to.
  const dx = gx + 3.5 * c;
  const dy = gy + 1.5 * c;
  const sx = gx + 1.18 * c;
  const sy = gy + 2.12 * c;

  return (
    <Figure
      n="A"
      viewBox="0 0 520 210"
      caption={
        <>
          Advection runs <em>backwards</em>. The cell being filled (right) steps
          back along the velocity there, lands between four cells, and takes a
          weighted blend of them. Because it only ever reads values that already
          exist, nothing it writes can exceed what was there — which is exactly
          why the scheme cannot blow up.
        </>
      }
    >
      <Grid x={gx} y={gy} cell={c} cols={5} rows={3} />

      {/* The 2x2 block the backtrace lands inside — the four values it blends. */}
      {[
        [0, 1],
        [1, 1],
        [0, 2],
        [1, 2],
      ].map(([i, j]) => (
        <rect key={`${i}-${j}`} x={gx + i * c} y={gy + j * c} width={c} height={c} className="dgCellSoft" />
      ))}

      {/* Destination cell. */}
      <rect x={gx + 3 * c} y={gy + c} width={c} height={c} className="dgCellHot" />

      {/* The backtrace. */}
      <path
        d={`M ${dx} ${dy} C ${dx - 60} ${dy - 26}, ${sx + 62} ${sy - 30}, ${sx} ${sy}`}
        className="dgArrow"
        markerEnd="url(#dgHead)"
      />
      <defs>
        <marker id="dgHead" markerWidth="7" markerHeight="7" refX="5.4" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" className="dgHeadFill" />
        </marker>
      </defs>

      <circle cx={dx} cy={dy} r="3.4" className="dgDotHot" />
      <circle cx={sx} cy={sy} r="3.4" className="dgDot" />

      <text x={dx + 10} y={dy - 10} className="dgLabel">
        x
      </text>
      <text x={sx - 74} y={sy + 22} className="dgLabel">
        x − Δt·u
      </text>
    </Figure>
  );
}

/**
 * The Jacobi stencil: one cell, its four neighbours, and the divergence term.
 */
export function StencilFigure() {
  const c = 58;
  const cx = 178;
  const cy = 105;
  const arms: [number, number, string][] = [
    [-1, 0, "i−1, j"],
    [1, 0, "i+1, j"],
    [0, -1, "i, j−1"],
    [0, 1, "i, j+1"],
  ];
  return (
    <Figure
      n="B"
      viewBox="0 0 520 210"
      caption={
        <>
          One Jacobi sweep. Every cell replaces its pressure with the average of
          its four neighbours, less the divergence it has to cancel. One sweep
          moves information one cell; the JACOBI ITER control is how many times
          that happens per frame, which is really how far the news has
          travelled.
        </>
      }
    >
      {arms.map(([ax, ay, label]) => (
        <g key={label}>
          <rect
            x={cx + ax * c - c / 2}
            y={cy + ay * c - c / 2}
            width={c}
            height={c}
            className="dgCellSoft"
          />
          <text x={cx + ax * c} y={cy + ay * c + 4} className="dgLabelSm" textAnchor="middle">
            {label}
          </text>
          <line
            x1={cx + ax * (c * 0.44)}
            y1={cy + ay * (c * 0.44)}
            x2={cx + ax * (c * 0.56)}
            y2={cy + ay * (c * 0.56)}
            className="dgTie"
          />
        </g>
      ))}

      <rect x={cx - c / 2} y={cy - c / 2} width={c} height={c} className="dgCellHot" />
      <text x={cx} y={cy + 4} className="dgLabelSm dgLabelOn" textAnchor="middle">
        i, j
      </text>

      {/* The formula the cross stands for, given room rather than run off
          the edge of the frame. */}
      <text x={cx + 132} y={cy - 12} className="dgLabelDim">
        new pressure =
      </text>
      <text x={cx + 132} y={cy + 8} className="dgLabelDim">
        ¼ (sum of the four)
      </text>
      <text x={cx + 132} y={cy + 28} className="dgLabelDim">
        − divergence here
      </text>
    </Figure>
  );
}
