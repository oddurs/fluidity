/**
 * A mathematical symbol, set in KaTeX's own faces.
 *
 * The interface fonts are subset to latin, and next/font appends a
 * metric-adjusted system fallback that swallows every miss — so Greek letters
 * and operators silently rendered in whatever the OS offered, a size and
 * weight adrift from the type beside them. Routing them here means a control
 * labelled ε and the ε in the equation it refers to are the same glyph.
 */
export function Sym({ children }: { children: React.ReactNode }) {
  return <span className="sym">{children}</span>;
}
