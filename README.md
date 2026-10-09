# NES-cat

**Shiro** — an animated pixel cat living in a cozy room. Built with
[p5.js](https://p5js.org/) for the scene and [NES.css](https://nostalgic-css.github.io/NES.css/)
for the retro UI shell, with a font of **Press Start 2P**.

One fully-polished sprite, built to seed a larger sprite system: the frames are
data, and a small reusable API draws them.

---

## Running locally

The page loads its libraries and fonts from a CDN, so serve the folder over
HTTP rather than opening the file directly (and it needs a network connection
the first time it loads):

```bash
# npm script (uses npx http-server)
npm start

# or Python
python -m http.server 8080

# or the VS Code Live Server extension
```

Then open <http://localhost:8080/NES-cat/>.

Press **PRESS START** to begin — that click is also what unlocks audio.

Everything the page needs is pinned to an exact version, so a given commit
always runs against the same libraries:

| Loaded from | Version |
|---|---|
| NES.css (unpkg) | `2.3.0` |
| p5.js (jsDelivr) | `2.3.4` |
| p5.sound (jsDelivr) | `0.4.1` |
| Press Start 2P (Google Fonts) | — |

There are no runtime npm dependencies: `npm install` is not required, and
`package.json` declares none.

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

Shiro is drawn in **two views, and the split is by what the pose has to
show** — one system, not two versions of the cat:

| View | States | Why |
| --- | --- | --- |
| **front** | idle, sit, sleep, react | The states that are about her *face*. She is facing you, the silhouette is mirror-symmetric so one frame reads as facing left *or* right with no second art and no flip, and the expression does the work. |
| **side** | walk, jump, pounce, eat, drink, groom, wash, tree, held | Everything whose meaning is in her *body*. A front-facing sprite cannot show a neck bending down to a bowl, a paw raised to a muzzle, legs hanging loose from a hand, or a stride. |

That is the reason the profile exists: it is not a second version of the
cat, it is the only view in which those poses are legible.

The rule lives in one place — `Shiro.SIDE_STATES` in `shiro.js` names the
profile states, and `frameFor()` maps them onto the `side_` frames. Both
rigs are built by the same tool and land in the same frame table; side
frames carry a `side_` prefix, are authored facing right, and are mirrored
at draw time. The mirror is decided *per frame* rather than per state —
anything drawn from the profile carries the `side_` prefix — because a turn
is profile art at both ends with a front pose in the middle.

Because fixtures are always approached from their left, `faceFixture()` pins
her to facing right on arrival — otherwise arriving from the far side would
mirror the profile sprite and she would perform with her back to the bowl.

## Animation states

Choreography lives in `shiro.js`; `config.js` BEHAVIOR holds every duration
and weight, so nothing about the feel needs touching code.

**Turning.** `turn` plays the bridge between the two views: the pose she is
leaving, two three-quarter frames, then the destination view. `startWalk()`
pivots before setting off and `endWalk()` turns her back on arrival, so the
most common transition in the piece never hard-cuts between views.

**Stationary.** `idle` (breathing, blinking, cursor gaze, plus the
flourishes), `sit`, `sleep`, `react`, and two whole postures that are not
flourish overlays: `stretch` (spine uncoiling, hold, release) and `loaf`
(tucked into a compact oval). `knead` and `alert` are in the same family.

**Travelling.** `walk` is a six-frame cycle driven by *distance travelled*
rather than a clock, so the paws never skate. `jump` and `pounce` carry a
vertical arc while the shadow stays on the floor and shrinks.

**Reaching.** `eat`, `drink`, `groom`, `wash`, `tree` and `watch` — the
states where what matters is her body bending or reaching toward something.
`watch` is the turn as an activity in its own right: she turns to profile,
stands there breathing, and turns back.

**Being carried.** Not a loop — a sequence: `held_lift` (the "!"), then the
hang, a couple of startled kicks, then settling.

Two transitions are worth knowing about because they were missing and are
easy to break: `wake()` routes through `stretch`, because a cat gets up by
stretching and asleep-to-awake is the most common transition in the piece;
and `dragEnd()` lands her into `shake`, without which being put down just
stopped hanging and read as a sprite swap.

> **Two traps in this file.** States are invoked as
> `enter(sm, previous, payload)` — a state that wants the payload must
> declare all three parameters, or it silently receives the state machine
> and every payload field reads back `undefined`. And `self` only means
> Shiro inside `buildStateMachine`; at module level, `self` resolves to
> `window` in a browser. Neither shows up in `node --check`.

Because the front view is symmetric, `--check` enforces the mirror there,
exempting only what is deliberate: the tail (read from the exact mask the
builder stamped, since a raised tail sits far higher than a hanging one), the
alternating walk paw, the eye glance, and the one-paw-up grooming poses.
Side frames are asymmetric by nature, so they are only checked for shape —
right size, and nothing on the last row or last column, since the flip pass
would clip the latter. Both views are checked that way.

To add a pose, add a `pose(name, {...})` or `side(name, {...})` line in
`frames()`. The front rig takes `bodyDY/headDY`, `squash`, `pawLift` (raises or
lowers both front paws), `legPhase`, `tailSway`, `tailUp`, `earPerk`,
`eyes: open|closed|happy|wide`, `mouth: smile|open|pant` and `look`. The side
rig takes `bodyX/bodyY`, `bodyRX/bodyRY`, `headDX/headDY`, a `legs` map of
`{ x, lift, hide }` per leg, and a `tail` of `{ sway, lift, curl }` — in
profile the legs move fore/aft as well as up, which is what makes a stride
read.

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
