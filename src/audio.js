// Nature recordings played with the Web Audio API. See CREDITS.md for sources and licenses.
//
// Sounds are grouped by event (pickup, wrong, correct, fly, celebrate, transition). Each event
// has a list of clips; one is picked at random each time so repeats don't sound identical.

const ctx = new AudioContext(); // starts suspended until the first tap
const master = ctx.createGain();
master.gain.value = 0.8;
master.connect(ctx.destination);

const decoded = new Map(); // url -> Promise<AudioBuffer | null>
let clips = {};            // event -> AudioBuffer[]

function load(url) {
  if (!decoded.has(url)) {
    decoded.set(
      url,
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .catch((err) => {
          console.warn(`Could not load sound ${url}`, err);
          return null;
        }),
    );
  }
  return decoded.get(url);
}

/** Switch to a set of sounds: { event: [url, ...] }. Resolves once they are decoded. */
export async function useSounds(map) {
  const entries = await Promise.all(
    Object.entries(map).map(async ([event, urls]) => [event, (await Promise.all(urls.map(load))).filter(Boolean)]),
  );
  clips = Object.fromEntries(entries);
}

/** Browsers only allow audio after a tap/click, so call this from a pointer event. */
export function unlockAudio() {
  if (ctx.state === 'suspended') ctx.resume();
}

const rand = (a, b) => a + Math.random() * (b - a);

/** Play a random clip for an event, slightly re-pitched so repeats don't sound identical. */
function play(event, { gain = 1, when = 0, pitch = 0.06 } = {}) {
  const list = clips[event];
  if (!list?.length) return;
  const src = ctx.createBufferSource();
  src.buffer = list[(Math.random() * list.length) | 0];
  src.playbackRate.value = rand(1 - pitch, 1 + pitch);
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start(ctx.currentTime + when);
}

export const sounds = {
  pickup() {
    play('pickup', { gain: 0.55, pitch: 0.12 });
  },

  wrong() {
    play('wrong', { gain: 0.6 });
  },

  /** The animal's own sound, then the "fly" sound as the word floats to its spot. */
  correct() {
    play('correct', { gain: 0.9 });
    play('fly', { gain: 0.9, when: 0.25 });
  },

  celebrate() {
    play('celebrate', { gain: 1, pitch: 0 });
    play('fly', { gain: 0.8, when: 0.1 });
    play('fly', { gain: 0.6, when: 1.4 });
  },

  /** Plays while the picture changes, with the animal's sound as the new picture settles. */
  transition(seconds = 5) {
    play('transition', { gain: 0.9, pitch: 0 });
    play('correct', { gain: 0.8, when: Math.max(0, seconds - 0.8) });
  },
};
