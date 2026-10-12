/* ============================================================
 * NES-cat — tools/check-animations.js   (verification tool, Node)
 *
 * Drives the real Shiro state machine headlessly — the same
 * config.js / frames.js / sprite.js / shiro.js the browser loads,
 * with Scene, palette and audio stubbed — and asserts that every
 * frame she asks to draw actually exists.
 *
 * Why this exists: `pickFrame()` falls back to the base pose when a
 * composed name is missing, which is exactly the right runtime
 * behaviour and exactly why a typo in a frame name is invisible
 * until you stare at the canvas. This asserts the *strict* version:
 * every requested frame resolves, and every state can be reached.
 *
 *   node tools/check-animations.js            # summary
 *   node tools/check-animations.js --soak 600 # 10 minutes of sim at 60fps
 *   node tools/check-animations.js --trace    # print state -> frames seen
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'NES-cat', 'js');
const DT = 1 / 60;

/* ---------- load the real modules into a sandbox ---------------------- */

function loadShiro() {
  const store = {};
  const sandbox = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    performance: { now: () => 0 },
    console
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  /* Scene: geometry Shiro reads, plus the impulses she pokes. Stubs record
   * what was called so the harness can assert an activity actually reached
   * its fixture rather than silently running in place. */
  const calls = [];
  const Scene = {
    FLOOR_TOP: 116, FEET_Y: 142, WALK_MIN_X: 18, WALK_MAX_X: 268,
    BOWL_WATER_X: 46, BOWL_FOOD_X: 66, CAT_TREE_X: 214,
    YARN_MIN_X: 92, YARN_MAX_X: 138,
    light: { ambient: '#8899aa', ambientAmt: 0, isNight: false },
    hour: 12, second: 0, time: 0, isNight: false,
    food: 1, water: 1,
    _yarnX: 104, _yarnFrom: 104, _yarnTo: 104, _yarnGap: 999, _yarnAnim: 0,
    _toySwing: 0, _toySwingV: 0,
    pokeToy(power) { calls.push(['pokeToy', power]); },
    nudgeYarn(fromX, power) { calls.push(['nudgeYarn', fromX, power]); },
    takeFood() { this.food = Math.max(0, this.food - 0.34); calls.push(['takeFood']); return this.food; },
    takeWater() { this.water = Math.max(0, this.water - 0.34); calls.push(['takeWater']); return this.water; },
    updateBowls() {}, updateToy() {}
  };
  sandbox.NESCAT = { Scene, calls };

  ['config.js', 'palette.js', 'frames.js', 'sprite.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  });
  /* palette.js wants a colour table; the cat only needs charColor() */
  if (!sandbox.NESCAT.palette) sandbox.NESCAT.palette = {};
  if (!sandbox.NESCAT.palette.charColor) {
    sandbox.NESCAT.palette.charColor = () => '#ffffff';
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shiro.js'), 'utf8'), sandbox, { filename: 'shiro.js' });

  const NESCAT = sandbox.NESCAT;
  NESCAT.Audio = { started: false, muted: true, pulse: 0 };
  return { NESCAT, Scene, calls, sandbox };
}

/* ---------- tiny runner ------------------------------------------------ */

/* Steps Shiro for `seconds` of simulated time at a fixed 60 Hz, collecting
 * every state entered and every frame requested. Returns a transcript. */
function run(Shiro, seconds, opts) {
  opts = opts || {};
  const seenStates = [];
  const seenFrames = [];
  const missing = [];
  let last = null;

  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    if (opts.each) opts.each(i);
    if (!opts.hold) Shiro.update(DT);
    const st = Shiro._sm.state;
    if (st !== last) { seenStates.push(st); last = st; }
    let f;
    try {
      f = Shiro.frameFor();
    } catch (e) {
      missing.push({ state: st, frame: '<threw: ' + e.message + '>' });
      continue;
    }
    seenFrames.push(f);
    if (!Shiro.sprite.frames[f]) missing.push({ state: st, frame: f });
  }
  return { seenStates, seenFrames, missing, unique: [...new Set(seenFrames)] };
}

/* ---------- per-state coverage ---------------------------------------- */

/* Each state is entered cold from `idle`, then run for a generous window.
 * `before` optionally moves her first (e.g. to the far side of the room). */
const CASES = [
  { state: 'idle', secs: 8 },
  { state: 'sit', secs: 8 },
  { state: 'sleep', secs: 6 },
  { state: 'stretch', secs: 3 },
  { state: 'loaf', secs: 7 },
  { state: 'shake', secs: 1.2 },
  { state: 'alert', secs: 2 },
  { state: 'knead', secs: 5 },
  { state: 'react', secs: 3, payload: { say: 'pet' } },
  { state: 'walk', secs: 8, payload: { x: 40 } },
  { state: 'jump', secs: 1.4 },
  { state: 'pounce', secs: 4, before: s => { s.x = 200; } },
  { state: 'eat', secs: 8 },
  { state: 'drink', secs: 7 },
  { state: 'groom', secs: 5 },
  { state: 'wash', secs: 4 },
  { state: 'tree', secs: 9, before: s => { s.x = 240; } },
  { state: 'watch', secs: 6 },
  { state: 'chase', secs: 6 },
  { state: 'stalk', secs: 5 },
  { state: 'circle', secs: 7 },
  { state: 'ruffle', secs: 2.5 }
];

/* ---------- main -------------------------------------------------------- */

const argv = process.argv.slice(2);
const wantSoak = argv.includes('--soak');
const soakSeconds = wantSoak ? Number(argv[argv.indexOf('--soak') + 1] || 600) : 0;
const wantTrace = argv.includes('--trace');
const wantSeq = argv.includes('--seq');

/* --seq <state>: print the raw frame sequence for one state, in order and
 * with repeats, because a de-duplicated trace cannot show whether a bridge
 * actually played or whether two identical frames were drawn back to back. */
function dumpSequence(state, secs) {
  const { NESCAT, Scene } = loadShiro();
  const Shiro = NESCAT.Shiro;
  Shiro.init();
  Scene._yarnX = 104; Scene.food = 1; Scene.water = 1;
  Shiro._sm.set('idle');
  Shiro.x = 150;
  const c = CASES.find(k => k.state === state);
  if (c && c.before) { Shiro.x = 0; c.before(Shiro); }
  Shiro._sm.set(state, (c && c.payload) || {});
  const frames = [];
  const states = [];
  const steps = Math.round((secs || (c && c.secs) || 6) / DT);
  for (let i = 0; i < steps; i++) {
    Shiro.update(DT);
    states.push(Shiro._sm.state);
    frames.push(Shiro.frameFor());
  }
  console.log('\n== ' + state + ' raw sequence ==');
  /* collapse runs: at 60fps an un-collapsed sequence is 300 tokens of noise,
   * and the thing worth reading is the order and the dwell on each pose */
  console.log('  ' + collapse(states));
  console.log('  ' + collapse(frames));
  const bad = frames.filter(f => !Shiro.sprite.frames[f]);
  if (bad.length) console.log('  MISSING: ' + [...new Set(bad)].join(' '));
}

/* "a a a b b c" -> "a x3 b x2 c" */
function collapse(list) {
  const out = [];
  for (const v of list) {
    const last = out[out.length - 1];
    if (last && last.v === v) last.n++;
    else out.push({ v, n: 1 });
  }
  return out.map(o => (o.n > 1 ? o.v + ' x' + o.n : o.v)).join(' ');
}

function main() {
  if (wantSeq) {
    const i = argv.indexOf('--seq');
    dumpSequence(argv[i + 1], Number(argv[i + 2]) || 0);
    return;
  }
  const { NESCAT, Scene, calls } = loadShiro();
  const Shiro = NESCAT.Shiro;
  Shiro.init();

  let bad = 0;
  const notes = [];

  /* ---- 1. every state, entered cold ---- */
  for (const c of CASES) {
    if (!Shiro._sm.states[c.state]) continue;         /* not implemented yet */
    /* reset to a known place and state */
    Scene._yarnX = 104; Scene.food = 1; Scene.water = 1;
    calls.length = 0;
    Shiro._sm.set('idle');
    Shiro.x = c.before ? 0 : 150;
    if (c.before) c.before(Shiro);
    if (Shiro._sm.state !== 'idle') Shiro._sm.set('idle');
    if (c.state === 'sleep') Shiro.meters.energy = 0.3;
    if (c.state === 'loaf') Shiro.meters.energy = 0.9;

    Shiro._sm.set(c.state, c.payload || {});
    const r = run(Shiro, c.secs);

    if (r.missing.length) {
      bad += r.missing.length;
      const uniq = [...new Set(r.missing.map(m => m.state + ' -> ' + m.frame))];
      uniq.forEach(u => console.log('MISSING  ' + c.state + ': ' + u));
    }
    if (wantTrace) {
      console.log('\n== ' + c.state + ' ==');
      console.log('  path   : ' + r.seenStates.join(' -> '));
      console.log('  frames : ' + r.unique.join(' '));
      if (calls.length) console.log('  poked  : ' + calls.map(x => x[0]).join(', '));
    }
    if (c.state !== 'idle' && r.seenStates.length > 1) {
      notes.push(c.state + ' -> ' + r.seenStates.slice(1).join(' -> '));
    }
  }

  /* ---- 2. transitions must not hard-cut between the two views ----
   * A profile state handing straight to `idle` is a view pop: the last
   * frame is side_* and the next is a front pose, with nothing drawn
   * between. The turn state exists precisely to bridge that, so every
   * profile state has to route through it. */
  const { NESCAT: N2 } = loadShiro();
  const S2 = N2.Shiro;
  S2.init();
  const VIEW_CUTS = [];
  for (const name of Object.keys(S2._sm.states)) {
    S2._sm.set('idle');
    S2.x = 150;
    S2._sm.set(name, {});
    /* run until she leaves the state (or the window expires) */
    let left = null, prevFrame = null;
    for (let i = 0; i < 60 * 25; i++) {
      S2.update(DT);
      if (S2._sm.state === name) { prevFrame = S2.frameFor(); continue; }
      left = S2._sm.state;
      break;
    }
    if (!left || !prevFrame) continue;
    /* what is the first frame of the state she landed in? */
    const nextFrame = S2.frameFor();
    const side = f => f.indexOf('side_') === 0;
    /* A turn is exempt, and so is anything that *ended* on a three-quarter
     * frame: side_turn_1 is the bridge art, drawn deliberately between the
     * two views, so stepping from it onto the front pose is the last beat
     * of a rotation rather than a cut. What must never happen is a settled
     * profile pose — side_eat_2, side_walk_3 — handing straight to a front
     * one with nothing drawn between. */
    const bridge = prevFrame.indexOf('side_turn_') === 0;
    if (side(prevFrame) && !side(nextFrame) && !bridge) {
      VIEW_CUTS.push(name + ' -> ' + left + ' (' + prevFrame + ' then ' + nextFrame + ')');
    }
  }
  if (VIEW_CUTS.length) {
    bad += VIEW_CUTS.length;
    VIEW_CUTS.forEach(v => console.log('VIEW CUT  ' + v));
  }

  /* ---- 3. soak: let her decide what to do for a long time ---- */
  if (wantSoak) {
    const soakMiss = [];
    let prev = null;
    const soakStates = new Set();
    const soakFrames = new Set();
    const steps = Math.round(soakSeconds / DT);
    for (let i = 0; i < steps; i++) {
      /* jitter the room so gated activities keep unlocking */
      if (i % 120 === 0) { Scene.food = 1; Scene.water = 1; Scene.isNight = Math.random() < 0.3; }
      Shiro.meters.energy = 0.25 + Math.random() * 0.7;
      Shiro.meters.hunger = Math.random();
      try {
        Shiro.update(DT);
      } catch (e) {
        soakMiss.push('threw at step ' + i + ' in ' + Shiro._sm.state + ': ' + e.message);
        break;
      }
      const st = Shiro._sm.state;
      soakStates.add(st);
      if (st !== prev) { prev = st; }
      const f = Shiro.frameFor();
      soakFrames.add(f);
      if (!Shiro.sprite.frames[f]) {
        soakMiss.push('step ' + i + ' in ' + st + ' asked for missing frame ' + f);
        if (soakMiss.length > 8) break;
      }
      /* she must never leave the room */
      if (Shiro.x < Scene.WALK_MIN_X - 14 || Shiro.x > Scene.WALK_MAX_X + 14) {
        soakMiss.push('step ' + i + ': x escaped to ' + Shiro.x.toFixed(1));
        break;
      }
    }
    bad += soakMiss.length;
    soakMiss.forEach(m => console.log('SOAK      ' + m));
    console.log('\nsoak ' + soakSeconds + 's: ' + steps + ' frames, ' +
      soakStates.size + ' states, ' + soakFrames.size + ' distinct frames');
    console.log('  states: ' + [...soakStates].sort().join(' '));
  }

  /* ---- 4. every frame in the table is reachable from some state ----
   * Orphans are not failures — the composed flourish variants are only
   * reached when a blink or a tail sweep happens to land on them — but
   * they are the frames most likely to have been drawn wrong and never
   * noticed, so the tool names them. */
  const used = new Set();
  for (const c of CASES) {
    if (!Shiro._sm.states[c.state]) continue;
    Shiro._sm.set('idle'); Shiro.x = 150;
    Shiro._sm.set(c.state, c.payload || {});
    const r = run(Shiro, c.secs);
    r.unique.forEach(f => used.add(f));
  }

  /* The walk cycle is stepped by distance, not by a clock, so a short or
   * lucky walk only ever reaches some of the six frames. Force the stride. */
  Shiro._sm.set('walk', { x: NESCAT.Scene.WALK_MIN_X });
  Shiro._walkStartX = NESCAT.Scene.WALK_MAX_X;
  Shiro.x = NESCAT.Scene.WALK_MAX_X;
  for (let i = 0; i < 60 * 12 && Shiro._sm.is('walk'); i++) {
    Shiro.update(DT);
    used.add(Shiro.frameFor());
  }

  /* Flourishes are randomly rolled and blink timings are arbitrary, so
   * drive them explicitly rather than hoping a long run hits every
   * composed base+suffix pair. */
  const B = NESCAT.config.BEHAVIOR;
  /* two blink phases matter: not blinking (base `_open`) and fully shut
   * (base `_closed`). The half-shut phase resolves to "closed" in pickFrame's
   * composed names, so covering the two ends covers the pair. The breathing
   * phase doubles that again, because the tail variants exist for both the
   * `_open` and the `_breathe` bases and nothing but timing picks between. */
  const EYES = [{ name: 'open', show: 0 }, { name: 'closed', show: B.blinkDur * 0.5 }];
  const LUNGS = [{ name: 'still', bob: 0 }, { name: 'breathing', bob: Math.PI / 2 }];
  for (const kind of Object.keys(B.flourishDur)) {
    for (const host of ['idle', 'sit']) {
      for (const eye of EYES) {
        for (const lungs of LUNGS) {
          Shiro._sm.set(host);
          Shiro.look = 0;
          const steps = Math.round(B.flourishDur[kind] / DT);
          for (let i = 0; i < steps; i++) {
            Shiro._blinkShow = eye.show;
            Shiro._bob = lungs.bob;
            Shiro._flourish = { kind, t: i * DT, dur: B.flourishDur[kind] };
            used.add(Shiro.frameFor());
          }
        }
      }
    }
  }
  /* and the idle gaze / blink pair, both bases */
  for (const look of [-1, 0, 1]) {
    for (const blinkShow of [0, B.blinkDur * 0.5, B.blinkDur * 0.001]) {
      Shiro._sm.set('idle'); Shiro._flourish = null;
      Shiro.look = look; Shiro._blinkShow = blinkShow; Shiro._bob = 2;
      used.add(Shiro.frameFor());
      Shiro._bob = 0;
      used.add(Shiro.frameFor());
    }
  }

  /* carried frames are driven by the drag clock, not the machine, so the
   * drag has to start ONCE and then run — restarting each step would
   * reset _carryT and she would never get past the "!" */
  Shiro.dragStart();
  for (let i = 0; i < 60 * 4; i++) {
    if (i % 6 === 0) Shiro.dragTo(Shiro.x, 100);
    Shiro.update(DT);
    used.add(Shiro.frameFor());
  }
  Shiro.dragEnd();
  Shiro._flourish = null;

  const all = Object.keys(Shiro.sprite.frames);
  const orphans = all.filter(f => !used.has(f));
  if (orphans.length) {
    console.log('\nORPHAN    ' + orphans.length + ' frames never drawn: ' + orphans.join(' '));
  }

  /* ---- summary ---- */
  console.log('');
  if (notes.length) console.log('paths: ' + notes.join(' | '));
  console.log(bad === 0
    ? 'ANIMATION CHECK OK — ' + CASES.filter(c => Shiro._sm.states[c.state]).length +
      ' states, all frames resolve, no view cuts' +
      (orphans.length ? ', ' + orphans.length + ' orphan frames' : '')
    : 'ANIMATION CHECK FAIL — ' + bad + ' problems');
  process.exit(bad === 0 ? 0 : 1);
}

main();
