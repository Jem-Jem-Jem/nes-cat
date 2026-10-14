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
    BOWL_WATER_X: 46, BOWL_FOOD_X: 66, BOWL_GAP: 27, WINDOW_CX: 63,
    CAT_TREE_X: 213, TREE_GAP: 28,
    /* the window event the room tells the cat about */
    birdSighting: 0,
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
    updateBowls() {}, updateToy() {},
    /* Collision, matching scene.js's real spans: the cat tree's rope post and
     * the plant's pot. Deliberately the real numbers rather than a no-op, so
     * that a state which walks her somewhere the furniture now blocks is
     * caught here instead of only in a browser. */
    solids() {
      return [{ name: 'tree', x0: 209, x1: 217 }, { name: 'plant', x0: 260, x1: 282 }];
    },
    avoidSolids(x, halfW) {
      for (const s of this.solids()) {
        if (x + halfW <= s.x0 || x >= s.x1) continue;
        const left = s.x0 - halfW, right = s.x1 + halfW;
        x = (x - left <= right - x) ? left : right;
      }
      return Math.max(this.WALK_MIN_X, Math.min(this.WALK_MAX_X, x));
    }
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
  { state: 'sleep', secs: 6, night: true },
  { state: 'stretch', secs: 3 },
  { state: 'loaf', secs: 7 },
  { state: 'shake', secs: 1.2 },
  /* alert was decomposed into snap + hold (90d6af5). Both are listed because
   * a case that names a state the machine does not have is silently skipped,
   * and then its frames read as orphans — which is the only reason the check
   * noticed the missing coverage at all. */
  { state: 'alert_snap', secs: 2, payload: { then: 'alert_hold' } },
  { state: 'alert_hold', secs: 2 },
  { state: 'knead', secs: 5 },
  { state: 'react', secs: 3, payload: { say: 'pet' } },
  { state: 'walk', secs: 8, payload: { x: 40 } },
  { state: 'jump', secs: 1.4 },
  { state: 'pounce', secs: 4, before: s => { s.x = 200; } },
  /* pounce_approach is the walk that used to be phase 0 of pounce. It needs a
   * case of its own: a case naming a state the machine does not have is
   * silently skipped, and its frames then read as orphans. Same x=200 setup so
   * it is measured over the same 122px approach the old phase 0 covered. */
  { state: 'pounce_approach', secs: 4, before: s => { s.x = 200; } },
  { state: 'eat', secs: 8 },
  { state: 'drink', secs: 7 },
  { state: 'groom', secs: 5 },
  { state: 'wash', secs: 4 },
  { state: 'tree', secs: 9, before: s => { s.x = 240; } },
  /* tree_settle and scratch_settle are the beats where she stands still having
   * stopped reaching / stopped raking, so the turn pivots out of a finished
   * posture. Both need a case: a case naming a state the machine does not have
   * is silently skipped, and the frames they draw then read as orphans. Same
   * start x as the activity each one follows, so the approach is the real one. */
  { state: 'tree_settle', secs: 3, before: s => { s.x = 240; } },
  { state: 'watch', secs: 6 },
  { state: 'chase', secs: 6, before: s => { s.x = 200; } },
  { state: 'stalk', secs: 9, before: s => { s.x = 150; } },
  { state: 'circle', secs: 7, payload: { then: 'loaf' } },
  { state: 'scratch', secs: 7, before: s => { s.x = 250; } },
  { state: 'scratch_settle', secs: 3, before: s => { s.x = 250; } },
  { state: 'nod', secs: 7, night: true },
  { state: 'bump', secs: 2.5, payload: { say: null } },
  /* a held press never lets her leave `bump`, and that branch is chosen on a
   * slow breath rather than on the state's clock, so it needs its own pass */
  { state: 'bump', secs: 3, after: s => { s.petting = true; } },
  { state: 'ruffle', secs: 2.5 }
];

/* ---------- main -------------------------------------------------------- */

const argv = process.argv.slice(2);
const wantSoak = argv.includes('--soak');
const soakSeconds = wantSoak ? Number(argv[argv.indexOf('--soak') + 1] || 600) : 0;
/* --trace [secs]: secs is how long the trace soaks while hunting for rare
 * states. `watch` fires about three times per 600s, and that rarity is the
 * whole reason sampling missed it, so the default has to be long enough to
 * see it or the trace inherits the same blind spot it exists to remove. */
const wantTrace = argv.includes('--trace');
const traceSoak = wantTrace ? (Number(argv[argv.indexOf('--trace') + 1]) || 600) : 0;
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

/* ---------- --trace : every transition, including the invisible ones -------- */

/* Everything else in this file samples Shiro._sm.state AFTER update() runs, and
 * that can only ever see states which survive a frame. A state whose enter()
 * immediately hands off is entered and left inside a single sm.set() call,
 * before any update() has had a chance to run, so it is INVISIBLE to every
 * sampler here. `--seq watch` accordingly reported zero watch frames, and a
 * finding built on that declared the state dead while the selection pool held
 * three live entries into it.
 *
 * So the machine is tapped at sm.set() instead, which records nested calls too.
 * `depth` counts how many set() calls are still on the stack, so an edge taken
 * at depth > 0 was taken from inside some enter() — the invisible kind. */
function tapShiro(Shiro, edges) {
  const sm = Shiro._sm, real = sm.set.bind(sm);
  let depth = 0;
  sm.set = function (name, payload) {
    if (name === sm.state) return real(name, payload);
    edges.push({ from: sm.state, to: name, inEnter: depth > 0 });
    depth++;
    try { return real(name, payload); }
    finally { depth--; }
  };
  return function untap() { sm.set = real; };
}

function collapseEdges(edges) {
  const out = [];
  for (const e of edges) {
    const s = e.from + ' -> ' + e.to;
    const last = out[out.length - 1];
    if (last && last.s === s) last.n++;
    else out.push({ s, n: 1, inEnter: e.inEnter });
  }
  return out;
}
function edgeText(edges) {
  return collapseEdges(edges).map(o => (o.n > 1 ? o.s + ' x' + o.n : o.s)).join(' ');
}

/* Runs one CASES entry exactly as the coverage sweep in main() runs it, so the
 * trace and the check are looking at the same drives. Mirrors that reset
 * deliberately rather than sharing it: main()'s version is the one that has to
 * stay exactly as it is, and a helper would be one more thing to get wrong. */
function driveCase(Shiro, Scene, c, mark) {
  Scene._yarnX = 104; Scene.food = 1; Scene.water = 1;
  Scene.isNight = !!c.night;
  Shiro._sm.set('idle');
  Shiro.x = c.before ? 0 : 150;
  if (c.before) c.before(Shiro);
  if (Shiro._sm.state !== 'idle') Shiro._sm.set('idle');
  if (c.state === 'sleep') Shiro._awake = 0.3;
  if (c.state === 'loaf') Shiro._awake = 0.9;
  const pre = mark();
  Shiro._sm.set(c.state, c.payload || {});
  if (c.after) c.after(Shiro);
  run(Shiro, c.secs);
  if (c.after) Shiro.petting = false;
  /* the edge-log length at the moment this case's own entry transition was
   * about to be made, so the caller can slice out exactly this drive and the
   * reset's own `X -> idle` edges stay out of the trace. */
  return pre;
}

function traceMode(soakSeconds) {
  const { NESCAT, Scene } = loadShiro();
  const CFG = NESCAT.config;
  const Shiro = NESCAT.Shiro;
  Shiro.init();

  const edges = [];
  const untap = tapShiro(Shiro, edges);
  const mark = () => edges.length;

  console.log('\n== TRACE ==');
  console.log('tapping sm.set() so hand-offs from inside enter() are recorded too.');
  console.log('an edge tagged (enter) was taken before any update() could have run.');

  /* ---- 1. every CASES entry ---- */
  const seenIn = {};       /* state -> the case that first reached it */
  const missingCases = [];
  console.log('\n-- per CASES entry --');
  for (const c of CASES) {
    if (!Shiro._sm.states[c.state]) { missingCases.push(c); continue; }
    const pre = driveCase(Shiro, Scene, c, mark);
    const mine = edges.slice(pre);
    for (const e of mine) if (!(e.to in seenIn)) seenIn[e.to] = c.state;
    /* an empty line here is not a failure — a case whose state is already the
     * current one records no entry edge. Say so, or the reader has to guess. */
    console.log('  ' + (c.state + ' ').padEnd(18, '.') + ' ' +
      (mine.length ? edgeText(mine) : '(no transitions — she never left ' + c.state + ')'));
  }

  /* ---- 2. the blind spot, demonstrated on the state that caused it ---- */
  const wc = CASES.find(k => k.state === 'watch');
  if (wc && Shiro._sm.states.watch) {
    /* Count update ticks on which a post-update sampler would have seen
     * `watch`. This is the number the old instrument reported, and it is the
     * number a finding was built on. */
    const { NESCAT: N2, Scene: S2 } = loadShiro();
    const S = N2.Shiro;
    S.init();
    const ticks = {};
    let last = null;
    for (let i = 0; i < 60 * wc.secs; i++) {
      S.update(DT);
      const st = S._sm.state;
      ticks[st] = (ticks[st] || 0) + 1;
      if (st !== last) last = st;
    }
    const pre2 = driveCase(Shiro, Scene, wc, mark);
    const we = edges.slice(pre2);

    console.log('\n-- PROOF: the hand-off no post-update() sampler can see --');
    console.log('  state            : watch');
    console.log('  ticks a post-update() sampler observed it on : ' + (ticks.watch || 0));
    console.log('    (this is the number "--seq watch" reports, and the');
    console.log('     number the "dead state" finding was built on)');
    console.log('  the same drive, tapped at sm.set()            :');
    console.log('      ' + edgeText(we));
    for (const e of collapseEdges(we)) {
      if (e.inEnter) console.log('        ^ "' + e.s + '" was taken inside an enter()');
    }
    console.log('  transitions INTO watch recorded              : ' +
      we.filter(e => e.to === 'watch').length);
    console.log('  _watchDir after (written only by watch.enter): ' + Shiro._watchDir);
  }

  /* ---- 3. soak, long enough for the rare ones ---- */
  console.log('\n-- soak ' + soakSeconds + 's --');
  const beforeSoak = edges.length;
  for (let i = 0; i < Math.round(soakSeconds / DT); i++) {
    if (i % 120 === 0) { Scene.food = 1; Scene.water = 1; Scene.isNight = Math.random() < 0.3; }
    if (i % 900 === 0) Scene.birdSighting = 1; else if (i % 900 === 60) Scene.birdSighting = 0;
    Shiro._awake = 0.3 + Math.random() * 0.7;
    Shiro._sinceFood = Math.random() * CFG.BEHAVIOR.foodGap * 1.4;
    Shiro._sinceWater = Math.random() * CFG.BEHAVIOR.drinkGap * 1.4;
    Shiro._sinceSleep = Math.random() * CFG.BEHAVIOR.sinceSleepGap * 1.4;
    try { Shiro.update(DT); }
    catch (e) { console.log('  THREW at soak step ' + i + ': ' + e.message); break; }
  }
  const soakEdges = edges.slice(beforeSoak);
  const soakTally = {};
  for (const e of soakEdges) soakTally[e.to] = (soakTally[e.to] || 0) + 1;
  console.log('  ' + soakEdges.length + ' transitions, ' +
    Object.keys(soakTally).length + ' distinct states entered');
  const intoWatch = Object.keys(soakEdges).length ? soakEdges.filter(e => e.to === 'watch') : [];
  if (intoWatch.length) {
    console.log('  entered `watch` ' + intoWatch.length + ' time(s) with nobody touching' +
      ' anything: ' + collapseEdges(intoWatch).map(o => o.s + ' x' + o.n).join('  '));
  }

  /* ---- 4. account for every state in the machine ---- */
  const src = fs.readFileSync(path.join(ROOT, 'shiro.js'), 'utf8');
  const mentions = n => src.split("'" + n + "'").length - 1;
  /* Self-test. The two "not observed" branches below only run when a state is
   * missing from the run, which is exactly when something has already gone
   * wrong — so on a healthy tree they never execute and stay untested. An
   * unexercised branch in a measurement instrument is the failure this whole
   * brief exists to end, so prove the counter discriminates before trusting
   * the table that depends on it. */
  const stAbsent = mentions('__no_such_state__');
  const stPresent = mentions('watch');
  const stOk = stAbsent === 0 && stPresent > 0;
  console.log('\n-- static scan self-test --');
  console.log("  mentions('__no_such_state__') = " + stAbsent + '  (want 0)');
  console.log("  mentions('watch')            = " + stPresent + '  (want > 0)');
  console.log('  counter discriminates: ' + (stOk ? 'OK' : 'BROKEN — the table below is not evidence'));

  const names = Object.keys(Shiro._sm.states);
  const observed = [], reachableOnly = [], candidates = [];
  for (const n of names) {
    const n1 = soakTally[n] || 0;
    const n2 = edges.slice(0, beforeSoak).filter(e => e.to === n).length;
    const total = n1 + n2;
    const m = mentions(n);
    if (total > 0) observed.push({ n, total, cases: n2, soak: n1, first: seenIn[n] });
    else if (m > 0) reachableOnly.push({ n, m });
    else candidates.push({ n, m });
  }

  console.log('\n== ACCOUNTING : ' + names.length + ' states in the machine ==');
  console.log('OBSERVED transitioning (' + observed.length + ')');
  for (const s of observed.sort((a, b) => a.n.localeCompare(b.n))) {
    console.log('  ' + s.n.padEnd(18) + String(s.total).padStart(5) + ' transitions   ' +
      (s.cases ? 'via case `' + s.first + '`' : 'soak only'));
  }
  console.log('NOT OBSERVED, but has source-level entry points (' + reachableOnly.length + ')');
  for (const s of reachableOnly) {
    console.log('  ' + s.n.padEnd(18) + String(0).padStart(5) + ' transitions   ' +
      "'" + s.n + "' appears " + s.m + "x in shiro.js — reachable in principle, just rare");
  }
  console.log('NO SOURCE ENTRY POINT AND NEVER OBSERVED (' + candidates.length + ')');
  for (const s of candidates) {
    console.log('  ' + s.n.padEnd(18) + String(0).padStart(5) + ' transitions   ' +
      "'" + s.n + "' appears " + s.m + "x in shiro.js — DEAD CANDIDATE");
  }
  if (!candidates.length) console.log('  (none)');

  untap();

  if (missingCases.length) {
    console.log('');
    console.log('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('  !  SILENT SKIP — ' + missingCases.length + ' CASES entr' +
      (missingCases.length === 1 ? 'y names' : 'ies name') + ' a state the machine lacks:');
    missingCases.forEach(c => console.log('  !    "' + c.state + '" -> no such state. Covers nothing.'));
    console.log('  !    Any frame it would have drawn reads as an ORPHAN below,');
    console.log('  !    and the orphan list reads as a bug in the art. It is not.');
    console.log('  !    Build the state or delete the case. Never leave it silent.');
    console.log('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  }
  console.log('\nTRACE OK — ' + names.length + ' states accounted for, ' +
    observed.length + ' observed, ' + reachableOnly.length + ' reachable-but-unseen, ' +
    candidates.length + ' dead candidates, ' + soakEdges.length + ' soak transitions');
}

function main() {
  if (wantSeq) {
    const i = argv.indexOf('--seq');
    dumpSequence(argv[i + 1], Number(argv[i + 2]) || 0);
    return;
  }
  if (wantTrace) {
    traceMode(traceSoak);
    return;
  }
  const { NESCAT, Scene, calls } = loadShiro();
  const CFG = NESCAT.config;
  const Shiro = NESCAT.Shiro;
  Shiro.init();

  let bad = 0;
  const notes = [];

  /* ---- 1. every state, entered cold ---- */

  /* A CASES entry naming a state the machine does not have used to be dropped
   * by a bare `continue`, in silence. The consequence is not cosmetic: the case
   * covers nothing, so any frame it would have drawn reads as an ORPHAN, and
   * the orphan list then gets reported as a bug in the art. That has already
   * cost a cycle. So it is collected and named, loudly, on every run.
   *
   * It is a warning rather than a hard failure because one such entry exists
   * today (`ruffle`), and failing the check over a known-and-named gap would
   * mean nobody could run the check at all. Naming it is the fix; the removal
   * of the entry is a decision for whoever owns the state list. */
  const missingCases = [];
  for (const c of CASES) {
    if (!Shiro._sm.states[c.state]) { missingCases.push(c); continue; }
    /* reset to a known place, state and clock */
    Scene._yarnX = 104; Scene.food = 1; Scene.water = 1;
    /* sleeping rolls a chance to wake itself in daylight, so a case that
     * wants to watch her actually sleep has to say so — otherwise sleep_0
     * and sleep_1 come and go depending on the dice and the coverage
     * sweep reports them as orphans. */
    Scene.isNight = !!c.night;
    calls.length = 0;
    Shiro._sm.set('idle');
    Shiro.x = c.before ? 0 : 150;
    if (c.before) c.before(Shiro);
    if (Shiro._sm.state !== 'idle') Shiro._sm.set('idle');
    /* the gaps and how awake she is — the three meters, replaced. Setting
     * these is what the old coverage sweep did to the energy bar. */
    if (c.state === 'sleep') Shiro._awake = 0.3;
    if (c.state === 'loaf') Shiro._awake = 0.9;

    Shiro._sm.set(c.state, c.payload || {});
    /* `after` is a one-off setup that has to run after the reset above and be
     * undone afterwards — e.g. setting `petting`, which is what makes a press
     * hold her in `bump` instead of letting it run out. */
    if (c.after) c.after(Shiro);
    const r = run(Shiro, c.secs);
    if (c.after) Shiro.petting = false;

    if (r.missing.length) {
      bad += r.missing.length;
      const uniq = [...new Set(r.missing.map(m => m.state + ' -> ' + m.frame))];
      uniq.forEach(u => console.log('MISSING  ' + c.state + ': ' + u));
    }
    /* the old per-case `path / frames / poked` dump used to print here, off
     * r.seenStates — a post-update() sample, which is the very blind spot
     * traceMode() exists to remove. --trace is now a mode of its own. */
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
      /* Jitter the room and her clock so the gated activities keep
       * unlocking. The gaps are pushed forward and back rather than the old
       * meters being re-rolled, because that is what they now are: a running
       * account, not a random number. */
      if (i % 120 === 0) { Scene.food = 1; Scene.water = 1; Scene.isNight = Math.random() < 0.3; }
      Shiro._awake = 0.3 + Math.random() * 0.7;
      Shiro._sinceFood = Math.random() * CFG.BEHAVIOR.foodGap * 1.4;
      Shiro._sinceWater = Math.random() * CFG.BEHAVIOR.drinkGap * 1.4;
      Shiro._sinceSleep = Math.random() * CFG.BEHAVIOR.sinceSleepGap * 1.4;
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
    Scene.isNight = !!c.night;
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

  if (missingCases.length) {
    console.log('');
    console.log('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('  !  SILENT SKIP — ' + missingCases.length + ' CASES entr' +
      (missingCases.length === 1 ? 'y names' : 'ies name') + ' a state the machine does not have:');
    missingCases.forEach(c => console.log('  !    "' + c.state + '" -> no such state. It covers nothing.'));
    console.log('  !    This used to be dropped without a word. The cost is that any');
    console.log('  !    frame it would have drawn reads as an ORPHAN, and the orphan');
    console.log('  !    list reads as a bug in the art. Build the state or delete the');
    console.log('  !    case — but never let it fail silently again.');
    console.log('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  }

  /* The state count used to be the number of CASES entries that matched a
   * state, which is coverage, not size — it read "29 states" for a machine with
   * 31 in it, and the two missing were invisible. Both numbers now, so the gap
   * between what exists and what is covered cannot be misread as coverage. */
  const machineStates = Object.keys(Shiro._sm.states).length;
  const coveredStates = CASES.filter(c => Shiro._sm.states[c.state]).length;
  console.log(bad === 0
    ? 'ANIMATION CHECK OK — ' + machineStates + ' states in the machine, ' + coveredStates +
      ' covered by a CASES entry, all frames resolve, no view cuts' +
      (missingCases.length ? ', ' + missingCases.length + ' CASES entries skipped (named above)' : '') +
      (orphans.length ? ', ' + orphans.length + ' orphan frames' : '')
    : 'ANIMATION CHECK FAIL — ' + bad + ' problems');
  process.exit(bad === 0 ? 0 : 1);
}

main();
