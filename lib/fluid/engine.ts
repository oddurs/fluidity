// GPU fluid solver — the "stable fluids" method on WebGL2.
// Per frame: advect velocity → confine vorticity → project (pressure solve)
// → advect dye. All fields live in half-float textures; every pass is a
// fullscreen fragment shader.

import {
  ADVECTION_FRAG,
  BASE_VERTEX,
  BLOOM_BLUR_FRAG,
  BLOOM_PREFILTER_FRAG,
  BUOYANCY_FRAG,
  CLEAR_FRAG,
  COPY_FRAG,
  CURL_FRAG,
  DISPLAY_FRAG,
  DIVERGENCE_FRAG,
  GRADIENT_SUBTRACT_FRAG,
  PRESSURE_FRAG,
  SPLAT_FRAG,
  VORTICITY_FRAG,
  WIND_FRAG,
} from "./shaders.ts";

export type ViewMode = "dye" | "velocity" | "pressure" | "curl" | "heat";

export interface SimParams {
  simResolution: number;
  dyeResolution: number;
  densityDissipation: number;
  velocityDissipation: number;
  pressure: number;
  pressureIterations: number;
  curl: number;
  splatRadius: number;
  splatForce: number;
  /** Boussinesq coefficient: vertical acceleration per unit temperature. */
  buoyancy: number;
  temperatureDissipation: number;
  /** Plate obstacle angle of attack, in degrees (nose-up positive). */
  attackAngleDeg: number;
  /** How strongly bright dye radiates. 0 disables the bloom passes. */
  bloom: number;
  /** Brightness applied before the filmic curve. */
  exposure: number;
}

export const DEFAULT_PARAMS: SimParams = {
  simResolution: 256,
  dyeResolution: 1024,
  densityDissipation: 1.0,
  velocityDissipation: 0.25,
  pressure: 0.8,
  pressureIterations: 24,
  curl: 30,
  splatRadius: 0.25,
  splatForce: 6000,
  buoyancy: 0,
  temperatureDissipation: 0.4,
  attackAngleDeg: 0,
  bloom: 0.85,
  exposure: 1.15,
};

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(id: number): number;
}

interface DoubleFBO {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FBO;
  write: FBO;
  swap(): void;
}

class Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation> = {};

  constructor(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Program link failed: " + gl.getProgramInfoLog(program));
    }
    this.program = program;
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(program, i)!.name;
      this.uniforms[name] = gl.getUniformLocation(program, name)!;
    }
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error("Shader compile failed: " + gl.getShaderInfoLog(shader));
  }
  return shader;
}

/** A solid boundary in the flow. radius <= 0 disables it. */
export interface Obstacle {
  x: number;
  y: number;
  /**
   * Circle radius, or plate half-length, as a fraction of tank height
   * (aspect-corrected so shapes are true on screen).
   */
  radius: number;
  shape?: "circle" | "plate" | "airfoil";
  /**
   * Plate: half-thickness as a fraction of tank height.
   * Airfoil: thickness ratio as a fraction of chord (0.12 = a NACA 0012).
   */
  thickness?: number;
  /** Rotation in radians; driven from params.attackAngleDeg each step. */
  angle?: number;
}

/** Wind-tunnel forcing. speed 0 disables the pass entirely. */
export interface Wind {
  /** Freestream velocity in sim texels/second. */
  speed: number;
  /** How hard the interior relaxes toward freestream, in 1/s. */
  pull: number;
}

export class FluidEngine {
  readonly params: SimParams;
  viewMode: ViewMode = "dye";
  paused = false;
  obstacle: Obstacle = { x: 0.3, y: 0.5, radius: 0 };
  wind: Wind = { speed: 0, pull: 0 };
  /** 0..1 highlight on the obstacle rim; eased toward by the render loop. */
  obstacleHover = 0;

  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;

  private copyProgram: Program;
  private clearProgram: Program;
  private splatProgram: Program;
  private advectionProgram: Program;
  private divergenceProgram: Program;
  private curlProgram: Program;
  private vorticityProgram: Program;
  private pressureProgram: Program;
  private gradientProgram: Program;
  private displayProgram: Program;
  private windProgram: Program;
  private buoyancyProgram: Program;
  private bloomPrefilterProgram: Program;
  private bloomBlurProgram: Program;

  private dye!: DoubleFBO;
  private velocity!: DoubleFBO;
  private divergence!: FBO;
  private curlFBO!: FBO;
  private pressureFBO!: DoubleFBO;
  private temperature!: DoubleFBO;
  /** Half-resolution pyramid, coarsest last. */
  private bloomChain: FBO[] = [];
  private bloomResult!: FBO;

  private quadVAO: WebGLVertexArrayObject;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, params?: Partial<SimParams>) {
    this.canvas = canvas;
    this.params = { ...DEFAULT_PARAMS, ...params };

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;

    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error("EXT_color_buffer_float is not supported — cannot run the solver.");
    }
    gl.getExtension("OES_texture_float_linear");

    // Fullscreen quad
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const elements = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.quadVAO = vao;

    this.copyProgram = new Program(gl, BASE_VERTEX, COPY_FRAG);
    this.clearProgram = new Program(gl, BASE_VERTEX, CLEAR_FRAG);
    this.splatProgram = new Program(gl, BASE_VERTEX, SPLAT_FRAG);
    this.advectionProgram = new Program(gl, BASE_VERTEX, ADVECTION_FRAG);
    this.divergenceProgram = new Program(gl, BASE_VERTEX, DIVERGENCE_FRAG);
    this.curlProgram = new Program(gl, BASE_VERTEX, CURL_FRAG);
    this.vorticityProgram = new Program(gl, BASE_VERTEX, VORTICITY_FRAG);
    this.pressureProgram = new Program(gl, BASE_VERTEX, PRESSURE_FRAG);
    this.gradientProgram = new Program(gl, BASE_VERTEX, GRADIENT_SUBTRACT_FRAG);
    this.displayProgram = new Program(gl, BASE_VERTEX, DISPLAY_FRAG);
    this.windProgram = new Program(gl, BASE_VERTEX, WIND_FRAG);
    this.buoyancyProgram = new Program(gl, BASE_VERTEX, BUOYANCY_FRAG);
    this.bloomPrefilterProgram = new Program(gl, BASE_VERTEX, BLOOM_PREFILTER_FRAG);
    this.bloomBlurProgram = new Program(gl, BASE_VERTEX, BLOOM_BLUR_FRAG);

    this.initFramebuffers();
  }

  get simSize(): [number, number] {
    return [this.velocity.width, this.velocity.height];
  }
  get dyeSize(): [number, number] {
    return [this.dye.width, this.dye.height];
  }

  private getResolution(resolution: number) {
    const gl = this.gl;
    let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight
      ? { width: max, height: min }
      : { width: min, height: max };
  }

  private createFBO(w: number, h: number, internalFormat: number, format: number, type: number, filter: number): FBO {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach: (id: number) => {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  private createDoubleFBO(w: number, h: number, internalFormat: number, format: number, type: number, filter: number): DoubleFBO {
    let fbo1 = this.createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = this.createFBO(w, h, internalFormat, format, type, filter);
    return {
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      get read() {
        return fbo1;
      },
      get write() {
        return fbo2;
      },
      swap() {
        const tmp = fbo1;
        fbo1 = fbo2;
        fbo2 = tmp;
      },
    };
  }

  private initFramebuffers() {
    const gl = this.gl;
    const sim = this.getResolution(this.params.simResolution);
    const dye = this.getResolution(this.params.dyeResolution);
    const HF = gl.HALF_FLOAT;

    // Single-buffer fields are rebuilt from scratch every time, so release
    // the previous pair or each resize leaks a texture and a framebuffer.
    for (const old of [this.divergence, this.curlFBO]) {
      if (!old) continue;
      gl.deleteTexture(old.texture);
      gl.deleteFramebuffer(old.fbo);
    }

    this.dye = this.resizeDoubleFBO(this.dye, dye.width, dye.height, gl.RGBA16F, gl.RGBA, HF, gl.LINEAR);
    this.velocity = this.resizeDoubleFBO(this.velocity, sim.width, sim.height, gl.RG16F, gl.RG, HF, gl.LINEAR);
    this.temperature = this.resizeDoubleFBO(this.temperature, sim.width, sim.height, gl.R16F, gl.RED, HF, gl.LINEAR);
    // Divergence is never displayed and is only ever sampled at exact texel
    // centres, so point sampling is right for it.
    this.divergence = this.createFBO(sim.width, sim.height, gl.R16F, gl.RED, HF, gl.NEAREST);
    // Curl and pressure ARE displayed, magnified from the sim grid to the
    // full canvas. Point sampling turned every sim texel into a hard square;
    // half-float is filterable in WebGL2, and the solver reads both at exact
    // texel centres, so linear sampling costs it nothing numerically.
    this.curlFBO = this.createFBO(sim.width, sim.height, gl.R16F, gl.RED, HF, gl.LINEAR);
    this.pressureFBO = this.resizeDoubleFBO(this.pressureFBO, sim.width, sim.height, gl.R16F, gl.RED, HF, gl.LINEAR);

    for (const old of this.bloomChain) {
      gl.deleteTexture(old.texture);
      gl.deleteFramebuffer(old.fbo);
    }
    this.bloomChain = [];
    // The pyramid starts at half the dye grid and halves until it is tiny;
    // the coarse levels are what give the glow its reach.
    let bw = dye.width >> 1;
    let bh = dye.height >> 1;
    for (let i = 0; i < 7 && bw >= 2 && bh >= 2; i++) {
      this.bloomChain.push(this.createFBO(bw, bh, gl.RGBA16F, gl.RGBA, HF, gl.LINEAR));
      bw >>= 1;
      bh >>= 1;
    }
    this.bloomResult = this.bloomChain[0];
  }

  private resizeDoubleFBO(
    target: DoubleFBO | undefined,
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    filter: number,
  ): DoubleFBO {
    if (!target) return this.createDoubleFBO(w, h, internalFormat, format, type, filter);
    if (target.width === w && target.height === h) return target;
    const next = this.createDoubleFBO(w, h, internalFormat, format, type, filter);
    // Carry the old field across the resize.
    const gl = this.gl;
    gl.useProgram(this.copyProgram.program);
    gl.uniform1i(this.copyProgram.uniforms.uTexture, target.read.attach(0));
    this.blit(next.read);
    return next;
  }

  /** True once the GL context has been lost; the engine is then inert. */
  get isLost(): boolean {
    return this.gl.isContextLost();
  }

  /**
   * Re-resolution the solver. Used by the adaptive quality controller when
   * the frame budget is being missed. Dye is carried across the change.
   */
  setResolution(simResolution: number, dyeResolution: number) {
    if (
      this.params.simResolution === simResolution &&
      this.params.dyeResolution === dyeResolution
    ) {
      return;
    }
    this.params.simResolution = simResolution;
    this.params.dyeResolution = dyeResolution;
    this.initFramebuffers();
  }

  /** Recreate framebuffers if the canvas backing store changed size. */
  resize(): boolean {
    const canvas = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (w === 0 || h === 0) return false;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this.initFramebuffers();
      return true;
    }
    return false;
  }

  private blit(target: FBO | null) {
    const gl = this.gl;
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.bindVertexArray(this.quadVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  /**
   * Inject momentum and dye at a point.
   * x, y in [0,1] (y up), dx/dy in UV-delta units, color as linear RGB.
   */
  splat(x: number, y: number, dx: number, dy: number, color: [number, number, number]) {
    const gl = this.gl;
    const aspect = this.canvas.width / this.canvas.height;
    let radius = this.params.splatRadius / 100;
    if (aspect > 1) radius *= aspect;

    gl.useProgram(this.splatProgram.program);
    gl.uniform1i(this.splatProgram.uniforms.uTarget, this.velocity.read.attach(0));
    gl.uniform1f(this.splatProgram.uniforms.aspectRatio, aspect);
    gl.uniform2f(this.splatProgram.uniforms.point, x, y);
    gl.uniform3f(this.splatProgram.uniforms.color, dx * this.params.splatForce, dy * this.params.splatForce, 0);
    gl.uniform1f(this.splatProgram.uniforms.radius, radius);
    this.blit(this.velocity.write);
    this.velocity.swap();

    gl.uniform1i(this.splatProgram.uniforms.uTarget, this.dye.read.attach(0));
    gl.uniform3f(this.splatProgram.uniforms.color, color[0], color[1], color[2]);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  /** Inject heat (positive) or cold (negative) at a point. */
  splatHeat(x: number, y: number, amount: number, radiusScale = 1) {
    const gl = this.gl;
    const aspect = this.canvas.width / this.canvas.height;
    let radius = (this.params.splatRadius / 100) * radiusScale;
    if (aspect > 1) radius *= aspect;

    gl.useProgram(this.splatProgram.program);
    gl.uniform1i(this.splatProgram.uniforms.uTarget, this.temperature.read.attach(0));
    gl.uniform1f(this.splatProgram.uniforms.aspectRatio, aspect);
    gl.uniform2f(this.splatProgram.uniforms.point, x, y);
    gl.uniform3f(this.splatProgram.uniforms.color, amount, 0, 0);
    gl.uniform1f(this.splatProgram.uniforms.radius, radius);
    this.blit(this.temperature.write);
    this.temperature.swap();
  }

  /**
   * Read the solver fields at one point (UV coords, y up). This is a real
   * GPU readback of the simulation textures — the numbers shown in the
   * probe tag are the numbers the solver is integrating.
   */
  readProbe(x: number, y: number): { u: number; v: number; p: number; curl: number; T: number } {
    const gl = this.gl;
    const px = new Float32Array(4);
    const read = (fbo: FBO) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
      gl.readPixels(
        Math.min(fbo.width - 1, Math.max(0, Math.floor(x * fbo.width))),
        Math.min(fbo.height - 1, Math.max(0, Math.floor(y * fbo.height))),
        1,
        1,
        gl.RGBA,
        gl.FLOAT,
        px,
      );
      return px;
    };
    const out = { u: 0, v: 0, p: 0, curl: 0, T: 0 };
    try {
      const v = read(this.velocity.read);
      out.u = v[0];
      out.v = v[1];
      out.p = read(this.pressureFBO.read)[0];
      out.curl = read(this.curlFBO)[0];
      out.T = read(this.temperature.read)[0];
    } catch {
      // Readback is best-effort; a failed read leaves zeros.
    }
    return out;
  }

  /** Wipe dye, velocity, and temperature to zero. */
  clear() {
    const gl = this.gl;
    gl.useProgram(this.clearProgram.program);
    gl.uniform1f(this.clearProgram.uniforms.value, 0);
    for (const field of [this.dye, this.velocity, this.pressureFBO, this.temperature]) {
      gl.uniform1i(this.clearProgram.uniforms.uTexture, field.read.attach(0));
      this.blit(field.write);
      field.swap();
    }
  }

  private setObstacleUniforms(program: Program) {
    const gl = this.gl;
    const o = this.obstacle;
    // The horizontal boundaries are open exactly when a tunnel is running.
    gl.uniform1f(program.uniforms.uOpenX, this.wind.speed !== 0 ? 1 : 0);
    gl.uniform4f(program.uniforms.uObstacle, o.x, o.y, o.radius, o.thickness ?? 0);
    const shapeId = o.shape === "plate" ? 1 : o.shape === "airfoil" ? 2 : 0;
    gl.uniform1i(program.uniforms.uObstacleShape, shapeId);
    gl.uniform1f(program.uniforms.uObstacleAngle, o.angle ?? 0);
    gl.uniform1f(program.uniforms.uObstacleHover, this.obstacleHover);
    gl.uniform1f(program.uniforms.uAspect, this.canvas.width / this.canvas.height);
  }

  step(dt: number) {
    if (this.paused) return;
    const gl = this.gl;
    const p = this.params;
    gl.disable(gl.BLEND);

    // Nose-up positive: rotating a left-tip-at-(-h,0) plate CCW drops the
    // nose in y-up UV space, so the UI's angle of attack is the negation.
    this.obstacle.angle = (-p.attackAngleDeg * Math.PI) / 180;

    // 0. Wind tunnel forcing, when a scenario enables it.
    if (this.wind.speed !== 0) {
      gl.useProgram(this.windProgram.program);
      gl.uniform2f(this.windProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
      gl.uniform1i(this.windProgram.uniforms.uVelocity, this.velocity.read.attach(0));
      gl.uniform1f(this.windProgram.uniforms.uSpeed, this.wind.speed);
      gl.uniform1f(this.windProgram.uniforms.uPull, this.wind.pull);
      gl.uniform1f(this.windProgram.uniforms.dt, dt);
      this.setObstacleUniforms(this.windProgram);
      this.blit(this.velocity.write);
      this.velocity.swap();
    }

    // 0b. Buoyancy — temperature exerts a vertical force (Boussinesq).
    if (p.buoyancy !== 0) {
      gl.useProgram(this.buoyancyProgram.program);
      gl.uniform2f(this.buoyancyProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
      gl.uniform1i(this.buoyancyProgram.uniforms.uVelocity, this.velocity.read.attach(0));
      gl.uniform1i(this.buoyancyProgram.uniforms.uTemperature, this.temperature.read.attach(1));
      gl.uniform1f(this.buoyancyProgram.uniforms.uBuoyancy, p.buoyancy);
      gl.uniform1f(this.buoyancyProgram.uniforms.dt, dt);
      this.blit(this.velocity.write);
      this.velocity.swap();
    }

    // 1. Vorticity confinement — measure curl, then reinforce it.
    gl.useProgram(this.curlProgram.program);
    gl.uniform2f(this.curlProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.curlProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    this.blit(this.curlFBO);

    gl.useProgram(this.vorticityProgram.program);
    gl.uniform2f(this.vorticityProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.vorticityProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(this.vorticityProgram.uniforms.uCurl, this.curlFBO.attach(1));
    gl.uniform1f(this.vorticityProgram.uniforms.curl, p.curl);
    gl.uniform1f(this.vorticityProgram.uniforms.dt, dt);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // 2. Projection — solve ∇²p = ∇·u, then subtract ∇p.
    gl.useProgram(this.divergenceProgram.program);
    gl.uniform2f(this.divergenceProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.divergenceProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    this.setObstacleUniforms(this.divergenceProgram);
    this.blit(this.divergence);

    gl.useProgram(this.clearProgram.program);
    gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressureFBO.read.attach(0));
    gl.uniform1f(this.clearProgram.uniforms.value, p.pressure);
    this.blit(this.pressureFBO.write);
    this.pressureFBO.swap();

    gl.useProgram(this.pressureProgram.program);
    gl.uniform2f(this.pressureProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.pressureProgram.uniforms.uDivergence, this.divergence.attach(0));
    this.setObstacleUniforms(this.pressureProgram);
    for (let i = 0; i < p.pressureIterations; i++) {
      gl.uniform1i(this.pressureProgram.uniforms.uPressure, this.pressureFBO.read.attach(1));
      this.blit(this.pressureFBO.write);
      this.pressureFBO.swap();
    }

    gl.useProgram(this.gradientProgram.program);
    gl.uniform2f(this.gradientProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.gradientProgram.uniforms.uPressure, this.pressureFBO.read.attach(0));
    gl.uniform1i(this.gradientProgram.uniforms.uVelocity, this.velocity.read.attach(1));
    this.setObstacleUniforms(this.gradientProgram);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // 3. Advection — velocity carries itself, then carries the dye.
    gl.useProgram(this.advectionProgram.program);
    gl.uniform2f(this.advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(this.advectionProgram.uniforms.uSource, this.velocity.read.attach(0));
    gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
    gl.uniform1f(this.advectionProgram.uniforms.dissipation, p.velocityDissipation);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // Temperature always rides the flow, cooling as it goes — it is a
    // passive scalar here and only becomes active when buoyancy is on.
    // (Skipping this when β=0 froze the HEAT view in non-thermal scenarios.)
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(this.advectionProgram.uniforms.uSource, this.temperature.read.attach(1));
    gl.uniform1f(this.advectionProgram.uniforms.dissipation, p.temperatureDissipation);
    this.blit(this.temperature.write);
    this.temperature.swap();

    gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(this.advectionProgram.uniforms.uSource, this.dye.read.attach(1));
    gl.uniform1f(this.advectionProgram.uniforms.dissipation, p.densityDissipation);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  /**
   * Build the glow: pull the bright end out of the dye, walk it down a
   * half-resolution pyramid, then add the levels back up. The coarse levels
   * are what give the light its reach; the fine ones keep it attached to
   * the shape that emitted it.
   */
  private renderBloom(source: FBO) {
    const gl = this.gl;
    const chain = this.bloomChain;
    if (chain.length < 2) return;

    const threshold = 0.72;
    const softKnee = 0.7;
    const knee = threshold * softKnee + 0.0001;

    gl.disable(gl.BLEND);
    gl.useProgram(this.bloomPrefilterProgram.program);
    gl.uniform3f(
      this.bloomPrefilterProgram.uniforms.curve,
      threshold - knee,
      knee * 2,
      0.25 / knee,
    );
    gl.uniform1f(this.bloomPrefilterProgram.uniforms.threshold, threshold);
    gl.uniform1i(this.bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
    this.blit(chain[0]);

    gl.useProgram(this.bloomBlurProgram.program);
    for (let i = 1; i < chain.length; i++) {
      const from = chain[i - 1];
      gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize, from.texelSizeX, from.texelSizeY);
      gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, from.attach(0));
      this.blit(chain[i]);
    }

    // Additive on the way back up, so each level layers onto the finer one.
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);
    for (let i = chain.length - 2; i >= 0; i--) {
      const from = chain[i + 1];
      gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize, from.texelSizeX, from.texelSizeY);
      gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, from.attach(0));
      this.blit(chain[i]);
    }
    gl.disable(gl.BLEND);
    this.bloomResult = chain[0];
  }

  render() {
    const gl = this.gl;
    const modeIndex = { dye: 0, velocity: 1, pressure: 2, curl: 3, heat: 4 }[this.viewMode];

    // Only the dye view is a photograph; the X-rays are diagnostics and must
    // not be smeared by a glow.
    const wantBloom = this.viewMode === "dye" && this.params.bloom > 0;
    if (wantBloom) this.renderBloom(this.dye.read);
    gl.useProgram(this.displayProgram.program);
    // The display shader's neighbour taps are in sim-grid units.
    gl.uniform2f(
      this.displayProgram.uniforms.texelSize,
      this.velocity.texelSizeX,
      this.velocity.texelSizeY,
    );
    gl.uniform1i(this.displayProgram.uniforms.uTexture, this.dye.read.attach(0));
    gl.uniform1i(this.displayProgram.uniforms.uVelocity, this.velocity.read.attach(1));
    gl.uniform1i(this.displayProgram.uniforms.uPressure, this.pressureFBO.read.attach(2));
    gl.uniform1i(this.displayProgram.uniforms.uCurl, this.curlFBO.attach(3));
    gl.uniform1i(this.displayProgram.uniforms.uTemperature, this.temperature.read.attach(4));
    gl.uniform1i(this.displayProgram.uniforms.uBloom, (wantBloom ? this.bloomResult : this.dye.read).attach(5));
    gl.uniform1f(this.displayProgram.uniforms.uBloomIntensity, wantBloom ? this.params.bloom : 0);
    gl.uniform1f(this.displayProgram.uniforms.uExposure, this.params.exposure);
    gl.uniform1i(this.displayProgram.uniforms.uMode, modeIndex);
    this.setObstacleUniforms(this.displayProgram);
    this.blit(null);
  }

  // NOTE: never loseContext() here — React StrictMode remounts reuse the
  // same canvas, and a lost context reports every capability as missing.
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const p of [
      this.copyProgram, this.clearProgram, this.splatProgram, this.advectionProgram,
      this.divergenceProgram, this.curlProgram, this.vorticityProgram,
      this.pressureProgram, this.gradientProgram, this.displayProgram, this.windProgram,
      this.buoyancyProgram, this.bloomPrefilterProgram, this.bloomBlurProgram,
    ]) {
      gl.deleteProgram(p.program);
    }
    for (const f of [this.dye.read, this.dye.write, this.velocity.read, this.velocity.write,
      this.pressureFBO.read, this.pressureFBO.write, this.divergence, this.curlFBO,
      this.temperature.read, this.temperature.write, ...this.bloomChain]) {
      gl.deleteTexture(f.texture);
      gl.deleteFramebuffer(f.fbo);
    }
  }
}
