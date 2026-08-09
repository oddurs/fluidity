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
  brightness checks) must happen synchronously in the same task as `render()`.
  An in-page `drawImage` from a later task returns black; take a composited
  screenshot instead.
- **Section and equation numbers in `components/Science.tsx` are positional.**
  Inserting one means renumbering all of them and fixing prose cross-references.
- **The control column fits exactly** at a 1000px viewport, verified in
  Chromium, WebKit and Firefox — engines size form controls differently.
  Adding a row means reclaiming its height elsewhere. Measure in all three.
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
