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
    sprite.js         reusable sprite API: makeSprite/draw/state machine
    scene.js          the room, lighting and ambient animation
    shiro.js          Shiro: state machine, meters, particles
    input.js          one pointer path for mouse + touch
    audio.js          generative chiptune (p5.sound), guarded
    ui.js             NES.css HUD: gate, dialogue, bars, sound
  css/style.css       theme bridge + HUD layout
tools/
  build-sprites.js    generates js/frames.js (all poses)
```

## Rendering

The scene renders into a **320x180** offscreen buffer and is blitted at an
**integer** scale with smoothing off, so pixels never blur. The space around the
stage is painted the NES.css theme black rather than letterboxed.

## Editing the cat art

Every frame is generated from one parametric rig in `tools/build-sprites.js`,
so shapes stay proportional and the shipped file stays plain, diffable data:

```bash
npm run sprites:preview   # print every frame as ASCII
npm run sprites:preview idle_open walk_1   # ...just these
npm run sprites:check     # verify every frame is 32x32 and flip-safe
npm run sprites:build     # regenerate js/frames.js
```

Shiro is drawn **front-on**. That keeps her silhouette mirror-symmetric, which
is what lets one sprite read as "walking left" or "walking right" without a
second set of art and without a horizontal flip — so `--check` enforces the
mirror everywhere, exempting only what is deliberate: the tail (read from the
exact mask the builder stamped, since a raised tail sits far higher than a
hanging one), the alternating walk paw, the eye glance, and the one-paw-up
grooming poses. It also asserts nothing lands on the last row, which would
read as clipped.

To add a pose, add a `pose(name, {...})` line in `frames()`. The rig
parameters are `bodyDY/headDY`, `squash`, `pawLift` (raises or lowers both
front paws), `legPhase`, `tailSway`, `tailUp`, `earPerk`,
`eyes: open|closed|happy|wide`, `mouth: smile|open|pant` and `look`.

Flourish frames are composed as `base + suffix` (e.g. `sit_closed_tailUp1`),
so any pose that can host a flourish needs a variant per eye state — a blink
landing mid-flourish asks for the closed-eyes one. `Shiro.pickFrame()`
resolves composed names against the real frame table and falls back to the
base pose, so a missing variant costs a flourish rather than a frame of
invisible cat.

Vertical travel — jumping, pouncing, being carried — is the state machine's
job. The frames carry the crouch, the tuck and the stretch; the shadow stays
on the floor and shrinks.

Tail-pose variants and the yawn used to come from a second tool that redrew
regions of a finished frame. They are ordinary frames now: the rig expresses
them directly, so there is one generated file and one tool.

## Resources

- [p5.js reference](https://p5js.org/reference/)
- [NES.css](https://nostalgic-css.github.io/NES.css/)
