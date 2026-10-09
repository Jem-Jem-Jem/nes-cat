/* ============================================================
 * NES-cat — tools/build-sprites.js   (authoring tool, Node)
 *
 * Builds the literal 32x32 pixel-frame rows for Shiro and writes
 * them to NES-cat/js/frames.js as plain data (rows of chars).
 *
 * Why a tool: hand-typing 32x32 grids is error-prone. This keeps
 * the shapes parametric and reproducible, while the *shipped*
 * frames stay literal, diffable data (see spec A-8).
 *
 *   node tools/build-sprites.js --preview   # print frames as ASCII
 *   node tools/build-sprites.js --check     # sanity-check every frame
 *   node tools/build-sprites.js --build     # write frames.js
 *
 * Shiro is drawn in SIDE view, facing RIGHT. Sprite.draw() mirrors
 * her horizontally to face left, so every frame here is authored
 * right-facing only and never both ways.
 *
 * Layer order (back to front) is what gives the sprite its depth:
 *   tail -> far legs (shaded) -> body + near legs -> head -> face
 * Far legs sit behind the body so they never cut a seam through it.
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const W = 32;
const H = 32;

/* ---------- tiny raster helpers ------------------------------------ */

function grid() {
  return Array.from({ length: H }, () => new Array(W).fill('.'));
}
function emptyMask() {
  return Array.from({ length: H }, () => new Array(W).fill(false));
}
function maskOr(...ms) {
  const m = emptyMask();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (const a of ms) if (a[y][x]) { m[y][x] = true; break; }
  }
  return m;
}
function maskEllipse(cx, cy, rx, ry) {
  const m = emptyMask();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - cx) / rx;
    const dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) m[y][x] = true;
  }
  return m;
}
/* A leg: a short vertical capsule from `topY` down to `footY`. */
function maskLeg(x, topY, footY, w) {
  const cy = (topY + footY) / 2, ry = Math.max(0.5, (footY - topY) / 2);
  return maskEllipse(x, cy, w / 2, ry);
}
function maskTri(ax, ay, bx, by, cx2, cy2) {
  const m = emptyMask();
  const sign = (px, py, x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = x + 0.5, py = y + 0.5;
    const d1 = sign(px, py, ax, ay, bx, by);
    const d2 = sign(px, py, bx, by, cx2, cy2);
    const d3 = sign(px, py, cx2, cy2, ax, ay);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    m[y][x] = !(neg && pos);
  }
  return m;
}
/* Paint a mask as `fill`, with any pixel touching "outside" (4-way) as `outline`. */
function paint(G, m, fill, outline) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y][x]) continue;
    const edge =
      !(y > 0 && m[y - 1][x]) || !(y < H - 1 && m[y + 1][x]) ||
      !(x > 0 && m[y][x - 1]) || !(x < W - 1 && m[y][x + 1]);
    G[y][x] = edge ? outline : fill;
  }
}
function px(G, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = c;
}
/* Stamp a soft 2-3px wide blob along a quadratic bezier (for the tail). */
function stampCurve(G, p0, p1, p2, radius, fill, outline) {
  const m = emptyMask();
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    const r = radius * (1 - 0.35 * t);
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      const dx = xx + 0.5 - x, dy = yy + 0.5 - y;
      if (dx * dx + dy * dy <= r * r) m[yy][xx] = true;
    }
  }
  paint(G, m, fill, outline);
  return m;
}

/* ---------- the cat ------------------------------------------------- */

/* Canonical rig. Every pose is this skeleton with some values nudged, so
 * new animations stay in proportion without re-deriving the whole cat.
 *
 *   FLOOR    the row her paws rest on; nothing may be drawn below it
 *   body     torso ellipse (long axis horizontal = side view)
 *   head     skull circle, set forward at the front end of the body
 *   legs     [farBack, farFront, nearBack, nearFront] each {x, lift}
 *            `lift` > 0 raises the paw (a step), < 0 lowers it
 *   tail     {sway, lift, curl} — sway pushes it back, lift raises it,
 *            curl bends the tip
 */
const FLOOR = 29.0;

const RIG = {
  body: { x: 15.0, y: 21.0, rx: 8.5, ry: 4.8 },
  head: { x: 22.5, y: 13.5, rx: 6.0, ry: 5.5 },
  legs: {
    farBack:   { x: 7.0,  lift: 0 },
    farFront:  { x: 17.0, lift: 0 },
    nearBack:  { x: 12.0, lift: 0 },
    nearFront: { x: 22.0, lift: 0 }
  },
  tail: { sway: 0, lift: 0, curl: 0 },
  LEG_TOP: 24.0,
  LEG_W: 4
};

function buildCat(o) {
  o = Object.assign({
    bodyX: 0, bodyY: 0, bodyRX: null, bodyRY: null, squash: 0,
    headDY: 0, headDX: 0,
    legs: {}, tail: {}, earPerk: 0,
    eyes: 'open', look: 0, mouth: 'smile', blush: false
  }, o);

  const G = grid();

  const bx = RIG.body.x + o.bodyX;
  const by = RIG.body.y + o.bodyY;
  const bodyRX = o.bodyRX == null ? RIG.body.rx : o.bodyRX;
  const bodyRY = (o.bodyRY == null ? RIG.body.ry : o.bodyRY) + o.squash;
  const hx = RIG.head.x + o.headDX + o.bodyX;
  const hy = RIG.head.y + o.headDY + o.bodyY;
  const legTop = RIG.LEG_TOP + o.bodyY;

  /* Leg helper: a leg's foot rides `lift` px above the floor line, and its
   * column comes from the rig (a pose may override either). `hide: true`
   * drops the leg entirely — used by poses that tuck their paws under. */
  const legOf = key => Object.assign({}, RIG.legs[key], o.legs[key] || {});
  const leg = key => {
    const L = legOf(key);
    return maskLeg(L.x + o.bodyX, legTop, FLOOR - 1 - (L.lift || 0), RIG.LEG_W);
  };
  /* An empty mask for a hidden leg, so callers can still OR it in. */
  const legShown = (key, m) => (legOf(key).hide ? emptyMask() : m);
  const legsOf = keys => maskOr(...keys.map(k => legShown(k, leg(k))));

  /* ---- tail (behind everything) ---- */
  /* The base sits a little inside the rump so the tail always reads as
   * attached, then arcs up and back. `lift` raises it, `curl` bends the tip. */
  const T = Object.assign({}, RIG.tail, o.tail);
  const tBaseX = bx - bodyRX + 2.5;
  stampCurve(G,
    [tBaseX, by - 0.5],
    [tBaseX - 3.2 - T.sway, by - 1.5 - T.lift],
    [tBaseX - 5.0 - T.sway + T.curl, by - 8.0 - T.lift * 1.6 + T.curl],
    2.4, 'W', 'K');

  /* ---- far legs (deep shade, behind the torso) ----
   * 'G' rather than the belly's 'H' so they still read as a separate,
   * further-away pair instead of blending into the shaded underside. */
  paint(G, legsOf(['farBack', 'farFront']), 'G', 'K');

  /* ---- torso ---- */
  const bodyMask = maskEllipse(bx, by, bodyRX, bodyRY);
  /* An ellipse always tapers to a 1-4px nub at the bottom, which moves when
   * the body squashes and reads as a stray pixel. Cut flat at FLOOR. */
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y + 0.5 > FLOOR) bodyMask[y][x] = false;
  paint(G, bodyMask, 'W', 'K');
  shadeBelow(G, bodyMask, bx, by + 1.3, 'H');

  /* ---- near legs, painted over the belly ----
   * Kept separate (rather than merged into the torso) so each leg keeps its
   * own outline and reads as a leg instead of a dark nub in the shading. */
  const nearLegs = legsOf(['nearBack', 'nearFront']);
  paint(G, nearLegs, 'W', 'K');

  /* ---- head ---- */
  const headMask = maskEllipse(hx, hy, RIG.head.rx, RIG.head.ry - o.squash * 0.25);
  /* cheek bulge so the muzzle is not a perfect circle */
  const cheek = maskEllipse(hx + RIG.head.rx * 0.62, hy + 1.6, 2.6, 2.4);
  const headAll = maskOr(headMask, cheek);
  paint(G, headAll, 'W', 'K');

  /* ---- ears (on top so their outline reads) ---- */
  const perk = o.earPerk;
  const earBack = maskTri(hx - 4.6, hy - 3.4 - perk, hx - 6.2, hy - 9.4 - perk, hx - 0.6, hy - 5.0);
  const earFront = maskTri(hx + 2.2, hy - 4.0 - perk, hx + 5.6, hy - 9.2 - perk, hx + 5.4, hy - 3.6);
  paint(G, earBack, 'W', 'K');
  paint(G, earFront, 'W', 'K');
  px(G, hx - 3.9, hy - 5.6 - perk, 'P');
  px(G, hx + 3.6, hy - 5.8 - perk, 'P');

  /* ---- face ---- */
  /* Features are placed by a fixed offset from the head centre, which on a
   * tapered row can land outside the silhouette (a sleeping head tapers
   * sharply). Clip every facial pixel to the head mask so a nose never
   * floats in the background. */
  const pxIn = (x, y, c) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;
    if (!headAll[yi][xi]) return;
    G[yi][xi] = c;
  };
  eyes(G, hx, hy, o, pxIn);
  face(G, hx, hy, o, pxIn);

  /* ---- shading: lower half of the head (torso is shaded above) ---- */
  shadeBelow(G, headAll, hx, hy + 1.2, 'H');

  /* paw pads on the two near feet — only where the paw is actually on the
   * ground, otherwise a tucked leg would print a pink dot mid-body */
  const pad = key => {
    const L = legOf(key);
    if (L.hide || (L.lift || 0) > 1.5) return;
    px(G, L.x + o.bodyX - 0.5, Math.round(FLOOR - 2 - (L.lift || 0)), 'P');
  };
  pad('nearBack'); pad('nearFront');

  return G.map(r => r.join(''));
}

/* `shadeBelow` shades interior W cells under a line — for a side view the
 * boundary follows the body's length, not a mirror axis. */
function shadeBelow(G, m, cx, from, c) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y][x]) continue;
    if (G[y][x] !== 'W') continue;
    if (y > from) G[y][x] = c;
  }
}

/* ---------- face ---------------------------------------------------- */

function eyes(G, hx, hy, o, pxIn) {
  /* One eye reads in profile; it sits just behind the muzzle bulge. */
  const ex = Math.round(hx + 0.6 + o.look);
  const ey = Math.round(hy - 1.0);

  if (o.eyes === 'closed' || o.eyes === 'squint') {
    const w = o.eyes === 'squint' ? 2 : 3;
    for (let i = 0; i < w; i++) pxIn(ex - 1 + i, ey, 'E');
    return;
  }
  if (o.eyes === 'happy') {
    pxIn(ex - 1, ey + 1, 'E'); pxIn(ex, ey, 'E'); pxIn(ex + 1, ey + 1, 'E');
    return;
  }
  if (o.eyes === 'wide') {
    for (let y = ey - 1; y <= ey + 2; y++) { pxIn(ex - 1, y, 'E'); pxIn(ex, y, 'E'); }
    pxIn(ex - 1, ey - 1, 'W');
    return;
  }
  /* open: 2x3 oval with a highlight */
  for (let y = ey - 1; y <= ey + 1; y++) { pxIn(ex - 1, y, 'E'); pxIn(ex, y, 'E'); }
  pxIn(ex - 1, ey - 1, 'W');
}

function face(G, hx, hy, o, pxIn) {
  const nx = Math.round(hx + RIG.head.rx * 0.82);
  const ny = Math.round(hy + 1.0);

  /* nose, then the mouth shape under it */
  pxIn(nx, ny, 'N');
  if (o.mouth === 'open') {
    pxIn(nx, ny + 1, 'M'); pxIn(nx - 1, ny + 1, 'M');
    pxIn(nx - 1, ny + 2, 'M');
  } else if (o.mouth === 'pant') {
    pxIn(nx, ny + 1, 'M'); pxIn(nx - 1, ny + 1, 'M');
  } else {
    pxIn(nx - 1, ny + 1, 'M');
    pxIn(nx, ny + 2, 'M');
    pxIn(nx + 1, ny + 1, 'M');
  }

  if (o.blush) {
    pxIn(nx + 1, ny + 1, 'B');
    pxIn(nx + 1, ny + 2, 'B');
  }
}

/* ---------- poses --------------------------------------------------- */
/* Each returns a partial option object layered onto the rig. */

function walkPose(phase) {
  /* A four-beat walk. Diagonal pairs swing through together and the body
   * rises on the passing beats, so she reads as transferring weight rather
   * than sliding. `stride` is how far a paw reaches fore/aft; a lifted paw
   * is both forward and off the floor, which is what sells the step. */
  const stride = 2.0;
  const passing = (phase === 1 || phase === 3);
  const fwd = phase === 0 ? stride : phase === 2 ? -stride : 0;
  return {
    bodyY: passing ? -1 : 0,
    headDY: passing ? -0.5 : 0,
    tail: { sway: [0.6, 1.5, 0.6, 1.1][phase] },
    legs: {
      nearFront: { x: 22.0 + fwd, lift: phase === 0 ? 2 : 0 },
      farBack:   { x: 7.0 + fwd,  lift: phase === 0 ? 2 : 0 },
      nearBack:  { x: 12.0 - fwd, lift: phase === 2 ? 2 : 0 },
      farFront:  { x: 17.0 - fwd, lift: phase === 2 ? 2 : 0 }
    }
  };
}

/* ---------- frame set ----------------------------------------------- */

function frames() {
  const out = {};

  /* idle */
  out.idle_open = buildCat({ eyes: 'open' });
  out.idle_closed = buildCat({ eyes: 'closed' });
  out.idle_blink_mid = buildCat({ eyes: 'happy' });
  out.idle_look_left = buildCat({ eyes: 'open', look: -1 });
  out.idle_look_right = buildCat({ eyes: 'open', look: 1 });
  /* breathing: she rises a little and the paws settle up with her */
  const breatheBase = {
    bodyY: -0.7, headDY: -0.9,
    legs: {
      nearBack: { lift: 0.5 }, nearFront: { lift: 0.5 },
      farBack: { lift: 0.5 }, farFront: { lift: 0.5 }
    }
  };
  out.idle_breathe = buildCat(Object.assign({}, breatheBase, { eyes: 'open' }));
  out.idle_breathe_closed = buildCat(Object.assign({}, breatheBase, { eyes: 'closed' }));

  /* walk */
  for (let i = 0; i < 4; i++) out['walk_' + i] = buildCat(Object.assign({ eyes: 'open' }, walkPose(i)));

  /* sit — haunches down on the floor, chest and head up, back paws tucked
   * under so only the two straight forelegs read. */
  const sit = {
    bodyRX: 7.5, bodyRY: 6.0, bodyY: 2.0, headDY: -2.2, headDX: -1.0,
    tail: { sway: 2.4, lift: -2.0, curl: 1.8 },
    legs: {
      farBack: { hide: true }, farFront: { lift: 1 },
      nearBack: { hide: true }, nearFront: { lift: 0 }
    }
  };
  out.sit_open = buildCat(Object.assign({}, sit, { eyes: 'open' }));
  out.sit_closed = buildCat(Object.assign({}, sit, { eyes: 'closed' }));

  /* sleep — a flat loaf: wide and low, head tucked down onto the paws,
   * ears flat, everything tucked so nothing juts out. */
  const sleep = {
    bodyRX: 10.0, bodyRY: 4.2, bodyY: 3.5, headDY: 2.6, headDX: 0.5,
    earPerk: -1.0, eyes: 'closed',
    tail: { sway: 1.4, lift: -4.0, curl: 3.0 },
    legs: {
      farBack: { hide: true }, farFront: { hide: true },
      nearBack: { hide: true }, nearFront: { hide: true }
    }
  };
  out.sleep_0 = buildCat(Object.assign({}, sleep));
  out.sleep_1 = buildCat(Object.assign({}, sleep, { bodyRY: 4.6, headDY: 2.2 }));

  /* react — happy hop, ears up */
  out.react_0 = buildCat({ eyes: 'happy', earPerk: 1, bodyY: -1.4, squash: -0.5, tail: { lift: 1.5 }, legs: { nearFront: { lift: 1.2 }, nearBack: { lift: 1.2 }, farFront: { lift: 1.2 }, farBack: { lift: 1.2 } } });
  out.react_1 = buildCat({ eyes: 'open', earPerk: 1, tail: { lift: 1.0 } });

  /* jump — the vertical travel is applied by the state machine (she rises
   * above the floor and her shadow stays down), so these frames only carry
   * the crouch, the tuck and the stretch. */
  const tuck = { nearFront: { lift: 3 }, farFront: { lift: 3 }, nearBack: { lift: 3 }, farBack: { lift: 3 } };
  out.jump_0 = buildCat({ eyes: 'wide', earPerk: 1, bodyY: 1.6, squash: 0.8, legs: { nearFront: { lift: 1 }, farFront: { lift: 1 }, nearBack: { lift: 1 }, farBack: { lift: 1 } }, tail: { lift: 1 } });
  out.jump_1 = buildCat({ eyes: 'wide', earPerk: 1, bodyY: 0.5, squash: -0.8, legs: tuck, tail: { lift: 3 } });
  out.jump_2 = buildCat({ eyes: 'open', earPerk: 1, bodyY: -0.5, squash: -1.2, legs: { nearFront: { lift: 2 }, farFront: { lift: 2 }, nearBack: { lift: 1 }, farBack: { lift: 1 } }, tail: { lift: 2 } });
  out.jump_3 = buildCat({ eyes: 'open', bodyY: 1.2, squash: 1.0, legs: { nearFront: { lift: 1 }, farFront: { lift: 1 } }, tail: { sway: 1.2 } });

  /* eat / drink — head down at bowl height. The bowl she is at is placed by
   * the state machine; these frames only carry the head and the chewing. */
  const atBowl = { bodyY: 1.5, headDX: 1.5, earPerk: -0.4 };
  out.eat_0 = buildCat(Object.assign({}, atBowl, { headDY: 6.5, mouth: 'open', eyes: 'open' }));
  out.eat_1 = buildCat(Object.assign({}, atBowl, { headDY: 6.0, mouth: 'smile', eyes: 'closed' }));
  out.eat_2 = buildCat(Object.assign({}, atBowl, { headDY: 6.5, mouth: 'open', eyes: 'closed' }));
  out.drink_0 = buildCat(Object.assign({}, atBowl, { headDY: 7.6, mouth: 'open', eyes: 'open' }));
  out.drink_1 = buildCat(Object.assign({}, atBowl, { headDY: 7.0, mouth: 'pant', eyes: 'closed' }));

  /* groom — sitting up on the haunches, licking a raised forepaw */
  const groomBase = {
    bodyRX: 7.5, bodyRY: 6.0, bodyY: 2.0, headDX: -0.5,
    legs: { farBack: { hide: true }, farFront: { hide: true }, nearBack: { hide: true }, nearFront: { lift: 4 } },
    tail: { sway: 2.2, lift: -2.0, curl: 1.6 }
  };
  out.groom_0 = buildCat(Object.assign({}, groomBase, { headDY: 1.4, mouth: 'open', eyes: 'happy' }));
  out.groom_1 = buildCat(Object.assign({}, groomBase, { headDY: 0.6, mouth: 'smile', eyes: 'open' }));

  /* pounce — the yarn-ball lunge: coil, spring, land */
  out.pounce_0 = buildCat({ eyes: 'wide', earPerk: 1, bodyY: 2.2, squash: 1.4, headDY: 1.0, legs: { nearFront: { lift: 2 }, farFront: { lift: 2 }, nearBack: { hide: true }, farBack: { hide: true } }, tail: { sway: -1.5, lift: 1 } });
  out.pounce_1 = buildCat({ eyes: 'wide', earPerk: 1, bodyY: 0.5, squash: -1.0, headDX: 1.0, legs: { nearFront: { lift: 4 }, farFront: { lift: 4 }, nearBack: { lift: 3 }, farBack: { lift: 3 } }, tail: { lift: 3 } });
  out.pounce_2 = buildCat({ eyes: 'open', earPerk: 0.5, bodyY: 1.0, headDX: 1.5, legs: { nearFront: { lift: 1 }, farFront: { lift: 1 } }, tail: { sway: 1.8 } });

  /* wash — sitting, head down to a paw */
  const washBase = {
    bodyRX: 7.5, bodyRY: 6.0, bodyY: 2.0, headDX: -0.5,
    legs: { farBack: { hide: true }, farFront: { hide: true }, nearBack: { hide: true }, nearFront: { lift: 3 } },
    tail: { sway: 2.4, lift: -2.0, curl: 1.8 }
  };
  out.wash_0 = buildCat(Object.assign({}, washBase, { headDY: 4.2, mouth: 'open', eyes: 'closed' }));
  out.wash_1 = buildCat(Object.assign({}, washBase, { headDY: 3.4, mouth: 'pant', eyes: 'closed' }));

  /* cat tree — standing tall, batting the hanging toy */
  out.tree_0 = buildCat({ eyes: 'open', earPerk: 1, bodyY: -1.0, headDY: -2.0, legs: { nearFront: { lift: 2 }, farFront: { lift: 2 } }, tail: { sway: 1.0, lift: 1 } });
  out.tree_1 = buildCat({ eyes: 'happy', earPerk: 1.5, bodyY: -2.0, headDY: -3.0, legs: { nearFront: { lift: 4 }, farFront: { lift: 4 }, nearBack: { lift: 1 } }, tail: { sway: 0.5, lift: 2 } });

  /* Tail-pose variants of the two idle bases. These used to be produced by a
 * separate pixel-surgery tool, but the rig can express them directly, so
 * they are ordinary frames now — same source of truth, no second file. */
  const flick = { tail: { sway: -1.8, lift: 1.2 } };
  const tailUp0 = { tail: { sway: 0.5, lift: 6.0, curl: 0 } };
  const tailUp1 = { tail: { sway: 0.5, lift: 6.0, curl: 1.8 } };
  out.idle_open_tailFlick = buildCat(Object.assign({}, flick, { eyes: 'open' }));
  out.idle_breathe_tailFlick = buildCat(Object.assign({}, flick, breatheBase));
  out.idle_open_tailUp0 = buildCat(Object.assign({}, tailUp0, { eyes: 'open' }));
  out.idle_open_tailUp1 = buildCat(Object.assign({}, tailUp1, { eyes: 'open' }));
  out.idle_breathe_tailUp0 = buildCat(Object.assign({}, tailUp0, breatheBase));
  out.idle_breathe_tailUp1 = buildCat(Object.assign({}, tailUp1, breatheBase));

  /* a yawn, used when she is low on energy and about to nap */
  out.idle_yawn = buildCat({ eyes: 'closed', mouth: 'open', headDY: 0.8 });

  return out;
}

/* ---------- output --------------------------------------------------- */

function toAscii(rows) {
  return rows.map((r, i) => String(i).padStart(2, '0') + ' ' + r).join('\n');
}

const mode = process.argv[2] || '--preview';
const F = frames();

/* Sanity check. A side view has no mirror symmetry to preserve — instead we
 * assert the things that would actually clip or float:
 *   - every frame is exactly 32x32
 *   - nothing on the last row (she would read as cropped)
 *   - nothing in the last column (Sprite.draw mirrors her to face left, so
 *     art touching column 31 would be cut off on the facing-left pass)
 *   - some art actually exists
 */
function checkFrames() {
  let bad = 0;
  const fail = m => { bad++; if (bad <= 12) console.log('BAD ' + m); };

  Object.keys(F).forEach(k => {
    const rows = F[k];
    if (rows.length !== H) return fail(k + ': ' + rows.length + ' rows');
    let ink = 0;
    rows.forEach((row, y) => {
      if (row.length !== W) return fail(k + ' row ' + y + ': ' + row.length + ' cols');
      for (let x = 0; x < W; x++) {
        if (row[x] === '.') continue;
        ink++;
        if (y === H - 1) fail(k + ': art on the last row (row ' + y + ')');
        if (x === W - 1) fail(k + ': art in the last column (col ' + x + ')');
      }
    });
    if (ink === 0) fail(k + ': frame is empty');
  });

  console.log(bad === 0
    ? 'FRAME CHECK OK — ' + Object.keys(F).length + ' frames, 32x32, clear of the flip edge'
    : 'FRAME CHECK FAIL — ' + bad + ' problems');
  return bad;
}

if (mode === '--check') {
  process.exit(checkFrames() === 0 ? 0 : 1);
} else if (mode === '--build') {
  const lines = [];
  lines.push('/* ============================================================');
  lines.push(' * NES-cat — frames.js');
  lines.push(' * Literal 32x32 pixel frames for Shiro (side view, facing right).');
  lines.push(' *');
  lines.push(' * GENERATED by tools/build-sprites.js — edit the tool, not this file.');
  lines.push(' *');
  lines.push(' * Char legend:  . transparent   K outline   W body   H shade');
  lines.push(' *               G deep shade    P pink      N nose   E eye');
  lines.push(' *               B blush         M mouth');
  lines.push(' * ============================================================ */');
  lines.push('(function (root) {');
  lines.push("  'use strict';");
  lines.push('  var NESCAT = (root.NESCAT = root.NESCAT || {});');
  lines.push('  NESCAT.frames = {');
  Object.keys(F).forEach((k, i) => {
    lines.push('    ' + k + ': [');
    F[k].forEach(r => lines.push("      '" + r + "',"));
    lines.push('    ]' + (i === Object.keys(F).length - 1 ? '' : ','));
  });
  lines.push('  };');
  lines.push("})(typeof window !== 'undefined' ? window : globalThis);");
  lines.push('');
  const outPath = path.join(__dirname, '..', 'NES-cat', 'js', 'frames.js');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log('wrote ' + outPath + '  (' + Object.keys(F).length + ' frames)');
} else {
  const want = process.argv.slice(2).filter(a => a.charAt(0) !== '-');
  (want.length ? want : Object.keys(F)).forEach(k => {
    if (!F[k]) return;
    console.log('\n== ' + k + ' ==');
    console.log(toAscii(F[k]));
  });
}