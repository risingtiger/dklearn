import { html, svg, render, nothing } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { Renderer } from './renderer.js';
import { sounds, unlockAudio, useSounds } from './audio.js';

const DRIFT_MS = 1000;      // word floats to its label spot
const LINE_MS = 700;        // connecting line draws itself
const CLEAR_MS = 1700;      // words blur away, lines undraw
const CELEBRATE_MS = 3200;  // fireworks before clearing the layer

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const state = {
  index: null,       // animals/animals.json
  animals: [],       // { id, name, thumb } for the start screen
  animal: null,      // { id, name, dir } of the animal being played
  settings: {},      // shared settings merged with the animal's own
  session: 0,        // bumps when leaving an animal, so its pending animations stop
  layers: [],        // the animal's layers plus their loaded `texture`
  layerIndex: 0,
  words: [],
  phase: 'loading',  // loading | picker | play | celebrate | clearing | transition | finished | error
  rect: { x: 0, y: 0, w: 1, h: 1 },
  drag: null,
  error: '',
  debugPoint: null,
};

let renderer;
const root = document.getElementById('app');

// ---------- Geometry ----------

const layer = () => state.layers[state.layerIndex];
const imgSize = () => {
  const t = layer()?.texture;
  return t ? { w: t.width, h: t.height } : { w: 3, h: 2 };
};

function layout() {
  const { w: iw, h: ih } = imgSize();
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw / iw, vh / ih);
  const w = iw * scale, h = ih * scale;
  state.rect = { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
  renderer?.setRect(state.rect);
}

const toScreen = ({ x, y }) => {
  const { w, h } = imgSize();
  const r = state.rect;
  return { x: r.x + (x / w) * r.w, y: r.y + (y / h) * r.h };
};

const toImage = (sx, sy) => {
  const { w, h } = imgSize();
  const r = state.rect;
  return { x: ((sx - r.x) / r.w) * w, y: ((sy - r.y) / r.h) * h };
};

const insideImage = (sx, sy) => {
  const r = state.rect;
  return sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
};

function hitZone(zone, p, pad) {
  const rx = (zone.rx ?? zone.r) * pad;
  const ry = (zone.ry ?? zone.r) * pad;
  const a = -((zone.angle || 0) * Math.PI) / 180;
  const dx = p.x - zone.x, dy = p.y - zone.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return (lx / rx) ** 2 + (ly / ry) ** 2 <= 1;
}

const linePoints = (def) => def.points ?? def.zones.map(({ x, y }) => ({ x, y }));

// ---------- Layers ----------

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setLayer(index) {
  state.layerIndex = index;
  const defs = layer().words;
  const ordered = state.settings.shuffleWords ? shuffle(defs) : defs;
  const half = Math.ceil(ordered.length / 2);
  state.words = ordered.map((def, i) => ({
    id: `${index}-${def.word}`,
    text: def.word,
    def,
    side: i < half ? 'left' : 'right',
    placed: false,
    from: null,       // where the word was dropped, relative to its label spot
    lineReady: false,
    returns: 0,       // bumps to replay the "fly back" animation
    returnFrom: null,
  }));
  layout();
  update();
}

// ---------- Dragging ----------

function startDrag(e, word) {
  if (state.phase !== 'play' || state.drag || word.placed) return;
  unlockAudio();
  e.preventDefault();
  const box = e.currentTarget.getBoundingClientRect();
  state.drag = {
    word,
    pointerId: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    grabX: e.clientX - box.left,
    grabY: e.clientY - box.top,
    w: box.width,
    h: box.height,
  };
  sounds.pickup();
  update();
}

function moveDrag(e) {
  const d = state.drag;
  if (!d || e.pointerId !== d.pointerId) return;
  d.x = e.clientX;
  d.y = e.clientY;
  update();
}

function endDrag(e) {
  const d = state.drag;
  if (!d || e.pointerId !== d.pointerId) return;
  unlockAudio(); // iOS Safari counts touchend, not touchstart, as a gesture that may start audio
  state.drag = null;
  const { word } = d;
  const ghostCenter = { x: d.x - d.grabX + d.w / 2, y: d.y - d.grabY + d.h / 2 };

  const pad = state.settings.hitPadding ?? 1.15;
  const p = toImage(d.x, d.y);
  const correct = e.type === 'pointerup' && word.def.zones.some((z) => hitZone(z, p, pad));

  if (correct) {
    placeWord(word, ghostCenter);
  } else {
    // Fly back to its spot in the column (and wiggle if it was dropped on the wrong part).
    const slot = root.querySelector(`[data-word="${CSS.escape(word.id)}"]`)?.getBoundingClientRect();
    if (slot) {
      word.returnFrom = {
        x: ghostCenter.x - (slot.left + slot.width / 2),
        y: ghostCenter.y - (slot.top + slot.height / 2),
      };
    }
    word.wrong = insideImage(d.x, d.y);
    word.returns++;
    if (word.wrong) sounds.wrong();
  }
  update();
}

async function placeWord(word, dropCenter) {
  const session = state.session;
  const label = toScreen(word.def.label);
  word.placed = true;
  word.from = { x: dropCenter.x - label.x, y: dropCenter.y - label.y };

  sounds.correct();
  for (const pt of linePoints(word.def)) {
    const s = toScreen(pt);
    renderer.burst(s.x, s.y);
  }
  update();

  await wait(DRIFT_MS);
  if (session !== state.session) return;
  word.lineReady = true;
  update();
  const l = toScreen(word.def.label);
  renderer.twinkle(l.x, l.y, 60);

  await wait(LINE_MS);
  if (state.phase === 'play' && state.words.every((w) => w.lineReady)) completeLayer();
}

// ---------- Layer flow ----------

async function completeLayer() {
  const session = state.session;
  state.phase = 'celebrate';
  update();
  await wait(500);
  if (session !== state.session) return;
  sounds.celebrate();
  renderer.grandCelebration();
  await wait(CELEBRATE_MS);
  if (session !== state.session) return;

  const next = state.layerIndex + 1;
  if (next >= state.layers.length) {
    state.phase = 'finished';
    update();
    return;
  }
  await goToLayer(next);
}

async function goToLayer(index) {
  const session = state.session;
  state.phase = 'clearing';
  update();
  await wait(CLEAR_MS);
  if (session !== state.session) return;

  state.phase = 'transition';
  state.words = [];
  update();
  const s = state.settings;
  sounds.transition(s.transitionSeconds ?? 5);
  await renderer.transition(layer().texture, state.layers[index].texture, s.transitionSeconds ?? 5, s.transitionTileRows ?? 56);
  if (session !== state.session) return;

  setLayer(index);
  state.phase = 'play';
  update();
}

function playAgain() {
  unlockAudio();
  goToLayer(0);
}

// ---------- Animals ----------

const fetchJSON = async (url) => {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

const animalDir = (id) => `animals/${id}/`;
const layerImage = (dir, layer) => dir + (layer.image ?? `${layer.id}.png`);

const textures = new Map(); // url -> Promise<GPUTexture>
function texture(url) {
  if (!textures.has(url)) textures.set(url, renderer.loadTexture(url));
  return textures.get(url);
}

function setURL(animal) {
  const url = new URL(location.href);
  url.searchParams.delete('layer');
  if (animal) url.searchParams.set('animal', animal);
  else url.searchParams.delete('animal');
  history.replaceState(null, '', url);
}

async function openAnimal(id, startLayer = 0) {
  const session = ++state.session;
  state.phase = 'loading';
  state.words = [];
  renderer.show(null);
  update();

  const dir = animalDir(id);
  let def;
  try {
    def = await fetchJSON(`${dir}animal.json`);
  } catch (err) {
    return fail(`Could not load ${dir}animal.json (${err.message}).`);
  }
  state.animal = { id, name: def.name ?? id, dir };
  state.settings = { ...state.index.settings, ...def.settings };

  // Shared sounds, replaced event by event with the animal's own (paths relative to its folder).
  const soundMap = { ...state.index.sounds };
  for (const [event, urls] of Object.entries(def.sounds ?? {})) soundMap[event] = urls.map((u) => dir + u);

  // A layer whose picture is missing is skipped, so layers can be listed before their art exists.
  const [loaded] = await Promise.all([
    Promise.all(
      (def.layers ?? []).map(async (l) => {
        try {
          return { ...l, title: l.title ?? l.id, texture: await texture(layerImage(dir, l)) };
        } catch {
          console.warn(`Skipping layer "${l.id}": could not load ${layerImage(dir, l)}`);
          return null;
        }
      }),
    ),
    useSounds(soundMap),
  ]);
  if (session !== state.session) return;
  state.layers = loaded.filter(Boolean);
  if (!state.layers.length) return fail(`None of the pictures in ${dir} could be loaded.`);

  setURL(id);
  setLayer(Math.min(Math.max(startLayer, 0), state.layers.length - 1));

  // The animal assembles itself out of little orbs.
  state.phase = 'transition';
  update();
  const seconds = 3;
  sounds.transition(seconds);
  await renderer.transition(renderer.blank, layer().texture, seconds, state.settings.transitionTileRows ?? 56);
  if (session !== state.session) return;
  state.phase = 'play';
  update();
}

function showPicker() {
  state.session++;
  state.phase = 'picker';
  state.animal = null;
  state.layers = [];
  state.words = [];
  state.drag = null;
  renderer.show(null);
  setURL(null);
  layout();
  update();
}

function fail(message) {
  state.phase = 'error';
  state.error = message;
  update();
}

// ---------- Templates ----------

function chipTemplate(word, i) {
  const classes = ['chip'];
  if (word.placed) classes.push('gone');
  if (state.drag?.word === word) classes.push('lifted');
  if (word.returns && word.returnFrom) classes.push('returning');
  if (word.returns && word.wrong) classes.push('wrong');
  const style = word.returnFrom ? `--fx:${word.returnFrom.x}px;--fy:${word.returnFrom.y}px;` : '';
  return html`<div
    class=${classes.join(' ')}
    style=${`${style}--i:${i}`}
    data-word=${word.id}
    @pointerdown=${(e) => startDrag(e, word)}
  >${word.text}</div>`;
}

function columnTemplate(side) {
  const words = state.words.filter((w) => w.side === side);
  const r = state.rect;
  const width = side === 'left' ? r.x : window.innerWidth - (r.x + r.w);
  return html`<div class="column ${side}" style=${`--space:${width}px`}>
    ${repeat(words, (w) => `${w.id}:${w.returns}`, chipTemplate)}
  </div>`;
}

function linesTemplate() {
  const clearing = state.phase === 'clearing';
  return state.words
    .filter((w) => w.lineReady)
    .map((w) =>
      linePoints(w.def).map(
        (pt) => svg`
          <line class="link ${clearing ? 'undraw' : 'draw'}" pathLength="1"
            x1=${w.def.label.x} y1=${w.def.label.y} x2=${pt.x} y2=${pt.y}></line>
          <circle class="dot ${clearing ? 'undraw' : ''}" cx=${pt.x} cy=${pt.y} r="7"></circle>`,
      ),
    );
}

function debugTemplate() {
  if (!debug) return nothing;
  return state.words.map((w) => svg`
    ${w.def.zones.map((z) => svg`<ellipse class="zone" cx=${z.x} cy=${z.y} rx=${z.rx ?? z.r} ry=${z.ry ?? z.r}
      transform=${`rotate(${z.angle || 0} ${z.x} ${z.y})`}></ellipse>`)}
    <text class="zone-label" x=${w.def.zones[0].x} y=${w.def.zones[0].y}>${w.text}</text>
    <circle class="zone-anchor" cx=${w.def.label.x} cy=${w.def.label.y} r="6"></circle>`);
}

function placedTemplate(word, i) {
  const { w, h } = imgSize();
  const pos = `left:${(word.def.label.x / w) * 100}%;top:${(word.def.label.y / h) * 100}%;`;
  const from = word.from ? `--fx:${word.from.x}px;--fy:${word.from.y}px;` : '';
  return html`<div class="placed ${state.phase === 'clearing' ? 'blurout' : ''}" style=${`${pos}${from}--i:${i}`}>
    ${word.text}
  </div>`;
}

function headerTemplate() {
  const l = layer();
  if (!l || state.phase === 'transition') return nothing;
  const found = state.words.filter((w) => w.placed).length;
  return html`<header class="title ${state.phase === 'clearing' ? 'fade' : ''}">
    <span>${state.animal.name} · ${l.title}</span>
    <span class="stars">${state.words.map((_, i) => html`<i class=${i < found ? 'on' : ''}>★</i>`)}</span>
  </header>`;
}

function ghostTemplate() {
  const d = state.drag;
  if (!d) return nothing;
  return html`<div class="chip ghost" style=${`left:${d.x - d.grabX}px;top:${d.y - d.grabY}px;width:${d.w}px;height:${d.h}px`}>
    ${d.word.text}
  </div>`;
}

function pickerTemplate() {
  return html`<div class="picker">
    <h1>Pick an animal</h1>
    <div class="cards">
      ${state.animals.map(
        (a, i) => html`<button class="card" style=${`--i:${i}`} @click=${() => {
          unlockAudio();
          openAnimal(a.id);
        }}>
          <img src=${a.thumb} alt="" />
          <span>${a.name}</span>
        </button>`,
      )}
    </div>
  </div>`;
}

function homeTemplate() {
  if (state.phase !== 'play' && state.phase !== 'finished') return nothing;
  return html`<button class="home" title="Pick an animal" @click=${showPicker}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-6h3v6h5V9.5" /></svg>
  </button>`;
}

function onStagePointer(e) {
  if (!debug || state.drag) return;
  const p = toImage(e.clientX, e.clientY);
  state.debugPoint = { x: Math.round(p.x), y: Math.round(p.y) };
  update();
}

function appTemplate() {
  if (state.phase === 'error') {
    return html`<div class="message"><h1>Oh no!</h1><p>${state.error}</p></div>`;
  }
  if (state.phase === 'picker') return pickerTemplate();
  if (state.phase === 'loading' && !state.layers.length) return html`<div class="message"><p>Loading…</p></div>`;

  const r = state.rect;
  const { w, h } = imgSize();
  const placed = state.words.filter((w) => w.placed);
  return html`
    <div class="stage" style=${`left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`}
      @pointerdown=${onStagePointer}>
      <svg class="lines" viewBox=${`0 0 ${w} ${h}`} preserveAspectRatio="none">
        ${linesTemplate()} ${debugTemplate()}
      </svg>
      ${repeat(placed, (w) => w.id, placedTemplate)}
    </div>
    ${columnTemplate('left')} ${columnTemplate('right')} ${headerTemplate()} ${homeTemplate()} ${ghostTemplate()}
    ${state.phase === 'finished'
      ? html`<div class="finale">
          <h1>You did it!</h1>
          <div class="buttons">
            <button @click=${playAgain}>Play again</button>
            <button @click=${showPicker}>Pick an animal</button>
          </div>
        </div>`
      : nothing}
    ${debug
      ? html`<div class="debug-box">
          debug · click the picture for pixel coordinates · press N to skip a layer<br />
          ${state.debugPoint ? `x: ${state.debugPoint.x}, y: ${state.debugPoint.y}` : ''}
        </div>`
      : nothing}
  `;
}

let queued = false;
function update() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    render(appTemplate(), root);
  });
}

// ---------- Start up ----------

async function main() {
  try {
    renderer = await Renderer.create(document.getElementById('gpu'));
  } catch (err) {
    state.phase = 'error';
    state.error = window.isSecureContext
      ? `${err.message} Please use the latest Chrome, Edge, Safari or Firefox.`
      : `This page was opened with plain http://, and browsers only turn on WebGPU for https:// pages ` +
        `(or localhost). Open it with an https:// address instead — see serve-https.py.`;
    update();
    return;
  }

  try {
    state.index = await fetchJSON('animals/animals.json');
  } catch (err) {
    return fail(`Could not load animals/animals.json (${err.message}).`);
  }

  // Names and thumbnails for the start screen; an animal whose animal.json is missing is left out.
  const animals = await Promise.all(
    state.index.animals.map(async (id) => {
      try {
        const def = await fetchJSON(`${animalDir(id)}animal.json`);
        return { id, name: def.name ?? id, thumb: layerImage(animalDir(id), def.layers[0]) };
      } catch (err) {
        console.warn(`Skipping animal "${id}"`, err);
        return null;
      }
    }),
  );
  state.animals = animals.filter(Boolean);

  const chosen = params.get('animal');
  if (chosen && state.animals.some((a) => a.id === chosen)) openAnimal(chosen, Number(params.get('layer')) || 0);
  else showPicker();
}

window.addEventListener('pointermove', moveDrag);
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('resize', () => {
  layout();
  update();
});
window.addEventListener('keydown', (e) => {
  if (!debug || state.phase !== 'play' || e.key.toLowerCase() !== 'n') return;
  state.words.forEach((w) => Object.assign(w, { placed: true, lineReady: true, from: null }));
  update();
  completeLayer();
});

main();
