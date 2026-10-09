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
    frames.js         GENERATED literal 32x32 pixel frames for Shiro
    sprite.js         reusable sprite API: makeSprite/draw/state machine
    scene.js          the room, lighting and ambient animation
    shiro.js          Shiro: state machine, meters, particles
    input.js          one pointer path for mouse + touch
    audio.js          generative chiptune (p5.sound), guarded
    ui.js             NES.css HUD: gate, dialogue, bars, sound
  css/style.css       theme bridge + HUD layout
tools/
  build-sprites.js    authoring tool for the pixel frames
```

## Rendering

The scene renders into a **320x180** offscreen buffer and is blitted at an
**integer** scale with smoothing off, so pixels never blur. The space around the
stage is painted the NES.css theme black rather than letterboxed.

## Editing the cat art

Shiro's frames are generated so they stay consistent and symmetric:

```bash
npm run sprites:preview   # print every frame as ASCII
npm run sprites:check     # verify 32x32 sizes + left/right symmetry
npm run sprites:build     # regenerate js/frames.js
```

Edit `tools/build-sprites.js` (the shapes are parametric), then rebuild. This is
also how new animation frames should be added.

## Resources

- [p5.js reference](https://p5js.org/reference/)
- [NES.css](https://nostalgic-css.github.io/NES.css/)
