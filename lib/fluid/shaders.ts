// GLSL 300 es shader sources for the stable-fluids solver.
// Method: Stam, "Stable Fluids" (1999); GPU formulation after
// Harris, GPU Gems ch. 38 (2004).

export const BASE_VERTEX = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

export const COPY_FRAG = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
void main () {
  fragColor = texture(uTexture, vUv);
}`;

export const CLEAR_FRAG = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform float value;
void main () {
  fragColor = value * texture(uTexture, vUv);
}`;

// Semi-Lagrangian advection: walk backwards along the velocity field
// and sample where the quantity came from. Unconditionally stable.
export const ADVECTION_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main () {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  fragColor = result / decay;
}`;

// Gaussian impulse: how pointers (and scenario emitters) push the fluid.
export const SPLAT_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main () {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`;

// Shared helper: signed distance to the solid obstacle (negative inside).
// uObstacle = (center.x, center.y, size, halfThickness):
//   shape 0 — circle of radius `size` (halfThickness unused);
//   shape 1 — plate (capsule) of half-length `size`, rotated by uObstacleAngle.
// size <= 0 disables. Distances are aspect-corrected to be true on screen.
const OBSTACLE_GLSL = `
uniform vec4 uObstacle;
uniform int uObstacleShape;
uniform float uObstacleAngle;
uniform float uObstacleHover;
uniform float uAspect;
/**
 * Half-thickness of a symmetric NACA four-digit section at chord fraction t.
 * Symmetric is the deliberate choice: a cambered upper surface would draw
 * the very "longer path over the top" picture Section 07 refutes, whereas
 * this section has identical surfaces and lifts anyway.
 */
float nacaHalfThickness (float t, float chord, float ratio) {
  float s = clamp(t, 0.0, 1.0);
  float poly = 0.2969 * sqrt(s) - 0.1260 * s - 0.3516 * s * s
             + 0.2843 * s * s * s - 0.1036 * s * s * s * s;
  return (ratio / 0.2) * chord * poly;
}

float obstacleSD (vec2 p) {
  if (uObstacle.z <= 0.0) return 1.0;
  vec2 d = p - uObstacle.xy;
  d.x *= uAspect;
  if (uObstacleShape == 0) return length(d) - uObstacle.z;

  float c = cos(uObstacleAngle);
  float s = sin(uObstacleAngle);
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);

  if (uObstacleShape == 2) {
    // Airfoil: chord runs from -halfChord to +halfChord, nose into the flow.
    // Note: "half" is a reserved word in GLSL ES, so it cannot be named that.
    float halfChord = uObstacle.z;
    float chord = 2.0 * halfChord;
    float yt = nacaHalfThickness((q.x + halfChord) / chord, chord, uObstacle.w);
    // Box-style signed distance with a chord-varying half-height. Exact for
    // the inside test, a good approximation outside.
    vec2 e = vec2(max(abs(q.x) - halfChord, 0.0), max(abs(q.y) - yt, 0.0));
    return length(e) + min(max(abs(q.x) - halfChord, abs(q.y) - yt), 0.0);
  }

  vec2 e = vec2(max(abs(q.x) - uObstacle.z, 0.0), q.y);
  return length(e) - uObstacle.w;
}
bool inObstacle (vec2 p) {
  return obstacleSD(p) < 0.0;
}`;

export const DIVERGENCE_FRAG = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform float uOpenX;
${OBSTACLE_GLSL}
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  // Closed tank: reflect, so nothing crosses the boundary. Wind tunnel:
  // zero-gradient on the left and right, so flow enters and leaves freely.
  // Reflecting here made the outlet a solid wall, and the flow stagnated
  // into a dead band just short of the edge.
  if (vL.x < 0.0) { L = uOpenX > 0.5 ? C.x : -C.x; }
  if (vR.x > 1.0) { R = uOpenX > 0.5 ? C.x : -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  // Solid wall: no fluid crosses the obstacle surface.
  if (inObstacle(vL)) { L = 0.0; }
  if (inObstacle(vR)) { R = 0.0; }
  if (inObstacle(vT)) { T = 0.0; }
  if (inObstacle(vB)) { B = 0.0; }
  float div = 0.5 * (R - L + T - B);
  if (inObstacle(vUv)) { div = 0.0; }
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

// Wind tunnel: force freestream velocity at the inlet and outlet bands and
// gently pull the interior toward it, so a steady current crosses the tank.
export const WIND_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform float uSpeed;
uniform float uPull;
uniform float dt;
${OBSTACLE_GLSL}
void main () {
  vec2 v = texture(uVelocity, vUv).xy;
  vec2 target = vec2(uSpeed, 0.0);
  // Only the inlet is pinned. Pinning the outlet too fought the projection
  // and produced a stagnant band; with open boundaries the flow simply
  // leaves, which is what a tunnel does.
  if (vUv.x < 0.05) {
    v = target;
  } else {
    v += (target - v) * min(uPull * dt, 1.0);
  }
  if (inObstacle(vUv)) { v = vec2(0.0); }
  fragColor = vec4(v, 0.0, 1.0);
}`;

export const CURL_FRAG = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`;

// Vorticity confinement: numerical dissipation smears out small eddies,
// so we detect rotation and push it back in (Fedkiw et al. 2001).
export const VORTICITY_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -1000.0), 1000.0);
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

// Boussinesq buoyancy: density differences are ignored everywhere except
// as a vertical force proportional to temperature. Hot rises, cold sinks.
export const BUOYANCY_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uTemperature;
uniform float uBuoyancy;
uniform float dt;
void main () {
  vec2 v = texture(uVelocity, vUv).xy;
  float T = texture(uTemperature, vUv).x;
  v.y += uBuoyancy * T * dt;
  fragColor = vec4(v, 0.0, 1.0);
}`;

// One Jacobi relaxation step for the pressure Poisson equation.
export const PRESSURE_FRAG = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform float uOpenX;
${OBSTACLE_GLSL}
void main () {
  float C = texture(uPressure, vUv).x;
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  // Neumann boundary at the obstacle surface: ∂p/∂n = 0.
  if (inObstacle(vL)) { L = C; }
  if (inObstacle(vR)) { R = C; }
  if (inObstacle(vT)) { T = C; }
  if (inObstacle(vB)) { B = C; }
  // Open inlet/outlet: p = 0 there, which anchors the solve and stops
  // pressure accumulating against what would otherwise be a wall.
  if (uOpenX > 0.5 && vL.x < 0.0) { L = 0.0; }
  if (uOpenX > 0.5 && vR.x > 1.0) { R = 0.0; }
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

// Projection: subtract the pressure gradient to make the field divergence-free.
export const GRADIENT_SUBTRACT_FRAG = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform float uOpenX;
${OBSTACLE_GLSL}
void main () {
  float C = texture(uPressure, vUv).x;
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  if (inObstacle(vL)) { L = C; }
  if (inObstacle(vR)) { R = C; }
  if (inObstacle(vT)) { T = C; }
  if (inObstacle(vB)) { B = C; }
  if (uOpenX > 0.5 && vL.x < 0.0) { L = 0.0; }
  if (uOpenX > 0.5 && vR.x > 1.0) { R = 0.0; }
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  // No-slip inside the solid.
  if (inObstacle(vUv)) { velocity = vec2(0.0); }
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

// Bloom. Dye is emissive — it is light in a dark tank — and light bleeds.
// Without this the brightest cores read as flat paint; with it they radiate,
// which is what every photograph of real dye or flame actually looks like.

/** Extract the bright end with a soft knee, so the bloom has no hard edge. */
export const BLOOM_PREFILTER_FRAG = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec3 curve;
uniform float threshold;
void main () {
  vec3 c = texture(uTexture, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - curve.x, 0.0, curve.y);
  rq = curve.z * rq * rq;
  c *= max(rq, br - threshold) / max(br, 0.0001);
  fragColor = vec4(c, 1.0);
}`;

/** Four bilinear taps — used for both halves of the down/up pyramid. */
export const BLOOM_BLUR_FRAG = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uTexture;
void main () {
  vec4 sum = texture(uTexture, vL) + texture(uTexture, vR)
           + texture(uTexture, vT) + texture(uTexture, vB);
  fragColor = sum * 0.25;
}`;

// Final composite. Modes let you X-ray the solver's internal fields:
// 0 = dye, 1 = velocity (direction as hue), 2 = pressure, 3 = curl,
// 4 = temperature (embers for hot, ice for cold).
export const DISPLAY_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform sampler2D uVelocity;
uniform sampler2D uPressure;
uniform sampler2D uCurl;
uniform sampler2D uTemperature;
uniform sampler2D uBloom;
uniform float uBloomIntensity;
uniform float uExposure;
uniform int uMode;
${OBSTACLE_GLSL}

/**
 * Narkowicz's ACES approximation. Dye accumulates well past 1.0, and a raw
 * clamp turns every bright core into a flat white blob — the hue is thrown
 * away exactly where the eye is looking. A filmic curve rolls the highlights
 * off instead, so a hot region stays gold or cyan rather than going white.
 */
vec3 tonemap (vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

/**
 * A little ordered noise below one 8-bit step. The tank is full of very
 * smooth gradients, which is precisely where 8-bit output bands.
 */
float dither (vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
}

vec3 hsv2rgb (vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main () {
  if (uMode == 1) {
    // Same five-tap cross as the curl view: the field is magnified from the
    // sim grid, and hue comes from atan2, which swings hard on small
    // differences. Smoothing the vector before taking its angle is what
    // stops the low-speed field reading as directional confetti.
    vec2 vc = texture(uVelocity, vUv).xy;
    vec2 vn = (texture(uVelocity, vL).xy + texture(uVelocity, vR).xy +
               texture(uVelocity, vT).xy + texture(uVelocity, vB).xy) * 0.25;
    vec2 v = mix(vc, vn, 0.5);
    float speed = length(v);
    float mag = speed / 260.0;
    mag = mag / (1.0 + mag);
    float hue = atan(v.y, v.x) / 6.2831853 + 0.5;
    // Direction is meaningless where nothing is moving, so let it desaturate
    // rather than assert a hue the data does not support.
    float sat = 0.92 * smoothstep(1.5, 26.0, speed);
    fragColor = vec4(hsv2rgb(vec3(hue, sat, mag * 1.6)), 1.0);
  } else if (uMode == 2) {
    float p = texture(uPressure, vUv).x * 0.12;
    float pos = clamp(p, 0.0, 1.0);
    float neg = clamp(-p, 0.0, 1.0);
    pos = pos / (1.0 + pos);
    neg = neg / (1.0 + neg);
    fragColor = vec4(vec3(1.0, 0.30, 0.0) * pos * 1.8 + vec3(0.1, 0.35, 1.0) * neg * 1.8, 1.0);
  } else if (uMode == 3) {
    // Curl is a finite difference of velocity, so it carries grid-scale
    // speckle that magnifying to the canvas makes very visible. A five-tap
    // cross over the sim grid low-passes it without altering magnitude.
    float wc = texture(uCurl, vUv).x;
    float ws = (texture(uCurl, vL).x + texture(uCurl, vR).x +
                texture(uCurl, vT).x + texture(uCurl, vB).x) * 0.25;
    float w = mix(wc, ws, 0.55) * 0.06;
    float cw = clamp(w, 0.0, 1.0);
    float ccw = clamp(-w, 0.0, 1.0);
    cw = cw / (1.0 + cw);
    ccw = ccw / (1.0 + ccw);
    fragColor = vec4(vec3(1.0, 0.85, 0.1) * cw * 1.8 + vec3(0.75, 0.2, 1.0) * ccw * 1.8, 1.0);
  } else if (uMode == 4) {
    float T = texture(uTemperature, vUv).x * 0.7;
    float hot = clamp(T, 0.0, 4.0);
    float cold = clamp(-T, 0.0, 4.0);
    hot = hot / (1.0 + hot);
    cold = cold / (1.0 + cold);
    vec3 c = vec3(1.0, 0.38, 0.03) * hot * 1.7 + vec3(1.0) * hot * hot * 0.8;
    c += vec3(0.25, 0.55, 1.0) * cold * 1.7 + vec3(1.0) * cold * cold * 0.8;
    fragColor = vec4(c, 1.0);
  } else {
    vec3 c = texture(uTexture, vUv).rgb;
    c += texture(uBloom, vUv).rgb * uBloomIntensity;
    c = tonemap(c * uExposure);
    fragColor = vec4(c, 1.0);
  }

  // Applied to every view: the X-rays are smooth fields too, and band just
  // as readily as the dye does.
  fragColor.rgb += dither(gl_FragCoord.xy) / 255.0;

  // Draw the solid obstacle over every view: matte slab, safety-orange rim.
  // The rim thickens and brightens under the cursor — the only signal that
  // the specimen can be picked up and moved.
  if (uObstacle.z > 0.0) {
    float sd = obstacleSD(vUv);
    float body = 1.0 - smoothstep(-0.003, 0.0, sd);
    float inner = mix(-0.008, -0.014, uObstacleHover);
    float rim = smoothstep(inner, inner + 0.004, sd) - smoothstep(-0.001, 0.002, sd);
    fragColor.rgb = mix(fragColor.rgb, vec3(0.045), body);
    vec3 rimColor = mix(vec3(1.0, 0.27, 0.0), vec3(1.0, 0.55, 0.3), uObstacleHover);
    fragColor.rgb = mix(fragColor.rgb, rimColor, clamp(rim, 0.0, 1.0));
  }
}`;
