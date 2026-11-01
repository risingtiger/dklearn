import { renderWGSL, computeWGSL } from './shaders.js';

const MAX_PARTICLES = 8192;
const PARTICLE_FLOATS = 16;
const GLOBALS_BYTES = 48;

const PALETTE = [
  [1.0, 0.82, 0.25], // gold
  [0.35, 0.75, 1.0], // sky blue
  [1.0, 0.45, 0.7],  // pink
  [0.5, 1.0, 0.55],  // green
  [1.0, 1.0, 1.0],   // white
  [0.75, 0.5, 1.0],  // purple
];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/**
 * Draws the background, the bird picture (or the tile transition between two pictures)
 * and the celebration particles, all with WebGPU.
 */
export class Renderer {
  static async create(canvas) {
    if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter found.');
    const device = await adapter.requestDevice();
    return new Renderer(canvas, device);
  }

  constructor(canvas, device) {
    this.canvas = canvas;
    this.device = device;
    this.context = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format: this.format, alphaMode: 'opaque' });

    this.rect = { x: 0, y: 0, w: 1, h: 1 };
    this.current = null;
    this.transitionState = null;
    this.particleCursor = 0;
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.bindGroups = new Map();

    this.#createResources();
    this.#resize();
    new ResizeObserver(() => this.#resize()).observe(canvas);
    requestAnimationFrame((t) => this.#frame(t));
  }

  #createResources() {
    const { device, format } = this;

    this.globals = device.createBuffer({
      size: GLOBALS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.globalsData = new Float32Array(GLOBALS_BYTES / 4);

    this.particles = device.createBuffer({
      size: MAX_PARTICLES * PARTICLE_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    // Placeholder so the pipeline can run before any image has loaded.
    this.blank = device.createTexture({
      label: 'blank',
      size: [1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT, C = GPUShaderStage.COMPUTE;
    this.renderLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: V | F, buffer: { type: 'uniform' } },
        { binding: 1, visibility: F, sampler: {} },
        { binding: 2, visibility: F, texture: {} },
        { binding: 3, visibility: F, texture: {} },
        { binding: 4, visibility: V, buffer: { type: 'read-only-storage' } },
      ],
    });
    const computeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: C, buffer: { type: 'uniform' } },
        { binding: 1, visibility: C, buffer: { type: 'storage' } },
      ],
    });

    const renderModule = device.createShaderModule({ code: renderWGSL });
    const computeModule = device.createShaderModule({ code: computeWGSL });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.renderLayout] });

    // Everything is premultiplied alpha.
    const over = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    };
    const pipeline = (vs, fs, blend) =>
      device.createRenderPipeline({
        layout,
        vertex: { module: renderModule, entryPoint: vs },
        fragment: { module: renderModule, entryPoint: fs, targets: [{ format, blend }] },
        primitive: { topology: 'triangle-list' },
      });

    this.bgPipeline = pipeline('vs_bg', 'fs_bg', undefined);
    this.imagePipeline = pipeline('vs_image', 'fs_image', over);
    this.tilePipeline = pipeline('vs_tile', 'fs_image', over);
    this.particlePipeline = pipeline('vs_particle', 'fs_particle', over);

    this.computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [computeLayout] }),
      compute: { module: computeModule, entryPoint: 'cs_particles' },
    });
    this.computeBindGroup = device.createBindGroup({
      layout: computeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.globals } },
        { binding: 1, resource: { buffer: this.particles } },
      ],
    });
  }

  #bindGroup(a, b) {
    const key = `${a.label}|${b.label}`;
    let bg = this.bindGroups.get(key);
    if (!bg) {
      bg = this.device.createBindGroup({
        layout: this.renderLayout,
        entries: [
          { binding: 0, resource: { buffer: this.globals } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: a.createView() },
          { binding: 3, resource: b.createView() },
          { binding: 4, resource: { buffer: this.particles } },
        ],
      });
      this.bindGroups.set(key, bg);
    }
    return bg;
  }

  #resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  async loadTexture(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
    const texture = this.device.createTexture({
      label: url,
      size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture, premultipliedAlpha: true },
      [bitmap.width, bitmap.height],
    );
    bitmap.close();
    return texture;
  }

  /** Image rectangle in CSS pixels. */
  setRect(rect) {
    this.rect = rect;
  }

  show(texture) {
    this.current = texture;
  }

  /** Scramble `from` into little orbs and settle them back as `to` (`from` may be `this.blank`). */
  transition(from, to, seconds, rows) {
    const cols = Math.round(rows * (to.width / to.height));
    return new Promise((resolve) => {
      this.transitionState = { from, to, start: performance.now(), duration: seconds * 1000, cols, rows, resolve };
    });
  }

  // ---------- Particles ----------

  #spawn(list) {
    const data = new Float32Array(list.length * PARTICLE_FLOATS);
    list.forEach((p, i) => {
      const c = p.color || pick(PALETTE);
      data.set([
        p.x, p.y, p.vx || 0, p.vy || 0,
        c[0], c[1], c[2], p.alpha ?? 1,
        p.life, p.life, p.size, p.kind || 0,
        p.spin || 0, p.drag ?? 2, p.gravity ?? 0, Math.random(),
      ], i * PARTICLE_FLOATS);
    });
    // Ring buffer: write in up to two pieces when wrapping around.
    let offset = 0;
    while (offset < list.length) {
      const n = Math.min(list.length - offset, MAX_PARTICLES - this.particleCursor);
      this.device.queue.writeBuffer(
        this.particles,
        this.particleCursor * PARTICLE_FLOATS * 4,
        data, offset * PARTICLE_FLOATS, n * PARTICLE_FLOATS,
      );
      offset += n;
      this.particleCursor = (this.particleCursor + n) % MAX_PARTICLES;
    }
  }

  get #unit() {
    return Math.max(0.6, this.rect.w / 1200);
  }

  /** Sparkly burst for a correctly placed word. */
  burst(x, y, { count = 90, power = 1 } = {}) {
    const u = this.#unit;
    const list = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(80, 520) * power * u;
      list.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.7, 1.6), size: rand(5, 13) * u,
        kind: Math.random() < 0.35 ? 1 : 0, spin: rand(-3, 3),
        drag: 2.2, gravity: 260 * u,
      });
      if (list.at(-1).kind === 1) list.at(-1).size *= 2.2;
    }
    list.push({ x, y, life: 0.9, size: 150 * u * power, kind: 2, color: [1, 0.9, 0.5] });
    list.push({ x, y, life: 1.2, size: 230 * u * power, kind: 2, color: [0.5, 0.8, 1], alpha: 0.7 });
    list.push({ x, y, life: 0.6, size: 60 * u, kind: 0, color: [1, 1, 0.9], alpha: 1.4, drag: 0 });
    this.#spawn(list);
  }

  /** A few twinkles around a point (used under placed words). */
  twinkle(x, y, radius = 40) {
    const u = this.#unit;
    const list = [];
    for (let i = 0; i < 14; i++) {
      list.push({
        x: x + rand(-radius, radius) * u, y: y + rand(-radius, radius) * 0.6 * u,
        vy: rand(-40, -10) * u, life: rand(0.6, 1.2), size: rand(10, 20) * u,
        kind: 1, spin: rand(-2, 2), color: pick([[1, 0.9, 0.4], [1, 1, 1], [0.6, 0.85, 1]]),
      });
    }
    this.#spawn(list);
  }

  firework(x, y) {
    const u = this.#unit;
    const color = pick(PALETTE);
    const list = [];
    const n = 140;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
      const s = rand(260, 420) * u;
      list.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(1.2, 2.0), size: rand(6, 10) * u, kind: 0,
        color: Math.random() < 0.2 ? [1, 1, 1] : color, drag: 1.6, gravity: 140 * u,
      });
    }
    list.push({ x, y, life: 1.0, size: 260 * u, kind: 2, color, alpha: 0.8 });
    this.#spawn(list);
  }

  confetti(count = 500) {
    const u = this.#unit;
    const W = this.canvas.clientWidth;
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push({
        x: rand(0, W), y: rand(-300, -10),
        vx: rand(-60, 60), vy: rand(120, 260),
        life: rand(3, 4.5), size: rand(7, 12) * u, kind: 3,
        spin: rand(-6, 6), drag: 0.6, gravity: 90,
      });
    }
    this.#spawn(list);
  }

  /** Big celebration for finishing a whole layer. */
  grandCelebration() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.confetti();
    for (let i = 0; i < 9; i++) {
      setTimeout(() => this.firework(rand(0.15, 0.85) * W, rand(0.12, 0.55) * H), i * 280 + rand(0, 150));
    }
  }

  // ---------- Frame loop ----------

  #frame(now) {
    requestAnimationFrame((t) => this.#frame(t));
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    let progress = 0;
    const tr = this.transitionState;
    if (tr) {
      progress = Math.min(1, (now - tr.start) / tr.duration);
      if (progress >= 1) {
        this.current = tr.to;
        this.transitionState = null;
        tr.resolve();
      }
    }

    const g = this.globalsData;
    g[0] = this.canvas.clientWidth;
    g[1] = this.canvas.clientHeight;
    g[2] = (now - this.startTime) / 1000;
    g[3] = progress;
    g[4] = this.rect.x; g[5] = this.rect.y; g[6] = this.rect.w; g[7] = this.rect.h;
    g[8] = tr ? tr.cols : 1;
    g[9] = tr ? tr.rows : 1;
    g[10] = dt;
    this.device.queue.writeBuffer(this.globals, 0, g);

    const encoder = this.device.createCommandEncoder();

    const cpass = encoder.beginComputePass();
    cpass.setPipeline(this.computePipeline);
    cpass.setBindGroup(0, this.computeBindGroup);
    cpass.dispatchWorkgroups(Math.ceil(MAX_PARTICLES / 64));
    cpass.end();

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    const a = tr && this.transitionState ? tr.from : this.current || this.blank;
    const b = tr && this.transitionState ? tr.to : a;
    pass.setBindGroup(0, this.#bindGroup(a, b));

    pass.setPipeline(this.bgPipeline);
    pass.draw(3);

    if (this.transitionState) {
      pass.setPipeline(this.tilePipeline);
      pass.draw(6, tr.cols * tr.rows);
    } else if (this.current) {
      pass.setPipeline(this.imagePipeline);
      pass.draw(6);
    }

    pass.setPipeline(this.particlePipeline);
    pass.draw(6, MAX_PARTICLES);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }
}
