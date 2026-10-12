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
| Click / hold **Shiro** | She headbutts your hand, and leans into it for as long as you hold |
| **Drag** Shiro | Pick her up and carry her; she dangles, kicks, then settles |
| **Drag the yarn** | Push the ball of wool about. A flick throws it, and she goes after it |
| Click **any object** | She goes and does the thing it is for — see below |
| Click **empty floor** | Play — notes pop and she reacts |
| Move the cursor | Her eyes follow it |
| **SOUND: ON/OFF** button | Mute or unmute the chiptune |

### The room is interactive

Every object in the room is a hit target, and clicking one sends Shiro off
to do whatever that object is for:

| | |
|---|---|
| **the yarn** | she stalks and pounces at it, then chases where it rolls |
| **the food bowl** | she eats. If it's empty, clicking it fills it and she goes anyway |
| **the water bowl** | she drinks, same deal |
| **the cat tree** | she goes over and scratches the post |
| **the plant** | she goes over and stares at it, which is what cats do with plants |

That is possible because the room is drawn through the same sprite API as the
cat. A frame has a width and a height, so it *is* the hit box and it *is* the
collider — there is no second list of rectangles anywhere that could disagree
with what is on screen. See *The room is sprites* below.

## What's in it

An interactive animations box: one cat, in one room, doing a great many
things, and doing them well.

- **A day/night cycle on your real clock.** The light through the window is
  derived from the sun's height, and so is she — she sleeps at night and is
  lively in the morning. The HUD shows the time and the phase.
- **Twenty-five states**, and both ends of every one of them are bridged
  between the two sprite views so nothing ever hard-cuts. See
  *Animation states* below.
- **The hunt.** She stalks the yarn before she pounces it, and chases it
  where it rolls. A deliberate stalk and an impulsive lunge are different
  rolls with different weights. Throw the ball yourself and she comes.
- **Settling in.** Cats trample a spot before lying down on it, so half of
  her loaves are preceded by a circle.
- **Furniture that is actually furniture.** She walks round the planter and
  cannot be dropped inside it. She reaches the cat tree by standing with her
  shoulder against the plinth.
- **Generative chiptune.** No fixed melody: every step picks from a minor
  pentatonic pool through a lowpass + delay, so it never repeats exactly, and
  she bounces on the beat.
- **Dialogue box** with a typewriter effect, keyed to what she is doing and
  what the light is doing.
- **Juice:** squash/stretch, anticipation, blink and tail-sway idle motion,
  particles (hearts, `zzz`, notes, dust), and ambient room motion (curtain,
  plant, dust motes, birds, a pendulum clock on the real second).

There are no meters, and there never will be again. They were simulating a
tamagotchi loop that two of the three existed only to display — but they were
also the only thing gating half her behaviour, so removing them was a change
to what she *does*, not just to what is on screen. What drives her now is the
clock the room is already running: she sleeps because it is night and she has
been up a while, and she goes to the bowls because the gap since last time has
passed. The reason is visible in the room rather than readable off a gauge.

## Project layout

```
NES-cat/
  index.html          markup + ordered script tags
  sketch.js           p5 orchestration: 320x180 buffer, integer scaling
  js/
    config.js         THE tuning surface (sizes, timings, day/night keys)
    palette.js        NES.css-derived palette + day/night interpolation
    frames.js         literal pixel frames: Shiro at 32x32, the room's objects
                      at whatever size they are (GENERATED)
    sprite.js         reusable sprite API: makeSprite/draw/state machine
    scene.js          the room, lighting, ambient animation, OBJECTS table
    shiro.js          Shiro: state machine, needs, particles, notice()
    input.js          one pointer path for mouse + touch
    audio.js          generative chiptune (p5.sound), guarded
    ui.js             NES.css HUD: gate, dialogue, clock, sound
  css/style.css       theme bridge + HUD layout
tools/
  build-sprites.js    generates js/frames.js (the cat and the room's objects)
  check-animations.js drives the state machine headlessly (npm run anim:check)
```

## The room is sprites

The cat is not the only thing built on `NESCAT.Sprite`. The furniture is too,
and that is not for tidiness — it is what makes the room *addressable*.

The room used to be 184 calls to `rect`/`disc`/`pxLine` and not one reference
to the sprite API. A pile of drawing calls is a picture and nothing else:
nothing in it knows how big a ball of wool is, so there was no way to ask
whether a click landed on one, and no way to stop a cat walking through the
planter. Both were true — she could be dropped exactly onto the pot at x=271
and the game reported no problem, and the yarn was a thing that rolled about
on a timer rather than a thing you could touch.

As frames, the same data answers all of it at once. A frame has a width and a
height, so it **is** the hit box and it **is** the collider, and the string
that draws it is the thing you point at. One source, so the hit test and the
collider cannot drift out of agreement with what is on screen.

`OBJECTS` in `scene.js` is the single table: which sprite, which pixel is the
anchor, where it sits, whether she can walk through it, whether you can pick
it up, and how wide its shadow is. The renderer, the hit test and the collider
all read it.

Three things about it that took a second pass, and are the kind that are
obvious only after they have gone wrong:

- **A hit box and a collider are different questions.** The cat tree's box is
  46 wide and 82 tall, because you should be able to reach up and touch the
  bed. The thing that would stop her walking into it is the plinth, which is
  6px tall — and because the room is drawn before her, standing in front of a
  plinth looks like standing in front of a plinth. The plant is the opposite:
  22px of solid pot rim at exactly her height, so being "inside" it puts her
  legs over the front of the rim with the rim crossing them.
- **The collision push-out has to know where she started.** Moving her to the
  nearest clear edge is right when she was *placed* somewhere silly. It is
  badly wrong when she is *walking*: a 2px step to the left from just right of
  the cat tree resolves to "nearest edge" on the *far* side, and the cat
  teleports thirty pixels through a post she was about to walk into. A
  resolved position further from where she started than the step she asked for
  is refused, and the caller reads that as blocked.
- **`arrive()` is exempt from collision, and has to be.** A fixture's
  stand-off is computed from that fixture's own geometry, so it is by
  construction a place she is *meant* to stand. She scratches the post by
  standing with her shoulder against the plinth; collision there would push
  her off the thing she came for.

Collision is one-dimensional on purpose. Everything in the room stands on the
floor and none of it can be climbed, so what needs resolving is *which
stretches of floor are occupied* — and the walls are one-dimensional already.

Each object carries its own `charColors`, so a palette is local to the object
rather than being one global table the cat and the furniture both have to
agree about. The frames are still lit through `Sprite.draw`'s ambient, at the
same weight the hand-drawn room used, so becoming a sprite did not also change
how the light falls on them.

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
leaving, two three-quarter frames, then the destination view. Because the two
views are one system, *every* state authored in profile has to use it at both
ends — the pivot into an activity and the turn back out of it. `startWalk()`
does it before setting off, `endActivity()` on the way back, and `beginActivity()`
on the way in to a bowl, a jump or a pounce. `endActivity()` anchors the turn on
the frame she is actually holding rather than a name passed in, so it cannot
drift when a pose is renamed.

An activity that pivots on the way out pauses and then *resumes* rather than
re-entering: `sm.resume()` restores a state without running its `enter()`, which
is what keeps the approach bookkeeping (target, arrived flag) alive across the
turn. Going through `sm.set()` would rebuild it and send her back to the start
of the approach, so she would pivot forever.

**Stationary.** `idle` (breathing, blinking, cursor gaze, plus the
flourishes), `sit`, `sleep`, `react`, and whole postures that are not
flourish overlays: `stretch` (rump up, forelegs slid forward, hold, release),
`loaf` (tucked into a single mound) and `knead` (a forepaw pressing into a
blanket). `alert` and `nod` (sitting up and losing a fight with sleep) are in
the same family. `loaf` and `sleep` are front view and one shape with no neck;
`stretch` and `knead` are profile, because a spine uncoiling and a leg doing
work are exactly the two things a front view cannot show.

**Answering a hand.** `bump` is a headbutt. A press is one; holding the
press keeps her in it, leaning in and easing back on a slow breath for as long
as your hand stays, and she goes back to the room when you let go. It is
deliberately not mirror-symmetric — she is pressing into a hand on one side —
so `--check` exempts it the way it exempts the shake.

**Settling.** `circle` is a code animation with no new art: she tramples a
spot, turning on it in profile, and half of all loaves arrive through it. A
cat chooses a place rather than arriving at one, and the trampling is why.

**Travelling.** `walk` is a six-frame cycle driven by *distance travelled*
rather than a clock, so the paws never skate. `jump` and `pounce` carry a
vertical arc while the shadow stays on the floor and shrinks.

**The hunt.** `stalk` creeps her toward the yarn — low, slow, tail lashing,
which is the tell — and holds a coil before she springs. `pounce` is the
launch. `chase` reuses the walk cycle on a shorter stride, which at 32px is
the whole difference between walking and running, and follows the yarn
wherever it rolled. Bounded at `chaseMax` rounds, because a cat that chases a
ball of wool forever is not a cat.

**Reaching.** `eat`, `drink`, `groom`, `wash`, `tree` and `scratch` — the
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

`npm run anim:check` drives the whole machine headlessly and fails on a view
cut — a settled profile pose handing straight to a front one — as well as on
a frame that does not resolve, so both ends of every activity stay bridged
without anyone having to watch for it. `npm run anim:check -- --seq <state>`
prints the frame sequence for one state, which is the quickest way to see
whether a transition actually played.

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

## License

[MIT](LICENSE) — do what you like with it.
