# FLUIDITY — Design System

## 1. What we are making

**A wind-tunnel test facility that happens to run in a browser.**

Not a toy, not a screensaver, not a landing page with a fluid background. The
interface should feel like the control station of a piece of laboratory
equipment: something built to run experiments, take measurements, and publish
figures. The simulation is the specimen; everything around it is instrumentation.

Three commitments follow from that, and every decision on this project should be
checkable against them:

1. **The chrome frames, it never competes.** The fluid is the only organic,
   luminous, chromatic, moving thing on the page. The interface is rigid, matte,
   monochrome and still — the negation of the content, so the content reads.
2. **Nothing is decorative.** Every number shown is read from the running
   solver. Every annotation measures something. Every structural device
   (numbering, rules, labels) encodes a fact that is actually true. If an
   element cannot name what it reports, it should be deleted.
3. **The math and the machine are one object.** Reading about an equation and
   operating the thing the equation governs are the same activity, in the same
   page, wired together.

The visual language is **brutalism**, chosen because its core claim — expose the
structure, hide nothing — is identical to the product's pedagogy. Its dialect is
the **wind-tunnel technical report**: figure numbers, equation numbers,
dimension lines, registration marks, plates.

### What this is not

Not soft, not glassy, not gradient-lit, not rounded. No drop shadows, no
elevation model, no "cards." No decorative motion. No second accent color. No
illustrative iconography — the specimen is the image.

---

## 2. Chrome palette

**The instrument is dark; the document is paper.** These are two different
surfaces with two different jobs, and they are lit differently.

The stage originally used a light concrete panel beside the black tank. It was
brighter than most of the fluid, so the eye went to the chrome instead of the
physics, and safety orange on light grey read as a clash rather than a signal.
Inverting it fixed both at once: on near-black, orange stops competing and
starts reading as a precise instrument marking.

| Token            | Value                      | Role                                    |
| ---------------- | -------------------------- | --------------------------------------- |
| `--machine-bg`   | `#0b0b0b`                  | Control column ground                   |
| `--machine-deep` | `#050505`                  | The tank, and the telemetry block       |
| `--machine-fg`   | `#e9e7df`                  | Control text                            |
| `--machine-rule` | `paper @ 0.26`             | Control borders                         |
| `--machine-hair` | `paper @ 0.14`             | Dividers between blocks                 |
| `--machine-dim`  | `paper @ 0.46`             | Labels, secondary readouts              |
| `--accent`       | `#ff4400`                  | The live channel — see below            |
| `--paper`        | `#e9e7df`                  | Document ground                         |
| `--ink`          | `#101010`                  | Document type and rules                 |
| `--concrete`     | `#d6d3ca`                  | Document panels (equations, legend)     |

Rules on dark are **1px**, not 2px: a 2px light rule on black glares, where the
same weight in ink on concrete reads as structure.

**The accent has one job: mark the live channel.** Active state, current value,
the set portion of a gauge, section markers, the instrument rim on the
obstacle. It is never used for emphasis or decoration. A previous version used
phosphor green in telemetry; it was removed because a second accent destroys
the signal.

**There is no top bar.** It repeated the wordmark that already sat on the
canvas, and put a bright band above a dark simulation. Identity is a single
nameplate at the head of the control column, the way a piece of equipment
carries its own — and the tank is left undisturbed. The wordmark is not
allowed back onto the canvas: staying legible over moving dye required a
difference blend, which turned it arbitrary colours and covered a third of the
specimen.

## 3. Simulation palette

The rules here are different from the chrome, because the canvas is emissive
(additive dye on black) and because color in a scientific figure carries meaning.

**Never sample raw HSV.** Walking hue produces the full-spectrum rainbow common
to WebGL demos: perceptually non-uniform (its yellow reads far brighter than its
blue), and its hue encodes nothing but index. Use `lib/fluid/colormaps.ts`.

### Ramps

Perceptually-uniform maps from the matplotlib family, which is what scientific
figures actually use.

| Ramp      | Character                         | Used by                       |
| --------- | --------------------------------- | ----------------------------- |
| `plasma`  | Violet → magenta → amber → gold   | Wind-tunnel streaklines        |
| `inferno` | Near-black → red → orange → white | PLUME                          |
| `viridis` | Blue → teal → green → chartreuse  | (reserved)                     |
| `ice`     | Abyssal navy → glacier → frost    | RAYLEIGH.T                     |

### Inks

Named pigments rather than hues, for scenarios where the user is *painting*
rather than reading a field (INK.PLAY, STORM, the autopilot's ghost hand). The
set has material character instead of spectrum coverage; `INK_CYCLE` orders them
so neighbours stay distinguishable.

### Three rules learned the hard way

1. **Equalize luminance for streaklines.** A ramp's built-in light-to-dark
   sweep makes its low end disappear on black. `equalize()` preserves hue while
   flattening brightness, so every filament is equally traceable.
2. **Keep both limbs in the same half of the wheel.** Dye is additive, so
   complementary colors mix to *grey*. A true diverging map (ember over ice)
   looks superb in the laminar region and washes the wake out to nothing — and
   the wake is the whole point. Plasma still encodes flow origin (gold above,
   violet below) but mixes to plum.
3. **Budget the per-frame deposit against emitter count.** Inlet emitters fire
   every frame; anything above ~0.02 saturates to flat white within seconds and
   throws the ramp away. Tune deposit and ramp together, always by looking.

### Field views

Each X-ray owns a palette so the views are never confusable:

| View       | Encoding                                            |
| ---------- | --------------------------------------------------- |
| `dye`      | Per-scenario ramp or inks (above)                   |
| `velocity` | Hue = direction, brightness = speed (cyclic by nature) |
| `pressure` | Diverging: orange high, blue low                    |
| `curl`     | Diverging: yellow clockwise, purple counter          |
| `heat`     | Diverging: ember hot, ice cold                      |

---

## 4. Typography

**Three voices, three domains.** Each face owns one zone of the page and never
appears outside it. A reader should be able to tell what kind of thing they are
looking at from the letterforms alone, before reading a word.

| Voice          | Face            | Domain                                                   |
| -------------- | --------------- | -------------------------------------------------------- |
| **Title plate**| Archivo Black   | Wordmark, section titles, the paper lede, ghost numerals  |
| **The paper**  | Source Serif 4  | Everything inside the document: prose, notes, references  |
| **The machine**| IBM Plex Mono   | Every label, control, readout, caption, annotation        |

The document is set in a serif for three reasons, in order of weight:

1. **The maths belong.** KaTeX typesets in Computer Modern, a serif. Against a
   sans body every inline `$\mathbf{u}$` read as a pasted-in foreign object;
   against Source Serif the two share a world and the boundary disappears.
2. **A technical report is a serif document.** The idiom the whole design
   borrows from — NACA reports, journal papers — is set this way.
3. **It gives display and body genuinely different voices.** The previous
   pairing (Archivo Black over Archivo) was one superfamily at two weights,
   which is contrast of weight, not of voice.

There is deliberately **no sans in the system**. Anything that would have used
one is either document prose (serif) or instrument text (mono) — including the
scenario blurb in the control panel, which is mono because it describes the
machine.

**All interface text is mono, uppercase, letterspaced** (`0.06em`–`0.2em`,
looser as size drops). Sentence case appears only in the document. This is the
sharpest signal separating "instrument" from "reading."

Display type is set tight (`-0.015em` to `-0.04em`) and large; there is no
middle register. The jump from 11px mono to 44px display *is* the hierarchy.

### Scale

Tokens live in `:root`; do not write raw font sizes.

```
--t-micro 9px   --t-tiny 10px  --t-small 11px  --t-ui 12px  --t-ui-lg 13px
--t-fine 0.8125rem   --t-note 0.9375rem   --t-body 1.0625rem
```

**The instrument is fixed in px; the document is set in rem.** A control
surface must hold its grid regardless of browser font settings, while prose
should honour a reader who has chosen a larger default. That split is the rule,
not an accident of authoring.

The panel and top bar set `line-height: 1.4` explicitly — the document's 1.62
is correct for reading and wrong for a control surface, and inheriting it costs
the panel its exact fit (§5).

### Details that are not optional

- `text-wrap: pretty` on prose, `balance` on headings — kills orphans and
  ragged headline breaks.
- `font-variant-numeric: tabular-nums` on telemetry, probe, and slider values.
  They refresh four times a second; proportional figures make the columns dance.
- `lining-nums` in the document — it is full of numbers set against caps.
- Measure capped at **66ch**. Beyond that the eye loses the line return.
- KaTeX inline is nudged to `1.06em`, because Computer Modern runs small
  against Source Serif at equal em.

---

## 5. Structure

**Numbering systems must be real.** Devices like `01 / 02 / 03` are only
permitted where order carries information the reader needs.

- `SEC.00`–`SEC.08` — sections run in the exact order the solver executes each
  frame. The oversized ghost numeral is that same index at display scale.
- `FIG.01`–`FIG.07` — one per specimen, printed on the canvas *and* on the
  scenario button, so the panel and the test section cross-reference.
- `EQ.01`–`EQ.13` — sequential through the document, cited in the margin.

**Borders collapse.** Adjacent controls use `margin: 0 -2px -2px 0` so the 2px
rules merge into a single shared line. Grids read as one welded assembly, not as
a set of buttons.

**Zero radius, everywhere.** No exceptions.

**The panel fits exactly.** At a 1000px viewport the control column measures
954px against 954px of space — zero overflow, verified in Chromium, WebKit and
Firefox. Adding a row means reclaiming its height elsewhere; measure, don't
assume, and measure in all three (engines size form controls differently, and
Firefox was 9px over when Chromium was exact).

## 5a. Responsive

**Stacking is about orientation, not width.** Narrow *and* upright stacks the
canvas over the panel; everything else stays side by side. Keying it on width
alone put a landscape phone into the stacked layout, where the canvas filled
the viewport and every control sat below the fold.

**Canvas overlays query the tank, not the screen.** The hint, figure caption
and wordmark crowd each other according to how wide the *test section* is — and
a landscape phone has a wide window with a narrow canvas. `.canvasWrap` is a
container (`container-name: tank`), the wordmark is sized in `cqw`, and the
figure caption hides below 660px of canvas. Container queries are supported in
all three engines.

**Touch is not a small mouse.** Grab targets grow on `(pointer: coarse)` —
the probe from 18px to 30px, the obstacle from 1.6× to 2.1× its radius. The
canvas sets `touch-action: none` to own the gesture, plus
`-webkit-touch-callout: none` and `user-select: none` so iOS does not raise the
callout menu mid-drag. `setPointerCapture` is wrapped in try/catch: it throws
on some engines for pointer ids they consider inactive, and letting that escape
aborts the drag before it starts.

**Height units are declared twice** — `vh` then `dvh` — so browsers without
`dvh` still get a sized stage.

**Quality starts one tier down on touch devices.** The controller cannot step
back up: frame time is vsync-capped, so a device comfortably holding 60fps is
indistinguishable from one barely making it, and probing upward would be
guesswork.

---

## 6. Motion and interaction

**The test: name the job.** Motion is permitted when it answers a question the
user is actually asking — *can I touch this?*, *what just changed?*, *what is
this number doing over time?* Motion that answers no question is deleted. There
is no "delight" budget here; the fluid is the delight.

Every item below is disabled or given a static equivalent under
`prefers-reduced-motion`, and a static equivalent must still answer the same
question — a highlight that only pulses becomes a highlight that simply holds.

**Affordance** — what can I touch?

1. **Grab targets.** The cursor becomes `grab` over the cylinder and the probe,
   `grabbing` while dragging. The obstacle rim also thickens and warms, eased
   over ~70ms in the render loop. These are the only signals that the specimen
   and the instrument can be picked up; without them the interaction is
   undiscoverable.
2. **Probe marker** scales 1.5× on hover.

**Feedback** — what just changed?

3. **Parameter change flash.** A TRY IT action in the document scrolls the
   reader to the stage and silently moves a solver control. The flash — two
   beats over 1.4s on the affected rows — is what makes the change visible.
   Without it the feature's entire premise fails.
4. **Capture confirmations** enter with a 180ms rise.

**Data over time** — what is this doing?

5. **Probe sparkline.** Pressure sampled at ~40Hz, republished at 10Hz. A
   scalar readout cannot show that pressure behind a cylinder *oscillates*;
   the trace makes the shedding rhythm legible.
6. **Tour progress bar**, reporting a real remaining duration.

**Identity** — one-time, earned

7. **Boot sequence.** Panel blocks assemble in an 80ms stagger on load, like
   instruments coming online. Once, never repeated.
8. **Equation ticker.** The scroll cue is a marquee carrying the momentum
   equation; it reads as a running instrument feed and pauses on hover.

Everything else is instant. Buttons displace 2px on press (a physical key) and
swap colour with no transition. **No hover eases on chrome, no parallax, no
scroll-triggered reveals, no staggered entrances beyond the boot.**

---

## 7. Component vocabulary

- **Tag** — void ground, paper text, orange left rule. Any data-on-dark
  annotation: probe readout, `U∞`, `α`, tour caption, keyboard legend.
- **Gauge** — a slider whose set portion is orange. Reads at a glance.
- **Toggle** — a button with `aria-pressed`; pressed is solid orange.
- **Rule** — 2px solid ink. The only divider that exists.
- **Ghost numeral** — display face, `opacity: 0.055`, bled to the page edge.
- **Registration mark** — 14px corner tick at 32% white, framing the specimen.
- **Plate** — the export format: header rule, full-bleed specimen, data block.
  Both exports use it. `STILL` is one frame of it; `CLIP` is six seconds of it,
  painted from the same layout code so the two can never drift apart.

## 8. Accessibility floor

Non-negotiable, and checked every sprint: visible focus rings (3px accent,
2px offset), reduced-motion honored everywhere, no horizontal page overflow at
any width (wide content scrolls inside its own frame), all controls keyboard
reachable and operable, `aria-pressed` on every toggle, `role="status"` on live
regions.

**The tank is a control, not a picture.** Stirring, moving the obstacle and
placing the probe were pointer-only for a long time — the one interaction the
whole app is built around excluded anyone without a mouse. The canvas is
focusable and `role="application"` so arrow keys reach it; arrows move the
selected instrument, `O` switches between probe and obstacle, `Enter` stirs.

**Arrows are claimed only while the tank has focus.** The document is 14,000px
long, and taking them globally would break scrolling it.

**Two channels, deliberately separate.** A visually-hidden account of the
solver's state is kept current on a slow timer and is readable at any time in
browse mode — it is *not* a live region, because the solver changes four times
a second and announcing that continuously would make the page unusable. A
separate polite `role="status"` carries discrete events only: a move, a
selection, a stir. Both are tested.
