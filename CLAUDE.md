# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A WebGL2 fluid simulation (Stam's stable-fluids method, written from scratch)
with a long explanatory essay beside it. Next.js App Router, static-exported to
GitHub Pages. No server, no database, no API routes.

## Read first

- **`DESIGN.md`** — the design system. It records what was tried and rejected,
  with reasoning. Consult it before any visual change rather than re-deriving.
- **`README.md`** — architecture and the per-frame solver order.

## Commands

```bash
npm run dev                  # localhost:3000
npm run build                # static export to ./out
npm test                     # unit + e2e
npm run test:unit            # node --test, no browser, fast
npm run test:e2e:chromium    # one engine, when iterating
```

## Verify visually, and measure

This project renders physics; a screenshot is the only honest check for most
changes. Drive it with Playwright and **look at the image**, do not infer from
the code.

**Confirm the quality tier is stable before trusting any visual measurement.**
`lib/fluid/quality.ts` lowers the grid resolution under load. Several rounds of
colour tuning were once done while the tier was still dropping, so every
correction was calibrated against a smaller grid and badly under-corrected once
it settled. Read `QUALITY` and `SIM GRID` from the telemetry block alongside
whatever you are measuring.

## Traps that have cost real time

- **GLSL lives in JS template literals.** A backtick inside a shader comment
  terminates the string and breaks the build. `half` is a reserved word in
  GLSL ES.
- **`preserveDrawingBuffer` is false.** Reading the canvas (plate export,
  clip capture, brightness checks) must happen synchronously in the same task
  as `render()`. An in-page `drawImage` from a later task returns black; take a
  composited screenshot instead. This is why `ClipRecorder.frame()` is called
  from inside the render loop rather than on its own timer.
- **The adaptive quality controller must be suspended during clip capture.**
  The compositor costs real milliseconds per frame, and the controller reads a
  slow frame as GPU overload — so it would drop the grid partway through, and
  the clip would record its own degradation.
- **Section and equation numbers in `components/Science.tsx` are positional.**
  Inserting one means renumbering all of them and fixing prose cross-references.
- **The control column fits exactly** at a 1000px viewport, verified in
  Chromium, WebKit and Firefox — engines size form controls differently.
  Adding a row means reclaiming its height elsewhere. Measure in all three.
- **`.annoTag` sets `white-space: pre`, not `nowrap`.** The tags are flex
  containers so their `(i)` aligns without a magic offset, and flex strips the
  space at the start of a text run — which closed the gap in `U∞ ⟶ 170`.
  Both stop the tag wrapping; only `pre` keeps the space. Measure the gap with
  a Range rather than judging it from a screenshot, which is how it got
  declared fixed once while still broken.
- **Never run your own dev server while Playwright runs.** It reuses a server
  on :3000 and then tears down the process group on exit, killing it — which
  surfaces as `NS_ERROR_CONNECTION_REFUSED` partway through a run and looks
  exactly like a real regression. Several hours went into chasing failures
  that were only this. Free the port and let Playwright own the server.
- **Firefox reports `clientX: 0` for a pointer beyond the viewport**, not the
  viewport edge. A test that drags far past the window reads in Firefox as a
  drag the other way. Drag to the window edge instead.
- **Prefer targeted edits over scripted regex rewrites of `app/globals.css`.**
  A slice that matched the wrong selector once destroyed the entire head of
  that file, and git had only the scaffold commit to fall back on.

## Invariants worth preserving

- `lib/fluid/params.ts` is the only source of parameter ranges. The sliders and
  the permalink decoder both read it so they cannot drift; a permalink is
  untrusted input and must stay clamped.
- Bloom applies to the dye view only. The X-rays are diagnostics and must not
  be smeared.
- Motion must name its job (see `DESIGN.md` §6), and every animation needs a
  reduced-motion equivalent that still answers the same question.
- Telemetry never lies. If the simulation is idle or the context is lost, the
  readouts say so rather than reporting a stale frame rate.

## Style

Match the surrounding code. Comments explain constraints and rejected
alternatives — not what the next line does.
