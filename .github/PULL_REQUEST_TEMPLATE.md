## What changed

<!-- One or two sentences. What is different now, from a reader's side of the screen. -->

## How you verified it

<!-- This project renders physics, so a screenshot is the only honest check for
     most changes. Drive it with Playwright and look at the image — do not
     infer from the code. `npm run review` builds a contact sheet of every
     state if the change could affect more than one.

     If you changed the solver, say how you know it is still right. -->

- [ ] `npm run test:unit`
- [ ] `npm run test:e2e` — **all three engines, locally.** CI runs Chromium
      only and skips everything tagged `@gpu`, because GitHub's runners have
      no GPU. The badge does not cover the physics; this run does.
- [ ] Checked the quality tier was stable before trusting any measurement
      (`QUALITY` and `SIM GRID` in the telemetry block — a dropping tier
      silently changes brightness and grid resolution underneath you)

## Anything you tried and rejected

<!-- Optional, and the most useful part of a PR here. DESIGN.md records the
     roads not taken so nobody has to re-derive them. -->
