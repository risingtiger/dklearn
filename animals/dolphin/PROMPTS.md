# Dolphin pictures — ChatGPT prompts

Four pictures, all **1536 × 1024 landscape**, saved into this folder as:
`outside.png`, `muscles.png`, `organs.png`, `skeleton.png`.

The transitions blend the pictures tile by tile, so all four must have the **exact same dolphin pose, size,
position, water and background**. The reliable way to get that: make `outside.png` first, then make every other
layer as an **edit of `outside.png`** (upload it into the same chat each time).

The word zones in `animal.json` are pre-placed for the pose described below (head upper-left, tail flukes
lower-right). After the pictures are in, open `?animal=dolphin&debug` and nudge the numbers to fit.

---

## 1. Outside — `outside.png`

**Attach:** `animals/bear/outside.png` and `animals/bluebird/outside.png` as style references.

```
Create a 1536x1024 landscape image of a bottlenose dolphin, in the exact same art style as the two attached
reference images (a bear and a bluebird). Match their look closely:

- Hyper-detailed, painterly natural-history illustration with soft airbrushed realism and crisp fine detail.
- Strict side view, the dolphin facing LEFT, the whole animal fully in frame.
- Deep black background. A soft glowing halo / rim light hugs the animal's silhouette (cool aqua-blue glow
  for the dolphin, the way the bluebird has a blue glow and the bear has a warm amber glow).
- A warm golden-amber light pools at the bottom of the frame and fades to black at the edges, like the
  references.
- The habitat is a small vignette that fades into the black background at its edges — no full scene, no sky,
  no horizon.

Pose and layout (important — keep it simple and readable):
- The dolphin is leaping up out of the water on a gentle diagonal, head at the upper-left, tail at the
  lower-right.
- The snout tip is at about 15% across and 25% down; the eye at about 27% across, 25% down; the blowhole on top
  of the head at about 33% across, 17% down.
- The dorsal fin points up at about 53% across, 22% down.
- One pectoral flipper is clearly visible below the chest at about 39% across, 45% down.
- The tail flukes are at about 81% across, 72% down, just breaking the surface with a splash.
- The bottom ~20% of the image is a patch of sparkling blue-green ocean water with small ripples and spray
  around the tail, lit golden from below, fading into black at the left, right and bottom edges.
- The top-right and lower-left corners stay mostly empty dark background (words are placed there).

The dolphin: smooth glossy grey skin, darker grey back, pale grey-white belly, rounded melon forehead, short
snout with a slight smile, a friendly dark eye, visible blowhole. Natural, anatomically accurate, gentle and
friendly — for a children's biology game.

No text, no labels, no watermark, no border.
```

---

## 2. Muscles — `muscles.png`

**Attach:** your new `animals/dolphin/outside.png` (and optionally `animals/bear/muscles.png` for style).

```
Edit the attached dolphin image. Keep EVERYTHING identical — same canvas size, same pose, same position, same
outline, same water, same splash, same black background and glow — and only change the dolphin's body.

Remove the skin and show the dolphin's muscles, in the style of the attached bear muscle illustration:
- Salmon-pink muscles with fine fiber striations, smooth rounded muscle bellies.
- Cream / ivory tendons and fascia bands wrapping between the muscle groups.
- Long powerful muscle bands running along the back and the underside toward the tail (the tail stock is
  very muscular), muscles around the flipper, and cream-colored tendons at the base of the tail flukes and
  the flipper.
- Keep the eye, the snout tip and the blowhole looking as they do in the original.
- The dorsal fin and tail flukes can stay slightly skin-toned / translucent since they are mostly not muscle.
- The glow around the body becomes a soft salmon-pink glow.

Anatomically plausible, clean, textbook-quality, not gory. No text, no labels.
```

---

## 3. Organs — `organs.png`

**Attach:** `animals/dolphin/outside.png` (and optionally `animals/bear/organs.png` for style).

```
Edit the attached dolphin image. Keep EVERYTHING identical — same canvas size, same pose, same position, same
outline, same water, same splash, same black background and glow.

Make a cutaway of the dolphin's body showing its internal organs, in the style of the attached bear organ
illustration: a thin rim of the dolphin's grey skin stays around the outside edge, the head, the snout, the
dorsal fin and the tail flukes; the inside of the body is opened up to show:
- the pink brain inside the rounded head, just behind and above the eye,
- the throat / windpipe running from the blowhole down to the lungs,
- a red heart low in the chest, just behind the flipper,
- two large pink lungs along the upper chest, behind the head,
- the liver, the stomach, and coiled intestines in the belly,
- muscles and cream connective tissue framing the organs.

Clear, separated, rounded organ shapes with soft glossy shading so each one is easy to point at. Anatomically
plausible, textbook-quality, not gory. No text, no labels.
```

---

## 4. Skeleton — `skeleton.png`

**Attach:** `animals/dolphin/outside.png` (and optionally `animals/bear/skeleton.png` for style).

```
Edit the attached dolphin image. Keep EVERYTHING identical — same canvas size, same pose, same position,
same water, same splash, same black background and glow — and replace the dolphin with its skeleton in
exactly the same pose and place.

Style it like the attached bear skeleton illustration: warm ivory / cream bones with fine pitted bone texture
and soft shading, a soft golden glow around the skeleton.

Show:
- the long dolphin skull with the narrow beak-like jaw and small conical teeth, and the big eye socket,
- the neck vertebrae, then a long spine of vertebrae with tall bony spines on top running all the way to the
  tail,
- the rib cage curving down from the spine behind the head,
- the flipper bones (shoulder blade, arm bones and finger bones inside the flipper outline),
- a faint translucent outline where the dorsal fin and tail flukes were (they have no bones).

Anatomically accurate dolphin skeleton. No text, no labels.
```

---

## Tips

- If ChatGPT drifts (moves the dolphin, changes the water), say: *"Same image, but do not move or resize
  anything — only change the dolphin's body."* and re-attach `outside.png`.
- Ask for the image as **1536 × 1024**. If it comes back a different size, resize it to 1536 × 1024 before
  saving.
- The PNGs can stay opaque (black background); transparency isn't needed.
