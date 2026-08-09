// The mathematics, section by section, in the order the solver actually
// runs each frame. Every section ends with a TRY IT block that maps the
// math onto a control in the panel above.

import { Eq } from "./Eq";
import { TryIt } from "./TryIt";

function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="sci" id={`sec-${index}`}>
      {/* The oversized numeral is structural, not ornament: these sections
          run in the exact order the solver executes each frame. */}
      <span className="sciGhost" aria-hidden="true">
        {index}
      </span>
      <div className="sciHead">
        <span className="sciIndex">SEC.{index}</span>
        <h2 className="sciTitle">{title}</h2>
      </div>
      <div className="sciBody">{children}</div>
    </section>
  );
}

const CONTENTS: [string, string][] = [
  ["00", "The equations"],
  ["01", "Advection — the fluid carries itself"],
  ["02", "Forces — your cursor is a term"],
  ["03", "Pressure — the fluid pushes back"],
  ["04", "Vorticity — keeping the swirl alive"],
  ["05", "Boundaries — the Kármán vortex street"],
  ["06", "Rhythm — measuring the street"],
  ["07", "Lift — what a wing actually does"],
  ["08", "Buoyancy — why hot air rises"],
  ["09", "What this gets wrong"],
  ["10", "The loop — sixty solves per second"],
];

/** What each field view is actually showing, and how its colours are read. */
const FIELDS: { name: string; swatch: string[]; meaning: string }[] = [
  {
    name: "DYE",
    swatch: ["#f0f921", "#e56b5d", "#a82296", "#4b03a1"],
    meaning: "A passive tracer. Carries no momentum — it only shows you where the fluid went.",
  },
  {
    name: "VELOCITY",
    swatch: ["#ff2d2d", "#2dff8a", "#2d8aff", "#ff2dd0"],
    meaning: "The field 𝐮 itself. Hue is the direction of flow, brightness its speed.",
  },
  {
    name: "PRESSURE",
    swatch: ["#ff4d00", "#050505", "#1a59ff"],
    meaning: "Orange is high, blue is low. Watch it build ahead of a stroke and trail behind it.",
  },
  {
    name: "CURL",
    swatch: ["#ffd91a", "#050505", "#bf33ff"],
    meaning: "Local rotation ω. Yellow turns clockwise, purple counter-clockwise.",
  },
  {
    name: "HEAT",
    swatch: ["#ff6109", "#050505", "#4a8cff"],
    meaning: "Temperature T. Ember is warm, ice is cold; it drives the flow only when β > 0.",
  },
];

function Legend() {
  return (
    <div className="legend">
      <p className="legendTitle">READING THE FIELD X-RAYS</p>
      <dl>
        {FIELDS.map((f) => (
          <div key={f.name}>
            <dt>
              <span className="legendSwatch" aria-hidden="true">
                {f.swatch.map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              {f.name}
            </dt>
            <dd>{f.meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Science() {
  return (
    <main className="paper" aria-label="The mathematics">
      <div className="paperIntro">
        <p className="paperKicker">THE MATHEMATICS</p>
        <p className="paperLede">
          Everything you just stirred is governed by two equations written down in the 1820s
          by Claude-Louis Navier and George Gabriel Stokes — and solved here, 60 times per
          second, on your GPU. This is how.
        </p>
        <nav className="contents" aria-label="Contents">
          <p className="contentsTitle">CONTENTS</p>
          <ol>
            {CONTENTS.map(([n, title]) => (
              <li key={n}>
                <a href={`#sec-${n}`}>
                  <span className="contentsNum">{n}</span>
                  <span className="contentsRule" aria-hidden="true" />
                  <span className="contentsName">{title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <Section index="00" title="THE EQUATIONS">
        <p>
          The incompressible Navier–Stokes equations say two things. First, momentum is
          conserved — fluid keeps moving the way it was moving, except where something
          pushes on it:
        </p>
        <Eq
          display
          n="01"
          tex="\underbrace{\frac{\partial \mathbf{u}}{\partial t}}_{\text{change}} = \underbrace{-(\mathbf{u} \cdot \nabla)\mathbf{u}}_{\text{advection}} \; \underbrace{-\,\frac{1}{\rho}\nabla p}_{\text{pressure}} \; + \underbrace{\nu \nabla^2 \mathbf{u}}_{\text{viscosity}} \; + \underbrace{\mathbf{F}}_{\text{your cursor}}"
        />
        <p>
          Second, the fluid is incompressible — it cannot be created, destroyed, or squashed.
          Whatever flows into a region must flow back out:
        </p>
        <Eq display n="02" tex="\nabla \cdot \mathbf{u} = 0" />
        <p>
          Here <Eq tex="\mathbf{u}" /> is the velocity field — a tiny arrow at every point in
          space — <Eq tex="p" /> is pressure, <Eq tex="\rho" /> is density, and{" "}
          <Eq tex="\nu" /> is viscosity. No general solution is known; proving one exists and
          is smooth is a Millennium Prize problem worth one million dollars. Computers
          sidestep the whole question: chop space into a grid, chop time into steps, and
          solve each term separately. That strategy is called operator splitting, and each
          section below is one of the operators, in the order the solver runs them every
          frame.
        </p>
        <p>
          The solver holds five fields at once, and the FIELD X-RAY control decides which
          one you are looking at. They are not five renderings of the same picture — they
          are five different quantities, and most of the sections below are about one of
          them:
        </p>
        <Legend />
        <TryIt actions={[{ label: "X-RAY: VELOCITY", command: { view: "velocity" } }]}>
          Switch FIELD X-RAY to VELOCITY. The colors are the field <Eq tex="\mathbf{u}" />{" "}
          itself — hue is direction, brightness is speed. You are looking at the unknown in
          the equation above.
        </TryIt>
      </Section>

      <Section index="01" title="ADVECTION — THE FLUID CARRIES ITSELF">
        <p>
          The term <Eq tex="-(\mathbf{u}\cdot\nabla)\mathbf{u}" /> says velocity is
          transported by itself — the flow carries its own momentum along, the way a river
          carries its own swirls. It also carries the ink, which is how you see anything at
          all. The naive way to compute this explodes the moment the fluid moves faster than
          one grid cell per step. Jos Stam&rsquo;s 1999 insight — the reason this runs in your
          browser — is to trace <em>backwards</em>: to find the new value at a point, ask
          where the fluid at that point came from, and go get it.
        </p>
        <Eq display n="03" tex="q^{\,n+1}(\mathbf{x}) \;=\; q^{\,n}\!\big(\mathbf{x} - \Delta t \,\mathbf{u}(\mathbf{x})\big)" />
        <p>
          Since we only ever <em>sample</em> existing values (with bilinear interpolation
          between grid cells), no value can ever exceed what is already there. The scheme is
          unconditionally stable: it can be wrong, but it can never blow up. The price is a
          slight blurring — numerical diffusion — which conveniently stands in for the
          viscosity term <Eq tex="\nu\nabla^2\mathbf{u}" />, so this solver skips explicit
          viscosity entirely.
        </p>
        <TryIt
          actions={[
            {
              label: "RUN: FROZEN INK",
              command: {
                scenario: "ink",
                view: "dye",
                params: { densityDissipation: 0, velocityDissipation: 0 },
              },
            },
          ]}
        >
          Set DYE FADE to 0 and DRAG to 0, then stir once and watch the ink filaments
          stretch and fold for minutes. That is pure advection — the pattern is being carried
          by the velocity field you created with one gesture.
        </TryIt>
      </Section>

      <Section index="02" title="FORCES — YOUR CURSOR IS A TERM IN THE EQUATION">
        <p>
          The body-force term <Eq tex="\mathbf{F}" /> is where the outside world enters. In a
          weather model it is gravity and the Coriolis force. Here, it is you. Every drag of
          your pointer stamps a Gaussian blob of momentum onto the velocity field, centered
          on the cursor and aimed along its motion:
        </p>
        <Eq
          display
          n="04"
          tex="\mathbf{F}(\mathbf{x}) \;=\; \mathbf{d} \cdot \exp\!\left( -\frac{\lVert \mathbf{x} - \mathbf{x}_0 \rVert^2}{r} \right)"
        />
        <p>
          where <Eq tex="\mathbf{x}_0" /> is the cursor position, <Eq tex="\mathbf{d}" /> its
          velocity, and <Eq tex="r" /> the SPLAT RADIUS control. The same stamp deposits ink
          into the dye field — which is a separate quantity that just goes along for the
          ride. The scenarios are nothing more than scripted versions of this: VORTEX.PAIR is
          two stamps chasing each other in a circle, and PLUME stamps heat instead of
          momentum, then lets Section 08 do the lifting.
        </p>
        <TryIt
          actions={[
            { label: "RADIUS = 1.00", command: { params: { splatRadius: 1 } } },
            { label: "RADIUS = 0.05", command: { params: { splatRadius: 0.05 } } },
          ]}
        >
          Crank SPLAT RADIUS to 1.0 and shove the whole tank at once, then drop it to 0.05
          and draw fine threads. Same equation, different <Eq tex="r" />.
        </TryIt>
      </Section>

      <Section index="03" title="PRESSURE — THE FLUID PUSHES BACK">
        <p>
          After advection and forces, the velocity field is broken: it has divergence — spots
          where fluid piles up or vanishes, violating <Eq tex="\nabla\cdot\mathbf{u}=0" />.
          Pressure is what fixes this. By the Helmholtz decomposition, any field splits into
          a divergence-free part plus a gradient; we want to keep the first and throw away
          the second. Taking the divergence of the momentum equation turns this into a
          Poisson equation for pressure:
        </p>
        <Eq display n="05" tex="\nabla^2 p \;=\; \nabla \cdot \mathbf{u}^{*}" />
        <p>
          On a grid, this is a huge system of linear equations — one per cell, each coupling
          a cell to its four neighbors. The solver relaxes it with Jacobi iteration: each
          cell repeatedly replaces its pressure with the average of its neighbors, corrected
          by the local divergence:
        </p>
        <Eq
          display
          n="06"
          tex="p^{\,k+1}_{i,j} \;=\; \frac{p^{\,k}_{i-1,j} + p^{\,k}_{i+1,j} + p^{\,k}_{i,j-1} + p^{\,k}_{i,j+1} - d_{i,j}}{4}"
        />
        <p>
          Each sweep is one fullscreen GPU pass; the JACOBI ITER control is literally how
          many times it runs per frame. Then the gradient of the solved pressure is
          subtracted, and the field is (approximately) incompressible again:
        </p>
        <Eq display n="07" tex="\mathbf{u} \;=\; \mathbf{u}^{*} - \nabla p" />
        <TryIt
          actions={[
            { label: "X-RAY: PRESSURE", command: { view: "pressure" } },
            { label: "JACOBI = 4", command: { params: { pressureIterations: 4 } } },
            { label: "JACOBI = 60", command: { params: { pressureIterations: 60 } } },
          ]}
        >
          Switch FIELD X-RAY to PRESSURE and drag hard: orange is high pressure building in
          front of your stroke, blue the low pressure trailing it. Now drop JACOBI ITER to 4
          — the solve is too rough, and the fluid turns squishy and compressible. At 60 it
          stiffens up. You are watching convergence.
        </TryIt>
      </Section>

      <Section index="04" title="VORTICITY — KEEPING THE SWIRL ALIVE">
        <p>
          The curl of the velocity field measures local rotation — every eddy, whorl, and
          vortex:
        </p>
        <Eq display n="08" tex="\omega \;=\; \nabla \times \mathbf{u} \;=\; \frac{\partial u_y}{\partial x} - \frac{\partial u_x}{\partial y}" />
        <p>
          The blurring from Section 01 quietly eats small vortices, which is why naive
          solvers look like dishwater. Vorticity confinement (Fedkiw, Stam &amp; Jensen,
          2001 — developed for smoke in film effects) fights back: locate where rotation
          lives, and add a small force that spins it back up:
        </p>
        <Eq
          display
          n="09"
          tex="\mathbf{F}_{\text{conf}} \;=\; \varepsilon\,(\mathbf{N} \times \boldsymbol{\omega}), \qquad \mathbf{N} = \frac{\nabla|\omega|}{\lVert\nabla|\omega|\rVert}"
        />
        <p>
          The knob <Eq tex="\varepsilon" /> is the VORTICITY control. It is not physics — it
          is a confession that the grid is too coarse, paid back with interest.
        </p>
        <TryIt
          actions={[
            { label: "X-RAY: CURL", command: { view: "curl" } },
            { label: "ε = 0", command: { params: { curl: 0 } } },
            { label: "ε = 60", command: { params: { curl: 60 } } },
          ]}
        >
          Switch FIELD X-RAY to CURL: yellow spins clockwise, purple counter-clockwise, and
          every vortex is a tight dipole pair. Then set VORTICITY ε to 0 and watch the fluid
          go lifeless; at 60, ink shatters into curling filaments.
        </TryIt>
      </Section>

      <Section index="05" title="BOUNDARIES — THE KÁRMÁN VORTEX STREET">
        <p>
          Everything so far happened in an empty tank. The KÁRMÁN.ST scenario puts a solid
          cylinder in a steady current, and solids change everything: fluid cannot flow
          through them (<em>no-penetration</em>), and real fluid cannot even slide along
          them (<em>no-slip</em>). In the solver, the cylinder is two extra boundary
          conditions: velocity is forced to zero inside the solid, and the pressure solve
          treats its surface as a wall through which nothing pushes:
        </p>
        <Eq
          display
          n="10"
          tex="\mathbf{u}\big|_{\text{solid}} = 0, \qquad \frac{\partial p}{\partial n}\Big|_{\text{surface}} = 0"
        />
        <p>
          What happens next depends on a single dimensionless number — the ratio of inertia
          to viscosity, named for Osborne Reynolds:
        </p>
        <Eq display n="11" tex="Re \;=\; \frac{U L}{\nu}" />
        <p>
          where <Eq tex="U" /> is the flow speed and <Eq tex="L" /> the cylinder diameter.
          Below <Eq tex="Re \approx 50" />, the flow slides politely around and closes up
          behind. Above it, the wake becomes unstable: the boundary layer peels off one side,
          then the other, shedding a staggered double row of counter-rotating vortices — the
          Kármán vortex street. The shedding is beautifully regular; its rhythm is set by the
          Strouhal number, <Eq tex="St = f L / U \approx 0.2" /> over an enormous range of
          scales. This is why power lines hum in the wind, why chimneys wear spiral fins to
          break the rhythm, and what draws hundred-kilometer vortex streets in the clouds
          behind ocean islands.
        </p>
        <TryIt
          actions={[
            { label: "RUN: KÁRMÁN", command: { scenario: "karman", view: "dye" } },
            { label: "KÁRMÁN × CURL", command: { scenario: "karman", view: "curl" } },
          ]}
        >
          Grab the cylinder and drag it — the street re-forms behind it wherever it goes.
          Switch FIELD X-RAY to CURL to see the street as it really is: alternating yellow
          (clockwise) and purple (counter-clockwise) vortices peeling off in sequence.
        </TryIt>
      </Section>

      <Section index="06" title="RHYTHM — MEASURING THE STREET">
        <p>
          A vortex street is not merely irregular churning; it is a <em>clock</em>. Vortices
          detach alternately, at a rate that is remarkably steady for a given flow. Park the
          probe in the wake and watch its pressure trace: each passing vortex drags a
          low-pressure core across the probe, so the trace oscillates once per shed pair.
          You are reading the clock directly.
        </p>
        <p>
          The rate is captured by another dimensionless group, the Strouhal number, named
          for Vincenz Strouhal, who in 1878 was trying to explain why wires sing in the wind:
        </p>
        <Eq display n="12" tex="St \;=\; \frac{f\,D}{U}" />
        <p>
          with <Eq tex="f" /> the shedding frequency, <Eq tex="D" /> the cylinder diameter,
          and <Eq tex="U" /> the freestream speed. The remarkable fact is that for circular
          cylinders across an enormous range of Reynolds numbers — roughly{" "}
          <Eq tex="10^2" /> to <Eq tex="10^5" /> — <Eq tex="St" /> sits near{" "}
          <strong>0.2</strong> and barely moves. That single constant is a genuinely
          predictive piece of physics. Rearranged, it says the pitch of the shedding rises
          with wind speed and falls with thickness:
        </p>
        <Eq display n="13" tex="f \;\approx\; 0.2\,\frac{U}{D}" />
        <p>
          Which is why a taut wire in a gale whistles a high note and a thick cable moans a
          low one — the aeolian tone, the same phenomenon that names the aeolian harp. It is
          also why the fix for a vibrating chimney is a helical strake wrapped around it:
          the spiral prevents vortices from detaching in phase along the length, breaking the
          rhythm before it can build. Get this wrong and structures fail. In November 1965,
          winds shed vortices in step across a row of cooling towers at Ferrybridge in
          Yorkshire; three of the eight collapsed.
        </p>
        <p>
          You can also just listen to it. The TONE control feeds the probe&rsquo;s measured
          oscillation to an oscillator, lifted into hearing range by a fixed factor — so the
          pitch is not a sound effect chosen to seem plausible, it is{" "}
          <Eq tex="f" /> as the solver is producing it. Shrink the cylinder or raise the wind
          and the note climbs, exactly as <Eq tex="f \approx 0.2\,U/D" /> says it must. Move
          the probe out of the wake and it falls silent, because out there nothing is
          oscillating to hear.
        </p>
        <TryIt
          actions={[
            { label: "RUN: KÁRMÁN", command: { scenario: "karman", view: "dye" } },
            { label: "THICKER WAKE: ε = 30", command: { scenario: "karman", params: { curl: 30 } } },
          ]}
        >
          Drag the probe into the wake, a few diameters downstream, and read the trace at
          the bottom of its tag — the oscillation you see <em>is</em> <Eq tex="f" />, printed
          beside it in Hz. Press <strong>T</strong> to hear the same number. Then drag the
          cylinder up out of the flow: the trace flattens and the note dies, because there is
          nothing left shedding.
        </TryIt>
      </Section>

      <Section index="07" title="LIFT — WHAT A WING ACTUALLY DOES">
        <p>
          The wing in this tank is a symmetric section — a NACA 0015 — and that is the whole
          argument. Its upper and lower surfaces are <em>identical</em>. The popular story,
          that air going over the top &ldquo;must travel farther, so it speeds up,&rdquo; has
          nothing to work with here: there is no longer path. Nothing requires two parcels
          that split at the nose to meet again at the tail, and in real measurements they
          emphatically do not. Symmetric sections like this one are what aerobatic aircraft
          fly, which is precisely why they perform the same inverted.
        </p>
        <p>
          What actually happens is simpler and visible in front of you: tilt the section and
          it <em>turns the flow downward</em>. Turning fluid requires a force, and by
          Newton&rsquo;s third law the fluid pushes back up on the wing. Sustaining that turn
          requires a pressure difference, which the solver finds for you every frame — low
          above, high below. The classical result ties lift per unit span to the circulation{" "}
          <Eq tex="\Gamma" /> around the wing — the Kutta–Joukowski theorem:
        </p>
        <Eq
          display
          n="14"
          tex="L' \;=\; \rho\, U\, \Gamma, \qquad \Gamma = \oint_C \mathbf{u} \cdot d\boldsymbol{\ell}"
        />
        <p>
          A symmetric section makes one more prediction, and you can check it: at{" "}
          <Eq tex="\alpha = 0" /> it should produce <em>no</em> lift at all, because the flow
          is then perfectly symmetric top to bottom. Set the angle to zero and the pressure
          field goes symmetric with it. A cambered wing — the fat, curved airliner section —
          is simply this same mechanism with a built-in turn, so it still lifts at zero
          angle. Camber shifts the curve; it does not explain it.
        </p>
        <p>
          Tilt further and lift grows — up to a point. Past roughly 15–25° the flow can no
          longer follow the upper surface: it separates, the neat low-pressure region breaks
          into shed vortices, and lift collapses while drag soars. That is stall, the same
          event pilots train against, reproduced by nothing but the boundary conditions of
          Section 05 at a steeper angle.
        </p>
        <TryIt
          actions={[
            { label: "RUN: WING", command: { scenario: "wing", view: "dye" } },
            { label: "WING × PRESSURE", command: { scenario: "wing", view: "pressure" } },
            { label: "STALL: α = 32°", command: { scenario: "wing", params: { attackAngleDeg: 32 } } },
          ]}
        >
          Run WING and X-ray the PRESSURE: blue above the plate, orange below — that
          difference, integrated over the surface, is lift. Slide ANGLE α to 0° and the
          asymmetry vanishes; slide to 32° and watch the upper flow tear away. You are
          stalling a wing.
        </TryIt>
      </Section>

      <Section index="08" title="BUOYANCY — WHY HOT AIR RISES">
        <p>
          Nothing so far explains a candle flame or a thundercloud: the fluid had no reason
          to go <em>up</em>. Real convection happens because hot fluid is less dense, and
          gravity pulls harder on its cold neighbors, which sink and squeeze it upward.
          Tracking true density changes would break our incompressible solver — so we use
          Joseph Boussinesq&rsquo;s 1903 approximation: ignore density variation everywhere{" "}
          <em>except</em> in the gravity term, where temperature acts as a vertical force:
        </p>
        <Eq display n="15" tex="\mathbf{F}_{\text{buoyancy}} \;=\; \beta\, T \,\hat{\mathbf{y}}" />
        <p>
          The solver carries a temperature field <Eq tex="T" /> that is advected by the flow
          exactly like the ink — it rides along, cooling as it spreads — while pushing the
          velocity field up wherever it is warm (<Eq tex="T &gt; 0" />) and down wherever it
          is cold (<Eq tex="T &lt; 0" />). That one term buys two scenarios. In PLUME, floor
          burners inject nothing but heat and smoke; every meter of rise is earned through
          buoyancy, and the mushroom heads form where the rising column shears against still
          air. In RAYLEIGH.T, cold dense fluid is supplied along the ceiling: heavy-over-light
          is unstable, and the interface erupts into falling fingers that mushroom and split —
          the Rayleigh–Taylor instability, the same physics that shapes supernova remnants
          and the roil of cream first touching coffee.
        </p>
        <TryIt
          actions={[
            { label: "RUN: PLUME", command: { scenario: "plume", view: "dye" } },
            { label: "RAYLEIGH × HEAT", command: { scenario: "rayleigh", view: "heat" } },
            { label: "β = 0", command: { params: { buoyancy: 0 } } },
          ]}
        >
          In PLUME, drag anywhere: your strokes deposit heat, so whatever you draw catches
          an updraft. Switch FIELD X-RAY to HEAT to watch embers rise and cold rain fall in
          RAYLEIGH.T — then drop BUOYANCY β to 0 and watch both scenarios go inert.
        </TryIt>
      </Section>

      <Section index="09" title="WHAT THIS GETS WRONG">
        <p>
          Everything above is true, and this simulation is still not physics. It was built
          for film effects, not for engineering, and the difference is worth being precise
          about — a demo that only tells you what it does well is selling something.
        </p>
        <p>
          <strong>The viscosity is an accident.</strong> Section 01 skipped the{" "}
          <Eq tex="\nu\nabla^2\mathbf{u}" /> term because semi-Lagrangian advection blurs the
          field anyway, and that blur stands in for it. But that blur is a property of the
          grid, not of any fluid: it scales with cell size and time step rather than with a
          material constant. So this tank has no controllable Reynolds number. You cannot ask
          it for water rather than air, and the <Eq tex="Re" /> in Section 05 is a story
          about what you are seeing, not a number the solver was given.
        </p>
        <p>
          <strong>Vorticity confinement is a fudge.</strong> Section 04 said so plainly. The
          force in <Eq tex="\mathbf{F}_{\text{conf}}" /> appears in no physical law; it exists
          to repay energy the discretisation stole. Turn ε up and the fluid becomes more
          lively and <em>less</em> correct at the same time.
        </p>
        <p>
          <strong>It is two-dimensional, and that is not a small thing.</strong> In 3D,
          vortex tubes stretch, and stretching spins them faster — the mechanism that drives
          energy from large scales down to small ones until viscosity consumes it, the
          Richardson–Kolmogorov cascade. In 2D that mechanism does not exist, so energy runs
          the other way: small eddies merge into larger ones. Two-dimensional turbulence is
          not a simplification of the 3D kind; it is a genuinely different phenomenon, which
          is why these vortices coalesce and persist rather than shredding.
        </p>
        <p>
          <strong>And the grid is tiny.</strong> A few hundred cells across, one pressure
          solve of a few dozen Jacobi sweeps — which does not fully converge, so the fluid is
          never quite incompressible. A research simulation of the same wake resolves
          billions of cells and runs for days on a cluster. What you have is not a smaller
          version of that. It is a different object that happens to move in a convincing way,
          which was always the point: Stam&rsquo;s paper is titled &ldquo;Stable
          Fluids,&rdquo; not &ldquo;Accurate&rdquo; ones.
        </p>
        <TryIt
          actions={[
            { label: "ε = 0 (NO FUDGE)", command: { params: { curl: 0 } } },
            { label: "JACOBI = 4", command: { params: { pressureIterations: 4 } } },
          ]}
        >
          Set VORTICITY ε to 0 to see the flow the discretisation actually produces, without
          the confinement force propping it up. Then drop JACOBI ITER to 4 and watch
          incompressibility itself fail — fluid visibly piling up and vanishing.
        </TryIt>
      </Section>

      <Section index="10" title="THE LOOP — SIXTY SOLVES PER SECOND">
        <p>Per frame, in order, entirely on the GPU:</p>
        <ol className="loopList">
          <li>
            <strong>CURL + CONFINE</strong> — measure <Eq tex="\omega" />, reinforce the swirl
          </li>
          <li>
            <strong>DIVERGENCE</strong> — measure <Eq tex="\nabla\cdot\mathbf{u}" />
          </li>
          <li>
            <strong>JACOBI ×N</strong> — relax <Eq tex="\nabla^2 p = \nabla\cdot\mathbf{u}^*" />
          </li>
          <li>
            <strong>PROJECT</strong> — subtract <Eq tex="\nabla p" />
          </li>
          <li>
            <strong>ADVECT</strong> — velocity carries itself, then the ink
          </li>
        </ol>
        <p>
          Every field — velocity, pressure, divergence, curl, dye — is a floating-point
          texture, and every step above is one fragment shader pass over it: at the default
          settings, about thirty fullscreen passes per frame, a few hundred million cell
          updates per second. The same operator-splitting scheme, at vastly higher
          resolution and with real physics restored, is how weather is forecast, aircraft
          are designed, and every ocean in every film you have seen was made. The equations
          have not changed since 1845. What changed is that the machine for solving them is
          now in your pocket, idling, waiting for you to drag a finger through it.
        </p>
        <TryIt>
          Open TELEMETRY and read the machinery: the sim grid the solver runs on, the finer
          grid the ink lives on, and the frame budget it all fits inside — under 16.7
          milliseconds, every frame.
        </TryIt>
      </Section>

      <footer className="refs">
        <p className="panelLabel">REFERENCES</p>
        <ul>
          <li>J. Stam — &ldquo;Stable Fluids&rdquo;, SIGGRAPH 1999 — the method this solver runs</li>
          <li>R. Fedkiw, J. Stam, H. W. Jensen — &ldquo;Visual Simulation of Smoke&rdquo;, SIGGRAPH 2001 — vorticity confinement</li>
          <li>M. Harris — &ldquo;Fast Fluid Dynamics Simulation on the GPU&rdquo;, GPU Gems ch. 38, 2004</li>
          <li>P. Dobryakov — WebGL-Fluid-Simulation, whose GPU formulation this solver follows</li>
          <li>T. von Kármán — &ldquo;Über den Mechanismus des Widerstandes…&rdquo;, Göttingen Nachrichten, 1911</li>
          <li>V. Strouhal — &ldquo;Über eine besondere Art der Tonerregung&rdquo;, Annalen der Physik, 1878</li>
          <li>J. Boussinesq — <em>Théorie analytique de la chaleur</em>, 1903 — the buoyancy approximation</li>
          <li>R. H. Kraichnan — &ldquo;Inertial Ranges in Two-Dimensional Turbulence&rdquo;, Physics of Fluids, 1967 — why Section 09 matters</li>
          <li>M. Van Dyke — <em>An Album of Fluid Motion</em>, Parabolic Press, 1982 — what these flows look like in a real tank</li>
          <li>Clay Mathematics Institute — Navier–Stokes existence and smoothness, one of the seven Millennium Prize Problems</li>
          <li>N. Smith, S. van der Walt — the perceptually-uniform colormaps used for the dye and field views, SciPy 2015</li>
        </ul>
        <p className="refsColophon">FLUIDITY — BUILT WITH WEBGL2 · HALF-FLOAT TEXTURES · NO PHYSICS ENGINE, JUST SHADERS</p>
      </footer>
    </main>
  );
}
