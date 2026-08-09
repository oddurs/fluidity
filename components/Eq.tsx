// Server-rendered KaTeX. Equations are static content, so they render at
// build time — no client math runtime ships to the browser.

import katex from "katex";

export function Eq({
  tex,
  display = false,
  n,
}: {
  tex: string;
  display?: boolean;
  /** Equation number, cited in the margin like a paper. Display mode only. */
  n?: string;
}) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    strict: false,
  });
  if (display) {
    return (
      <div className="eqBlock">
        {n && <span className="eqNum">EQ.{n}</span>}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  }
  return <span className="eqInline" dangerouslySetInnerHTML={{ __html: html }} />;
}
