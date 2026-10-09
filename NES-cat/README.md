# NES-cat

**Shiro** — an animated pixel cat living in a cozy room. Built with
[p5.js](https://p5js.org/) for the scene and [NES.css](https://nostalgic-css.github.io/NES.css/)
for the retro UI shell, with a font of **Press Start 2P**.

One fully-polished sprite, built to seed a larger sprite system: the frames are
data, and a small reusable API draws them.

---

## Running locally

The page loads external stylesheets/fonts, so serve the folder over HTTP rather
than opening the file directly:

```bash
# npm script (uses npx http-server)
npm start

# or Python
python -m http.server 8080

# or the VS Code Live Server extension
```

Then open <http://localhost:8080/NES-cat/>.

Press **PRESS START** to begin — that click is also what unlocks audio.

## Controls

| Gesture | What happens |
|---|---|
| Click / hold **Shiro** | Pet her — Mood rises, hearts pop |
| **Drag** Shiro | Move her along the floor |
| Click **anywhere else** in the room | Play — notes pop, Mood up, Energy down |
| Move the cursor | Her eyes follow it |
| **SOUND: ON/OFF** button | Mute or unmute the chiptune |

## What's in it

- **Real-time day/night cycle.** The room's light (and Shiro's behaviour) follow
  your device clock — she naps more at night. The HUD shows the current time and
  phase.
- **Generative chiptune.** No fixed melody: every step picks from a minor
  pentatonic pool through a lowpass + delay, so it never repeats exactly. The cat
  bounces on the beat.
- **Mood / Energy / Hunger** meters that drift slowly, respond to how you treat
  her, and persist across visits via `localStorage`.
- **Dialogue box** with a typewriter effect and lines keyed to her state.
- **Juice:** squash/stretch and anticipation, blink and tail-sway idle motion,
  particles (hearts, `zzz`, notes, dust), and ambient room motion (curtain,
  plant, dust motes).

## Project layout

```
NES-cat/
  index.html          markup + ordered script tags
  sketch.js           p5 orchestration: 320x180 buffer, integer scaling
  js/
    config.js         THE tuning surface (sizes, timings, meters, day/night keys)
    palette.js        NES.css-derived palette + day/night interpolation
    frames.js         literal 32x32 pixel frames for Shiro (GENERATED)
    frames-extra.js   GENERATED derived frames (tail swish, yawn)
    sprite.js         reusable sprite API: makeSprite/draw/state machine
    scene.js          the room, lighting and ambient animation
    shiro.js          Shiro: state machine, meters, particles
    input.js          one pointer path for mouse + touch
    audio.js          generative chiptune (p5.sound), guarded
    ui.js             NES.css HUD: gate, dialogue, bars, sound
  css/style.css       theme bridge + HUD layout
tools/
  build-sprites.js    generates js/frames.js (the base poses)
NES-cat/tools/
  derive-frames.js    derives js/frames-extra.js from js/frames.js
```

## Rendering

The scene renders into a **320x180** offscreen buffer and is blitted at an
**integer** scale with smoothing off, so pixels never blur. The space around the
stage is painted the NES.css theme black rather than letterboxed.

## Editing the cat art

Shiro's art is generated in two stages, so the shapes stay parametric and
symmetric while the shipped frames remain plain, diffable data:

**1. Base poses → `js/frames.js`**

```bash
npm run sprites:preview   # print every frame as ASCII
npm run sprites:check     # verify 32x32 sizes + left/right symmetry
npm run sprites:build     # regenerate js/frames.js
```

Edit the shapes in `tools/build-sprites.js`, then rebuild. Run
`sprites:check` before committing — it fails if any frame breaks symmetry.

**2. Derived frames → `js/frames-extra.js`**

The tail swish and the yawn are *derived* from the base poses rather than
hand-duplicated, so they can never drift out of sync with the art they came
from:

```bash
node tools/derive-frames.js                    # regenerate js/frames-extra.js
node tools/derive-frames.js --preview          # print every derived frame as ASCII
node tools/derive-frames.js --preview idle_open_tailUp0   # ...just one
```

The tool validates every output is exactly 32x32 and records which base pose
each frame came from in the generated header. To add a new derived frame, edit
the derivation table near the bottom of `tools/derive-frames.js`.

> **Note:** both files are generated. Re-run `sprites:build` *then*
> `node tools/derive-frames.js` in that order — the derivation reads
> `js/frames.js` as its input.

## Resources

- [p5.js reference](https://p5js.org/reference/)
- [NES.css](https://nostalgic-css.github.io/NES.css/)
