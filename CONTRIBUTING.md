# Contributing

Thanks for taking a look.

## Before you start

Read [`DESIGN.md`](./DESIGN.md). It is the design system, but more importantly
it records decisions that were tried and rejected, with the reasoning. A good
number of "obvious" improvements to this project have already been attempted
and reverted for a reason that is written down there.

## Getting set up

```bash
npm install
npm run dev
npm test          # unit + end-to-end
```

The end-to-end suite needs browsers: `npx playwright install`.

**Run the full suite yourself before opening a PR — CI cannot.** GitHub's
runners have no GPU. Firefox and WebKit cannot rasterise WebGL2 there at all,
and Chromium manages it only through SwiftShader at roughly a fifth of
hardware speed. That is quick enough to check the interface and the layout,
and nowhere near quick enough for anything that waits on a wake to develop.

So tests whose assertions need a real frame rate — dye brightness, shedding
frequency, clip capture — carry the `@gpu` tag, and CI skips them:

```bash
npm run test:e2e         # everything, three engines — the actual gate
npm run test:e2e:ci      # what CI runs: Chromium, no @gpu
```

Tag a new test `@gpu` if it measures the simulation rather than the page.
Cross-engine differences are real here too — the control column fits exactly
at 1000px in all three, and each engine sizes form controls differently — so
the local run is what catches them, not the badge.

## What a good change looks like

- **Physics claims are checkable.** If you change the solver, say how you
  verified it. The suite already asserts things like "measured shedding
  frequency agrees with the Strouhal number" — extend that habit.
- **Add a test that names the bug.** Every test in `e2e/` exists because
  something broke. Comment yours with what it prevents.
- **Visual work is measured, not asserted.** Screenshot it, and check the
  quality tier is stable before you trust any measurement — a dropping tier
  silently changes brightness and grid resolution underneath you.
- **Match the surrounding code.** Comments explain constraints and rejected
  alternatives, not what the next line does.

## Things that need care

- **Section and equation numbers in `components/Science.tsx` are positional.**
  Inserting one means renumbering the rest and updating cross-references.
- **The control column fits exactly** at a 1000px viewport, verified in three
  engines. Adding a row means reclaiming its height somewhere else.
- **`lib/fluid/params.ts` is the single source of range truth.** Sliders and
  permalink decoding both read it, so they cannot drift apart.
- **GLSL lives inside JS template literals.** Backticks in a shader comment
  terminate the string and break the build; `half` is a reserved word.

## Reporting a bug

Include your browser, whether the canvas rendered at all, and what the
TELEMETRY block reported — especially `QUALITY` and `SIM GRID`. A dropped
quality tier explains a surprising number of "it looks wrong" reports.
