// WGSL shaders. All positions are in CSS pixels; vertex shaders map them to clip space.

const common = /* wgsl */ `
struct Globals {
  viewport: vec2f,   // canvas size in CSS px
  time: f32,         // seconds
  progress: f32,     // transition progress 0..1
  rect: vec4f,       // image rect in CSS px: x, y, w, h
  grid: vec2f,       // transition tiles: cols, rows
  dt: f32,           // frame delta, seconds
  _pad: f32,
};

const PI = 3.14159265;

fn toClip(p: vec2f) -> vec4f {
  return vec4f(p.x / g.viewport.x * 2.0 - 1.0, 1.0 - p.y / g.viewport.y * 2.0, 0.0, 1.0);
}

fn quadCorner(vi: u32) -> vec2f {
  var c = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
  return c[vi];
}

fn rot(a: f32) -> mat2x2f {
  let c = cos(a);
  let s = sin(a);
  return mat2x2f(c, s, -s, c);
}

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

fn rainbow(h: f32) -> vec3f {
  return 0.5 + 0.5 * cos(2.0 * PI * (h + vec3f(0.0, 0.33, 0.67)));
}
`;

export const renderWGSL = /* wgsl */ `
${common}

struct Particle {
  pos: vec2f,
  vel: vec2f,
  color: vec4f,
  life: f32,
  maxLife: f32,
  size: f32,
  kind: f32,
  spin: f32,
  drag: f32,
  gravity: f32,
  seed: f32,
};

@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var texA: texture_2d<f32>;
@group(0) @binding(3) var texB: texture_2d<f32>;
@group(0) @binding(4) var<storage, read> particles: array<Particle>;

// ---------- Background: soft night-sky radial gradient ----------

struct BgOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs_bg(@builtin(vertex_index) vi: u32) -> BgOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: BgOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  o.uv = vec2f(p[vi].x * 0.5 + 0.5, 0.5 - p[vi].y * 0.5);
  return o;
}

@fragment fn fs_bg(i: BgOut) -> @location(0) vec4f {
  let aspect = g.viewport.x / g.viewport.y;
  let d = length((i.uv - vec2f(0.5, 0.45)) * vec2f(aspect, 1.0));
  let inner = vec3f(0.10, 0.13, 0.22);
  let outer = vec3f(0.015, 0.02, 0.04);
  var c = mix(inner, outer, smoothstep(0.0, 1.1, d));
  // tiny dither to hide banding
  c += (hash21(i.pos.xy + fract(g.time)) - 0.5) / 255.0;
  return vec4f(c, 1.0);
}

// ---------- Image + tile transition ----------

struct ImgOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) local: vec2f,
  @location(2) params: vec4f, // mixT, disorder, seed, flash
};

@vertex fn vs_image(@builtin(vertex_index) vi: u32) -> ImgOut {
  let c = quadCorner(vi);
  var o: ImgOut;
  o.pos = toClip(g.rect.xy + c * g.rect.zw);
  o.uv = c;
  o.local = c * 2.0 - 1.0;
  o.params = vec4f(0.0);
  return o;
}

@vertex fn vs_tile(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> ImgOut {
  let cols = u32(g.grid.x);
  let cell = vec2f(f32(ii % cols), f32(ii / cols));
  let corner = quadCorner(vi);
  let seed = hash21(cell + 0.5);
  let seed2 = hash21(cell * 1.7 + 11.3);
  let t = g.progress;

  let tileUV = 1.0 / g.grid;
  let uv0 = cell * tileUV;
  let center = uv0 + tileUV * 0.5;
  let tilePx = g.rect.zw * tileUV;

  // How "scrambled" the tiles are: rises quickly, holds, settles slowly.
  let dis = smoothstep(0.0, 0.22, t) * (1.0 - smoothstep(0.62, 1.0, t));

  // Each tile swaps to the next picture at its own moment, sweeping across the bird.
  let sweep = dot(center, vec2f(0.55, 0.45));
  let start = 0.30 + 0.28 * sweep + 0.12 * seed;
  let mixT = smoothstep(start, start + 0.14, t);
  let flash = 1.0 - abs(mixT * 2.0 - 1.0);

  // Shrink into little orbs, then grow back.
  let scale = mix(1.0, 0.32 + 0.3 * seed2, dis);

  // Spin whole turns so every tile lands upright again.
  let turns = select(-1.0, 1.0, seed > 0.5) * (1.0 + floor(seed2 * 2.0));
  let e = t * t * (3.0 - 2.0 * t);
  let angle = turns * 2.0 * PI * e;

  // Jiggle, plus a gentle breathing bulge away from the middle.
  let jig = vec2f(
    sin(g.time * 9.0 + seed * 40.0) + 0.5 * sin(g.time * 23.0 + seed2 * 13.0),
    cos(g.time * 11.0 + seed2 * 40.0) + 0.5 * cos(g.time * 19.0 + seed * 17.0)
  ) * tilePx * 0.45 * dis;
  let bulge = (center - 0.5) * g.rect.zw * 0.06 * dis * (1.0 + 0.3 * sin(g.time * 3.0 + seed * 6.0));

  let local = corner * 2.0 - 1.0;
  let offset = rot(angle) * (local * 0.5 * tilePx * scale);
  let p = g.rect.xy + center * g.rect.zw + jig + bulge + offset;

  var o: ImgOut;
  o.pos = toClip(p);
  o.uv = uv0 + corner * tileUV;
  o.local = local;
  o.params = vec4f(mixT, dis, seed, flash);
  return o;
}

@fragment fn fs_image(i: ImgOut) -> @location(0) vec4f {
  let a = textureSample(texA, samp, i.uv);
  let b = textureSample(texB, samp, i.uv);
  let mixT = i.params.x;
  let dis = i.params.y;
  let seed = i.params.z;
  let flash = i.params.w;
  var c = mix(a, b, mixT);

  // Square -> orb: round the corners as the disorder grows.
  let r = clamp(dis * 1.4, 0.0, 1.0);
  let q = abs(i.local) - vec2f(1.0 - r);
  let d = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
  let aa = max(fwidth(d), 0.0001);
  let mask = select(1.0, 1.0 - smoothstep(-aa, aa, d), dis > 0.001);

  // Glassy orb highlight and rainbow shimmer.
  let hl = pow(max(0.0, 1.0 - length(i.local - vec2f(-0.35, -0.4)) * 1.2), 3.0) * dis * 0.55;
  let sparkle = pow(0.5 + 0.5 * sin(g.time * 7.0 + seed * 60.0), 14.0) * dis;
  let shimmer = rainbow(seed + g.time * 0.35) * sparkle * 0.9;
  c = vec4f(c.rgb + (vec3f(hl) + shimmer + vec3f(0.55, 0.75, 1.0) * flash * 0.45) * c.a, c.a);

  return c * mask;
}

// ---------- Celebration particles ----------

struct PartOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec4f,
  @location(2) kind: f32,
};

@vertex fn vs_particle(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PartOut {
  let p = particles[ii];
  var o: PartOut;
  if (p.life <= 0.0) {
    o.pos = vec4f(-9.0, -9.0, 0.0, 1.0);
    o.local = vec2f(0.0);
    o.color = vec4f(0.0);
    o.kind = 0.0;
    return o;
  }
  let k = p.life / p.maxLife;   // 1 -> 0
  let age = p.maxLife - p.life;
  let corner = quadCorner(vi) * 2.0 - 1.0;
  var shape = corner;
  var size = p.size;
  var angle = 0.0;
  var fade = k;
  let kind = u32(p.kind + 0.5);

  if (kind == 1u) {          // twinkly star
    angle = age * p.spin;
    fade = sin(k * PI) * (0.75 + 0.25 * sin(age * 30.0 + p.seed * 50.0));
  } else if (kind == 2u) {   // expanding ring
    size = p.size * (0.1 + 0.9 * (1.0 - k * k * k));
    fade = k * k;
  } else if (kind == 3u) {   // confetti: tumbling paper
    shape = vec2f(corner.x * cos(age * p.spin * 1.7 + p.seed * 6.0), corner.y * 0.55);
    angle = age * p.spin + p.seed * 6.28;
    fade = smoothstep(0.0, 0.2, k);
  }

  o.pos = toClip(p.pos + rot(angle) * (shape * size));
  o.local = corner;
  o.color = vec4f(p.color.rgb, p.color.a * fade);
  o.kind = f32(kind);
  return o;
}

@fragment fn fs_particle(i: PartOut) -> @location(0) vec4f {
  let l = i.local;
  let d = length(l);
  let kind = u32(i.kind + 0.5);
  var a = 0.0;
  if (kind == 0u) {
    a = exp(-d * d * 5.0) + 0.6 * exp(-d * d * 30.0);
  } else if (kind == 1u) {
    let rays = max(0.0, 1.0 - abs(l.x) * 9.0) * max(0.0, 1.0 - abs(l.y))
             + max(0.0, 1.0 - abs(l.y) * 9.0) * max(0.0, 1.0 - abs(l.x));
    a = rays + exp(-d * d * 16.0);
  } else if (kind == 2u) {
    let w = (d - 0.88) / 0.07;
    a = exp(-w * w);
  } else {
    // Confetti is solid paper: normal "over" blending.
    let al = i.color.a;
    return vec4f(i.color.rgb * al, al);
  }
  a = clamp(a, 0.0, 1.5) * i.color.a;
  // Glowing kinds: alpha 0 makes premultiplied "over" blending additive.
  return vec4f(i.color.rgb * a, 0.0);
}
`;

export const computeWGSL = /* wgsl */ `
${common}

struct Particle {
  pos: vec2f,
  vel: vec2f,
  color: vec4f,
  life: f32,
  maxLife: f32,
  size: f32,
  kind: f32,
  spin: f32,
  drag: f32,
  gravity: f32,
  seed: f32,
};

@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

@compute @workgroup_size(64)
fn cs_particles(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&particles)) { return; }
  var p = particles[i];
  if (p.life <= 0.0) { return; }
  let dt = g.dt;
  p.vel *= exp(-p.drag * dt);
  p.vel.y += p.gravity * dt;
  if (u32(p.kind + 0.5) == 3u) {
    // confetti flutters side to side as it falls
    p.vel.x += sin(g.time * 3.0 + p.seed * 20.0) * 60.0 * dt;
  }
  p.pos += p.vel * dt;
  p.life -= dt;
  particles[i] = p;
}
`;
