# NES-cat — Spec

**Status:** Draft / awaiting approval · **Owner:** Jem (Jem-Jem-Jem) · **Author:** Buffy (Codebuff)
**Scope of this document:** The creative brief and technical plan for turning the empty `NES-cat` p5.js scaffold into a polished, character-led piece. **No code changes are made by this document.**

> **Repo constraint (explicit):** This work stays **local**. Do **not** push to any remote. Commits are optional and only on Jem's say-so, until Jem decides otherwise.
>
> **Superseded — this is now a record of a constraint that has since been lifted.** Jem has decided otherwise: the work is published to a **public** GitHub repository. The constraint above governed the whole of the local build, and pushing was authorised separately, at the end. The two later mentions of it (§4 "Any push/deploy" and §14 "No push") were updated to match.

---

## 1. Summary

Build **one fully polished sprite** — an animated NES-style white cat named **Shiro** — living in a cozy pixel room, wrapped in a **NES.css retro UI shell**. The single cat is crafted to production quality to **seed a future sprite system** (small reusable API + data-driven frame defs), not just a one-off demo.

The piece is an **ambient companion**: gentle, self-running, mouse-reactive, and scored by **generatively synthesized chiptune**. It should feel *alive* and *cohesive*, not like parts bolted together.

---

## 2. Context (current repo state)

- p5.js 2.0-era scaffold at `NES-cat/`:
  - `NES-cat/index.html` — loads `css/style.css`, `js/p5.js` (v2.3.4), `js/addons/p5.sound.min.js`, `sketch.js`; also CDN `nes.css@latest` + Google Fonts **Press Start 2P**.
  - `NES-cat/sketch.js` — default `createCanvas(800,600)` / grey `background(220)`. **Empty of real content.**
  - `NES-cat/css/style.css` — reset + centered body + Press Start 2P.
  - `NES-cat/assets/` — empty (will hold nothing; art is code-defined).
- Root `package.json` — currently mislabeled (`name: "nes-sprites"`, `description: "sprites"`), deps `nes.css ^2.2.1`, `p5 ^2.3.4`.
- Single commit on `master` (`7248385`), `.gitignore` excludes `node_modules/`.

---

## 3. Goals

1. A single, high-polish animated cat sprite (Shiro) living in a scene.
2. A real **state machine** (idle / walk / sit / sleep / react) with smooth transitions.
3. **Small reusable sprite API** so future sprites are mostly data.
4. A **NES.css UI shell** (title, dialogue box, stat bars) unified with the canvas palette.
5. **Generative chiptune** + beat-aware animation + mute control.
6. **Real-time day/night cycle** that changes light and behavior.
7. Responsive: works on desktop and mobile/tablet.
8. Clean, modular code with a central config for tuning.

## 4. Non-goals

- Multiple characters or a full game loop/gameplay.
- Pixel-perfect NES hardware emulation (palette is NES-*inspired*, not exact).
- External art assets (PNG spritesheets) — art is defined in code.
- Network features, accounts, analytics.
- Any push/deploy. *(Superseded — see the note at the top: the repo was later published publicly.)*

---

## 5. Creative direction

| Attribute | Decision |
|---|---|
| Cat | **Shiro** — a **white cat** |
| Accents | **Pink inner ears + pink paw pads** |
| Personality | **Affectionate / sweet** — warm, cuddly, purrs, leans into petting; hearts and soft reactions |
| Dialogue voice | Soft, cozy, first-person, gentle humor; ASCII/pixel-safe (Press Start 2P supports English) |
| Scene | **Cozy interior room** (window, plant, simple furniture) |
| Ambience | **Real-time day → night cycle** + smaller in-scene animations |
| Mood | Calm, ambient, comforting |

### Room ambience details
- **Day/night cycle mapped to the real local clock** (e.g. morning/afternoon/evening/night bands).
- Window light changes color/intensity across the cycle (palette ramps, §7).
- **Shiro sleeps more at night**, is more active in daytime — ties animation state to time of day.
- **Small ambient animations:** e.g. curtain sway, plant leaves, dust motes in light beams, occasional passing bird/shadow at the window, clock tick. These are subtle and low-cost.

---

## 6. Rendering & scaling

- **Logical canvas resolution: `320 x 180`** (16:9 pixel grid). All art is authored against this.
- **Integer scaling**, centered; the **surrounding area is filled with the NES.css theme background**, not black bars.
  - Compute `scale = floor(min(winW/320, winH/180))`, minimum 1.
  - Draw everything at logical res, scale up with nearest-neighbor (`noSmooth()`).
- **Fullscreen canvas** with the CSS/canvas background painted theme color so there are never letterbox bars.
- **No CRT scanlines/vignette** (explicitly not chosen). Feedback came from squash/stretch, particles, and the day/night light instead.
- Target a steady **60 fps**; rendering is cheap (small logical buffer, few draw calls).

---

## 7. Palette

- **NES.css-derived, ~12 colors.** Sample the framework's greys/accents so the **UI shell and scene share one palette**.
- Organized as **named ramps** so the day/night cycle can lerp between them:
  - Room light ramp (dawn → day → dusk → night)
  - Cat ramp (white body, light-grey shading/outline, **pink** ear/pad accent)
  - UI ramp (maps to NES.css greys/accents)
- NES-inspired, **not** hardware-exact. The CSS theme will naturally skew it NES-like.
- Exact hex values to be listed in `config` (see §12) and tabled in a follow-up during implementation.

---

## 8. Art pipeline (pixel-grid helper via p5)

Chosen: **pixel-grid helper rendered through p5** — no external assets, fully diffable.

- **Sprite grid: `32 x 32`** pixels, defined as **arrays of palette-index rows** (e.g. strings like `"....1111...."` where digits map to palette entries).
- A reusable **`drawSprite()`** helper maps the grid to filled rects (or a `p5.Graphics` buffer) at logical scale.
- Frames/states are **data** (see §11 API): new sprites/frames are mostly authoring data, minimal code.
- Keeps everything in-repo, diffable, and trivially tweakable pixel-by-pixel.

---

## 9. Animation & state machine

**Full state machine** with transitions:

- **States:** `idle`, `walk`, `sit`, `sleep`, `react` (reaction/expression overlay).
- **Transitions:** time-driven + interaction-driven + time-of-day driven (e.g. `idle → sleep` at night; `idle → walk` on a wander timer; `any → react` on pet/play).
- **Idle micro-animations:** blink, ear twitch, tail sway (these give personality without a full state change).
- **Beat awareness:** motion can sync to the generated chiptune (bob, tempo-locked sway, beat-triggered reactions) — "the cat reacts to its own beat."

### Juice (all chosen)
- **Squash/stretch + anticipation** on motions and state changes.
- **Particle flourishes:** hearts (petting), `zzz` (sleep), music notes (playing), dust puffs.
- **Typewriter dialogue** in the NES.css box, character-by-character with a blinking cursor.

---

## 10. Interaction model

All on desktop + touch:

| Interaction | Behavior |
|---|---|
| **Pet (click / hold on cat)** | Raises **Mood**; purr reaction, hearts particle, sweet dialogue |
| **Eyes track cursor** | Shiro's gaze follows the pointer — cheap, high "alive" feel |
| **Drag to move** | Pick Shiro up and drop elsewhere in the room (respects room bounds) |
| **Play (click)** | Play animation; **drains Energy**, boosts **Mood**; note particles |

- Input normalized to **pointer events** so mouse + touch share one path.
- Passive mode: the scene keeps running with no input (ambient companion).

---

## 11. Stats, persistence, API

### Stats (meters)
- **Mood / Energy / Hunger.**
- **Slow / ambient pacing** — drift over **minutes**, not a demanding tamagotchi loop.
- Hunger rises over time; Energy drains with play/activity and refills with sleep; Mood responds to petting/play and decays gently.
- **Rendered as NES.css progress bars** in the window-frame HUD.
- May also gently reflect the music/beat but the primary driver is real time.

### Persistence
- **localStorage** remembers **Mood/Energy/Hunger** and the **mute setting** across visits.
- On load, values restore and settle toward baseline rather than snapping.

### Small reusable sprite API (system seed)
- e.g. `makeSprite(def)`, `drawSprite(sprite, x, y)`, a lightweight state-machine helper, and frame/palette lookups.
- Built so the **future sprite system** is mostly data (frame grids + state tables) rather than new code.

---

## 12. Architecture & files

**Module loading: ordered `<script>` tags with globals** (p5 is already a global) — zero friction with p5's style.

Proposed structure (names to finalize during build):

```
NES-cat/
  index.html            # ordered <script> tags + NES.css + fonts
  css/
    style.css           # theme bridge, layout, HUD positioning
  js/
    p5.js               # vendored (unchanged)
    addons/p5.sound.min.js
    config.js           # THE tuning surface: palette ramps, sizes, timings, decay rates
    palette.js          # named NES.css-derived color ramps + day/night lerp
    sprite.js           # pixel-grid defs + drawSprite() + state machine API
    shiro.js            # Shiro's frames, states, behaviors (uses sprite.js)
    scene.js            # room, window light, ambient animations, day/night
    input.js            # pointer/touch normalization (pet/drag/play/gaze)
    audio.js            # generative chiptune + mute + beat bus
    ui.js               # NES.css HUD wiring: title, dialogue, stat bars, start gate
    sketch.js           # p5 setup/draw orchestration only
```

- **`config.js` is central**: colors, sprite size, logical res, meter decay rates, beat tempo — tune the whole piece in one place.
- Load order respects dependencies (config → palette → sprite → shiro → scene → input → audio → ui → sketch).

### Layout
- **Fullscreen canvas + overlay panels**: canvas fills the window; **NES.css dialogue/stat panels float on top** as HUD.
- **Mobile: compact overlay** — panels shrink and tuck to edges; stats collapse to small bars to preserve immersion.
- **Title bar** (NES.css) plus a **window frame + stat bars**; **dialogue box** for Shiro's typewriter speech.

---

## 13. Audio

- **Procedural / generative chiptune**, synthesized in code via p5.sound (no binary assets).
- **Generative ambient** — no fixed melody; evolving tones that never repeat exactly. NES voices (square/triangle/noise) characterize it.
- **PRESS START gate:** a retro title screen; clicking/keypressing starts the music (satisfies browser autoplay rules and doubles as an intro).
- **Music ON after start, with a mute toggle** (NES.css control); mute state persists.
- The animation is **beat-aware** — the cat reacts to its own generated beat.

---

## 14. Repo housekeeping

- **Update `package.json`**: fix `name` (`nes-sprites` → `nes-cat`), `description`, and scripts (e.g. a `start` serving the folder); keep deps.
- **Update `README.md`**: describe NES-cat, Shiro, controls, day/night, sound, and how to run locally.
- No push. Commits only when Jem asks. *(Superseded — see the note at the top: Jem authorised the push afterwards.)*

---

## 15. Acceptance criteria ("done")

The single polished sprite is done when all of the following hold:

1. **Pixel fidelity + personality:** clearly reads as a NES-era white cat; charming in motion; crisp at every integer scale (no blur/uneven pixels).
2. **Feels alive / juice:** squash/stretch + anticipation present; blink/tail/ear idle motion; particles fire on pet/play/sleep.
3. **Cohesive scene + UI:** canvas, palette, Press Start 2P font, and the NES.css shell feel like one product.
4. **State machine works:** idle/walk/sit/sleep/react with smooth transitions; night raises sleep tendency.
5. **Real-time day/night** visibly changes room light and Shiro's behavior.
6. **Interactions work on desktop and touch:** pet, drag, play, eye-tracking.
7. **Audio:** PRESS START begins generative chiptune; mute toggles; animation is beat-aware.
8. **Stats render and evolve** slowly in NES.css bars; values persist via localStorage.
9. **Responsive:** desktop full-window; mobile compact overlay; no letterbox bars (theme-filled).
10. **Reusable API present:** `makeSprite`/`drawSprite`/state helpers usable for the next sprite.
11. Runs smoothly (≈60 fps) in a modern browser.

---

## 16. Assumptions & open items (confirm during build)

- Exact **palette hex values** and ramp stops are to be authored (NES.css-derived, ~12).
- Exact **module filenames** above are a proposal.
- **Real-time day/night** uses the **local device clock** (no location/weather API).
- Meter baseline/reset values and decay constants to be tuned in `config.js`.
- Dialogue lines and cat behaviors to be written during implementation (voice: soft, sweet).
- Shiro name is fixed; no separate window title rename beyond `NES-cat`.
