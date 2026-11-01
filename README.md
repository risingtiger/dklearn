# Inside the Animals

A reading + biology game. Pick an animal, read a word, drag it onto the right body part.
Finish every word and the picture dissolves into the next layer: outside → muscles → organs → skeleton.

## Running it

Browsers only turn on WebGPU for `https://` pages or `localhost`.

- **On this Mac:** `python3 -m http.server 8123`, then open http://localhost:8123
- **On the iPad (or any other device):** `python3 serve-https.py`, then open the `https://` address it prints.
  Safari warns that the connection isn't private the first time: tap **Show Details → visit this website**.

## Folder layout

```
animals/
  animals.json            which animals appear on the start screen, in order, plus shared settings and sounds
  bluebird/
    animal.json           the animal's name, its layers and their words
    outside.png           one picture per layer, named after the layer id
    muscles.png
    organs.png
    skeleton.png
    sounds/               this animal's own sounds (optional)
  bear/
    animal.json
    outside.png
    sounds/
sounds/                   sounds shared by every animal (water drop, frog, wind)
```

### Naming rules

- **Animal folder:** lowercase, no spaces — `animals/bluebird`, `animals/bear`, `animals/red-fox`.
- **Layer pictures:** `<layer id>.png` in the animal's folder. Use these layer ids so every animal reads the same way:

  | Layer id | Picture |
  | --- | --- |
  | `outside` | the animal as you'd see it |
  | `muscles` | muscles and tendons |
  | `organs` | the organs |
  | `skeleton` | the bones |

  You can use other layer ids too (`feathers`, `nerves`…); the picture is just `<id>.png`.
- **Pictures:** every layer of one animal should be the same size and pose (the transitions blend them tile by tile).
  1536 × 1024 with a transparent or dark background works well.

## Adding an animal

1. Make the folder `animals/<name>/` and put the pictures in it (`outside.png`, then later `muscles.png`, …).
2. Create `animals/<name>/animal.json`:

   ```json
   {
     "name": "Fox",
     "layers": [
       {
         "id": "outside",
         "title": "The Outside",
         "words": [
           { "word": "Ear", "zones": [{ "x": 400, "y": 60, "r": 45 }], "label": { "x": 250, "y": 50 } }
         ]
       }
     ]
   }
   ```

3. Add the folder name to the `animals` list in `animals/animals.json`.
4. Open the app with `?animal=<name>&debug` to place the words (see below).

A layer whose picture doesn't exist yet is skipped, so you can write the words for `muscles` before the picture is ready.

## Words

Each word has:

- `word` — the text shown to read.
- `zones` — where a drop counts as correct. A circle `{x, y, r}` or an ellipse `{x, y, rx, ry, angle}`.
  Give several zones when the part appears more than once (both ears, four legs).
- `label` — where the word floats to once it's found.
- `points` — *(optional)* where the connecting line ends; defaults to the middle of each zone.

All numbers are **pixels in the picture** (0–1536 across, 0–1024 down for a 1536 × 1024 picture).

### Placing words with debug mode

Open `?animal=bear&debug` (add `&layer=1` to jump to the second layer):

- every zone is drawn on the picture with its word,
- clicking the picture shows the pixel coordinates under the pointer,
- pressing **N** finishes the current layer so you can check the next one.

## Sounds

Sounds are grouped by moment. `animals/animals.json` sets the shared ones; an `animal.json` can replace any of them
with its own (paths relative to the animal's folder). When a list has several clips, one is picked at random.

| Moment | When it plays | Shared | Bluebird | Bear |
| --- | --- | --- | --- | --- |
| `pickup` | a word is picked up | water drop | | |
| `wrong` | dropped on the wrong part | frog | | |
| `correct` | dropped on the right part (and as a new picture settles) | | bluebird call | splash |
| `fly` | the word floats to its spot | | wing flutter | |
| `celebrate` | a layer is finished | | bluebird song | growl |
| `transition` | the picture changes | wind in a tree | | |

```json
"sounds": {
  "correct": ["sounds/call-1.mp3", "sounds/call-2.mp3"],
  "celebrate": ["sounds/song.mp3"]
}
```

Short MP3s work everywhere. See `CREDITS.md` for where the current recordings came from.

## Settings

In `animals/animals.json` (or an `animal.json`, to change one animal only):

| Setting | Meaning |
| --- | --- |
| `shuffleWords` | mix up the word order each time |
| `hitPadding` | how forgiving drops are (1 = exact zones, 1.3 = generous) |
| `transitionSeconds` | how long the picture-to-picture transition lasts |
| `transitionTileRows` | how many rows of orbs the picture breaks into |
