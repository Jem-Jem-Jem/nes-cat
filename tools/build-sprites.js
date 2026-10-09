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
 *   node tools/build-sprites.js --check     # verify every frame
 *   node tools/build-sprites.js --build     # write frames.js
 *
 * Shiro is drawn FRONT-ON. That keeps her silhouette mirror-symmetric,
 * which is what lets one sprite read as "walking left" or "walking
 * right" without a second set of art and without a horizontal flip.
 *
 * Every pose is one buildCat({...}) call. The rig parameters are:
 *   bodyDY/headDY  nudge the torso / head vertically
 *   squash         widen the torso (0 none, 1 fat, -1 stretched)
 *   pawLift        raise (>0) or lower (<0) both front paws
 *   legPhase       0..3 — which paw is up, for the walk cycle
 *   tailSway       swing the tail sideways
 *   tailUp         0..1 — sweep the tail up over her back
 *   earPerk        raise the ears (interest / alarm)
 *   eyes           open | closed | happy | wide
 *   mouth          smile | open | pant
 *   look           -1 glance left, +1 glance right
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
/* A leg: a short vertical capsule from `topY` down to `footY`. Side view. */
function maskLeg(x, topY, footY, w) {
  const cy = (topY + footY) / 2, ry = Math.max(0.5, (footY - topY) / 2);
  return maskEllipse(x, cy, w / 2, ry);
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
function shadeBelow(G, m, cx, from, c) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y][x]) continue;
    if (G[y][x] !== 'W') continue;
    if (y > from) G[y][x] = c;
  }
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

/* ---------- feature painters --------------------------------------- */

function eyes(G, mode, dy, look) {
  const y = 11 + dy;
  look = look || 0;   /* -1 = glance left, +1 = glance right */
  if (mode === 'closed') {
    [[11, 12, 13], [18, 19, 20]].forEach(([a, b, c]) => {
      px(G, a + look, y + 1, 'E'); px(G, b + look, y + 1, 'E'); px(G, c + look, y + 1, 'E');
    });
    return;
  }
  if (mode === 'happy') {
    // ^ ^ arcs
    px(G, 11 + look, y, 'E'); px(G, 12 + look, y - 1, 'E'); px(G, 13 + look, y, 'E');
    px(G, 18 + look, y, 'E'); px(G, 19 + look, y - 1, 'E'); px(G, 20 + look, y, 'E');
    return;
  }
  if (mode === 'wide') {
    /* a taller, rounder eye — reads as startled. Pairs are mirror-matched
     * (11 mirrors to 20, 12 to 19) or the front-on symmetry check fails. */
    [[11, 12], [19, 20]].forEach(([a, b]) => {
      for (let yy = y - 2; yy <= y + 1; yy++) { px(G, a + look, yy, 'E'); px(G, b + look, yy, 'E'); }
    });
    px(G, 11 + look, y - 2, 'W'); px(G, 20 + look, y - 2, 'W');
    return;
  }
  // open: 2x3 oval with a highlight
  [[11, 12], [19, 20]].forEach(([a, b]) => {
    for (let yy = y - 1; yy <= y + 1; yy++) { px(G, a + look, yy, 'E'); px(G, b + look, yy, 'E'); }
  });
  px(G, 11 + look, y - 1, 'W');
  px(G, 20 + look, y - 1, 'W');
}

function face(G, dy, mouth) {
  const y = 11 + dy;
  // nose (2px, centred on the mirror line at x=15.5)
  px(G, 15, y + 3, 'N'); px(G, 16, y + 3, 'N');

  if (mouth === 'open') {
    /* a proper yawn / lapping gape: widen the w into an oval */
    px(G, 14, y + 4, 'M'); px(G, 15, y + 4, 'M');
    px(G, 16, y + 4, 'M'); px(G, 17, y + 4, 'M');
    px(G, 15, y + 5, 'M'); px(G, 16, y + 5, 'M');
  } else if (mouth === 'pant') {
    /* a small tongue-ish flick, one pixel lower than the smile */
    px(G, 15, y + 5, 'M'); px(G, 16, y + 5, 'M');
    px(G, 16, y + 6, 'M'); px(G, 15, y + 6, 'M');
  } else {
    // mouth  w
    px(G, 14, y + 4, 'M'); px(G, 15, y + 5, 'M');
    px(G, 17, y + 4, 'M'); px(G, 16, y + 5, 'M');
  }

  // blush
  px(G, 9, y + 2, 'B'); px(G, 10, y + 2, 'B');
  px(G, 21, y + 2, 'B'); px(G, 22, y + 2, 'B');
}

/* ---------- the cat ------------------------------------------------- */

/* Returns { rows, tail }. The tail mask comes back too so the checker can
 * exempt exactly the tail instead of guessing at columns — a raised tail
 * sits far higher than a hanging one. */
function buildCatParts(o) {
  o = Object.assign({
    bodyDY: 0, headDY: 0, squash: 0, tailSway: 0, tailUp: 0, earPerk: 0,
    pawLift: 0, eyes: 'open', legPhase: 0, sleep: false, look: 0, mouth: 'smile'
  }, o);

  const G = grid();
  /* The pixel grid spans continuum [0,32), so its mirror line is x = 16 and
   * pixel i mirrors to pixel 31-i. Keep every shape centred on 16. */
  const cx = 16;

  /* Layout note: the silhouette is sized so body/paws/tail bottom out at
   * row 29-30, leaving row 31 free. Never let art touch the last row or it
   * reads as clipped (there is no room for the bottom outline). */

  /* tail (behind body). tailUp lifts the control points so the tail sweeps
   * up and over her back instead of hanging down beside her. */
  const tail = stampCurve(G,
    [21, 21 + o.bodyDY * 0.4],
    [27.5 + o.tailSway, 22 - o.tailUp * 6],
    [24.5 + o.tailSway, 27 - o.tailUp * 12],
    2.0, 'W', 'K');

  /* body + front paws as ONE silhouette so the outline stays clean
   * (separate outlined paws leave stray lines inside the body). */
  const pA = o.legPhase === 1 ? -1 : 0;
  const pB = o.legPhase === 3 ? -1 : 0;
  /* pawLift raises (>) or lowers (<) both paws together */
  const lift = -o.pawLift;
  /* paws bottom out exactly with the body (y=29.0) so nothing pokes through
   * as a stray single pixel on the row below. */
  const pawL = maskEllipse(11.5, 27.0 + o.bodyDY + pA + lift, 2.6, 2.0);
  const pawR = maskEllipse(20.5, 27.0 + o.bodyDY + pB + lift, 2.6, 2.0);
  const bodyMask = maskEllipse(cx, 22.8 + o.bodyDY, 8.4, 6.2 + o.squash);
  const bodyAll = maskOr(maskOr(bodyMask, pawL), pawR);
  /* Flat floor: an ellipse always tapers to a 1-4px nub at the bottom, which
   * reads as a stray pixel and moves when the body squashes. Cutting the
   * silhouette at y=29 gives a stable, flat sitting bottom. */
  const FLOOR = 29.0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y + 0.5 > FLOOR) bodyAll[y][x] = false;
  paint(G, bodyAll, 'W', 'K');

  /* head */
  const headMask = maskEllipse(cx, 10.5 + o.headDY, 8.4, 6.5 - o.squash * 0.3);
  paint(G, headMask, 'W', 'K');

  /* ears (drawn on top so their outline reads). They must travel with the
   head: headDY can push the skull right down to a bowl, and ears left at
   their rest position would float free of it. */
  const perk = o.earPerk;
  const hy = o.headDY;
  const earL = maskTri(10.5, 2.0 - perk + hy, 5.2, 9.0 + hy, 14.2, 8.0 + hy);
  const earR = maskTri(21.5, 2.0 - perk + hy, 26.8, 9.0 + hy, 17.8, 8.0 + hy);
  paint(G, earL, 'W', 'K');
  paint(G, earR, 'W', 'K');
  const inL = maskTri(10.5, 4.3 - perk + hy, 7.4, 8.2 + hy, 13.0, 7.6 + hy);
  const inR = maskTri(21.5, 4.3 - perk + hy, 24.6, 8.2 + hy, 19.0, 7.6 + hy);
  paint(G, inL, 'P', 'P');
  paint(G, inR, 'P', 'P');

  /* features */
  eyes(G, o.eyes, o.headDY, o.look);
  face(G, o.headDY, o.mouth);

  /* shading: bottom half of head + body */
  shadeBelow(G, headMask, cx, 12 + o.headDY, 'H');
  shadeBelow(G, bodyAll, cx, 23 + o.bodyDY, 'H');

  /* leg seam: a deeper shade line between the two front paws */
  [26, 27, 28].forEach(y => {
    if (G[y]) { if (G[y][15] === 'H') G[y][15] = 'G'; if (G[y][16] === 'H') G[y][16] = 'G'; }
  });

  /* paw pads — follow the paws so they never print on the belly. They are
   * stamped directly rather than masked, so clamp them to the floor or a
   * lowered-paw pose (carried) would print a pad on the very last row. */
  if (!o.sleep) {
    const py = Math.min(Math.round(27.0 + o.bodyDY + lift), 28);
    px(G, 11, py + pA, 'P'); px(G, 12, py + pA, 'P');
    px(G, 19, py + pB, 'P'); px(G, 20, py + pB, 'P');
  }
  return { rows: G.map(r => r.join('')), tail: tail };
}

function buildCat(o) {
  return buildCatParts(o).rows;
}

/* ---------- frame set ----------------------------------------------- */

/* ============================================================
 * THE SIDE VIEW
 *
 * The two views are one system, not two versions of the cat:
 *
 *   front  she is facing you. Symmetric, so it reads as "here with you",
 *          and it is where her face and mood do the most work. Used for
 *          every stationary state — idle, sit, sleep, eat, drink, groom,
 *          wash, and being carried.
 *   side   she is in profile, travelling. A front-facing sprite sliding
 *          left and right looks like it is moonwalking; in profile the
 *          stride reads, and she can be mirrored to face her direction of
 *          travel. Used for the states that cross the room or leave the
 *          ground — walk, jump, pounce.
 *
 * The switch is data, not scattered `if`s: SIDE_STATES in shiro.js names
 * the travelling states, and frameFor() maps them onto the `side_` frames
 * emitted here. Side frames are authored facing right and mirrored at
 * draw time.
 * ============================================================ */

const SIDE_RIG = {
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

/* In profile only one eye shows, and features hang off the head centre
   rather than the frame's mirror line — so these need their own painters. */
function eyesSide(G, hx, hy, o, pxIn) {
  const ex = Math.round(hx + 0.6 + o.look);
  const ey = Math.round(hy - 1.0);

  if (o.eyes === 'closed') {
    for (let i = 0; i < 3; i++) pxIn(ex - 1 + i, ey, 'E');
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

function faceSide(G, hx, hy, o, pxIn) {
  const nx = Math.round(hx + SIDE_RIG.head.rx * 0.82);
  const ny = Math.round(hy + 1.0);

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
}

/* Returns { rows, tail } so checkFrames() can exempt the tail exactly. */
function buildSideParts(o) {
  o = Object.assign({
    bodyX: 0, bodyY: 0, bodyRX: null, bodyRY: null, squash: 0,
    headDY: 0, headDX: 0,
    legs: {}, tail: {}, earPerk: 0,
    eyes: 'open', look: 0, mouth: 'smile', blush: false
  }, o);

  const G = grid();
  const FLOOR = 29.0;

  const bx = SIDE_RIG.body.x + o.bodyX;
  const by = SIDE_RIG.body.y + o.bodyY;
  const bodyRX = o.bodyRX == null ? SIDE_RIG.body.rx : o.bodyRX;
  const bodyRY = (o.bodyRY == null ? SIDE_RIG.body.ry : o.bodyRY) + o.squash;
  const hx = SIDE_RIG.head.x + o.headDX + o.bodyX;
  const hy = SIDE_RIG.head.y + o.headDY + o.bodyY;
  const legTop = SIDE_RIG.LEG_TOP + o.bodyY;

  /* A leg's foot rides `lift` px above the floor line; `hide` drops the leg
     entirely, for poses that tuck their paws under. */
  const legOf = key => Object.assign({}, SIDE_RIG.legs[key], o.legs[key] || {});
  const leg = key => {
    const L = legOf(key);
    return maskLeg(L.x + o.bodyX, legTop, FLOOR - 1 - (L.lift || 0), SIDE_RIG.LEG_W);
  };
  const legsOf = keys =>
    maskOr(...keys.map(k => (legOf(k).hide ? emptyMask() : leg(k))));

  /* ---- tail (behind everything) ---- */
  const T = Object.assign({}, SIDE_RIG.tail, o.tail);
  const tBaseX = bx - bodyRX + 2.5;
  const tail = stampCurve(G,
    [tBaseX, by - 0.5],
    [tBaseX - 3.2 - T.sway, by - 1.5 - T.lift],
    [tBaseX - 5.0 - T.sway + T.curl, by - 8.0 - T.lift * 1.6 + T.curl],
    2.4, 'W', 'K');

  /* ---- far legs, in deep shade so they read as a further-away pair ---- */
  paint(G, legsOf(['farBack', 'farFront']), 'G', 'K');

  /* ---- torso ---- */
  const bodyMask = maskEllipse(bx, by, bodyRX, bodyRY);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y + 0.5 > FLOOR) bodyMask[y][x] = false;
  paint(G, bodyMask, 'W', 'K');
  shadeBelow(G, bodyMask, bx, by + 1.3, 'H');

  /* ---- near legs, painted over the belly ---- */
  paint(G, legsOf(['nearBack', 'nearFront']), 'W', 'K');

  /* ---- head, with a cheek bulge so the muzzle is not a plain circle ---- */
  const headMask = maskEllipse(hx, hy, SIDE_RIG.head.rx, SIDE_RIG.head.ry - o.squash * 0.25);
  const cheek = maskEllipse(hx + SIDE_RIG.head.rx * 0.62, hy + 1.6, 2.6, 2.4);
  const headAll = maskOr(headMask, cheek);
  paint(G, headAll, 'W', 'K');

  /* ---- ears ---- */
  const perk = o.earPerk;
  paint(G, maskTri(hx - 4.6, hy - 3.4 - perk, hx - 6.2, hy - 9.4 - perk, hx - 0.6, hy - 5.0), 'W', 'K');
  paint(G, maskTri(hx + 2.2, hy - 4.0 - perk, hx + 5.6, hy - 9.2 - perk, hx + 5.4, hy - 3.6), 'W', 'K');
  px(G, hx - 3.9, hy - 5.6 - perk, 'P');
  px(G, hx + 3.6, hy - 5.8 - perk, 'P');

  /* ---- face, clipped to the skull so nothing floats in the background ---- */
  const pxIn = (x, y, c) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;
    if (!headAll[yi][xi]) return;
    G[yi][xi] = c;
  };
  eyesSide(G, hx, hy, o, pxIn);
  faceSide(G, hx, hy, o, pxIn);
  shadeBelow(G, headAll, hx, hy + 1.2, 'H');

  /* paw pads on the two near feet, only where the paw is on the ground */
  const pad = key => {
    const L = legOf(key);
    if (L.hide || (L.lift || 0) > 1.5) return;
    px(G, L.x + o.bodyX - 0.5, Math.round(FLOOR - 2 - (L.lift || 0)), 'P');
  };
  pad('nearBack'); pad('nearFront');

  return { rows: G.map(r => r.join('')), tail: tail };
}

function buildSide(o) {
  return buildSideParts(o).rows;
}

/* A four-beat walk. Diagonal leg pairs swing through together and the body
   rises on the passing beats, so she reads as transferring weight rather than
   sliding. A lifted paw is both forward and off the floor, which sells the
   step. */
function sideWalkPose(phase) {
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
  const TAIL_OF = {};

  /* Every frame goes through here so the tail mask is recorded alongside
   * the art, for checkFrames() to use. */
  function pose(name, o) {
    const parts = buildCatParts(o);
    out[name] = parts.rows;
    TAIL_OF[name] = parts.tail;
  }

  /* Side-view frames are emitted with a `side_` prefix. They are drawn from
   * a different rig, but they are the same cat, so they live in the same
   * table and the runtime just picks by name. */
  function side(name, o) {
    const parts = buildSideParts(o);
    out['side_' + name] = parts.rows;
    TAIL_OF['side_' + name] = parts.tail;
  }

  /* --- idle --- */
  pose('idle_open', { eyes: 'open' });
  pose('idle_closed', { eyes: 'closed' });
  pose('idle_blink_mid', { eyes: 'happy' });
  pose('idle_look_left', { eyes: 'open', look: -1 });
  pose('idle_look_right', { eyes: 'open', look: 1 });
  const breathe = { headDY: 0.6, pawLift: 0.5 };
  pose('idle_breathe', Object.assign({ eyes: 'open' }, breathe));
  pose('idle_breathe_closed', Object.assign({ eyes: 'closed' }, breathe));

  /* Tail-pose variants of the two idle bases. These used to come from a
   * separate pixel-surgery tool; the rig expresses them directly, so they
   * are ordinary frames now — same source of truth, no second file. */
  const flick = { tailSway: -1.8, tailUp: 0.2 };
  const tailUp0 = { tailSway: 0.5, tailUp: 0.75 };
  const tailUp1 = { tailSway: 1.2, tailUp: 0.75 };
  pose('idle_open_tailFlick', Object.assign({ eyes: 'open' }, flick));
  pose('idle_breathe_tailFlick', Object.assign({ eyes: 'open' }, breathe, flick));
  pose('idle_open_tailUp0', Object.assign({ eyes: 'open' }, tailUp0));
  pose('idle_open_tailUp1', Object.assign({ eyes: 'open' }, tailUp1));
  pose('idle_breathe_tailUp0', Object.assign({ eyes: 'open' }, breathe, tailUp0));
  pose('idle_breathe_tailUp1', Object.assign({ eyes: 'open' }, breathe, tailUp1));

  /* a yawn, used when she is low on energy and about to nap */
  pose('idle_yawn', { eyes: 'closed', mouth: 'open', headDY: 0.8 });

  /* --- walk: a four-beat cycle, one paw up per beat --- */
  pose('walk_0', { legPhase: 0, bodyDY: -1, tailSway: 1.0 });
  pose('walk_1', { legPhase: 1, bodyDY: 0, tailSway: 1.5 });
  pose('walk_2', { legPhase: 2, bodyDY: -1, tailSway: 1.0 });
  pose('walk_3', { legPhase: 3, bodyDY: 0, tailSway: 0.5 });

  /* --- sit --- */
  const sitBase = { squash: 0.8 };
  pose('sit_open', Object.assign({ eyes: 'open' }, sitBase));
  pose('sit_closed', Object.assign({ eyes: 'closed' }, sitBase));
  /* sitting is as natural a place for a tail flourish as standing, so the
   * sit pose needs the same variants or frameFor() cannot reuse them.
   * Both eye states are needed: a blink can land mid-flourish, and the
   * composed frame name is base + suffix. */
  pose('sit_open_tailFlick', Object.assign({ eyes: 'open' }, sitBase, flick));
  pose('sit_open_tailUp0', Object.assign({ eyes: 'open' }, sitBase, tailUp0));
  pose('sit_open_tailUp1', Object.assign({ eyes: 'open' }, sitBase, tailUp1));
  pose('sit_closed_tailFlick', Object.assign({ eyes: 'closed' }, sitBase, flick));
  pose('sit_closed_tailUp0', Object.assign({ eyes: 'closed' }, sitBase, tailUp0));
  pose('sit_closed_tailUp1', Object.assign({ eyes: 'closed' }, sitBase, tailUp1));

  /* --- sleep --- */
  pose('sleep_0', { eyes: 'closed', sleep: true, bodyDY: 1, headDY: 2, squash: 1.0, earPerk: -0.5 });
  pose('sleep_1', { eyes: 'closed', sleep: true, bodyDY: 1, headDY: 1.5, squash: 1.4, earPerk: -0.5 });

  /* --- react (petted / played with) --- */
  pose('react_0', { eyes: 'happy', earPerk: 1, bodyDY: -1, squash: -0.4 });
  pose('react_1', { eyes: 'open', earPerk: 1, squash: 0 });

  /* --- held: she is dangling from a hand. The state machine keeps cycling
   * these while she is carried so she is never a frozen sprite. --- */
  pose('held_0', { eyes: 'wide', earPerk: 1.2, bodyDY: 1.2, pawLift: -1.5, tailSway: 0 });
  pose('held_1', { eyes: 'wide', earPerk: 1.2, bodyDY: 1.6, pawLift: -2.2, tailSway: -1.2 });
  pose('held_2', { eyes: 'wide', earPerk: 1.0, bodyDY: 1.2, pawLift: -1.5, tailSway: 1.2 });

  /* --- jump: the vertical travel is the state machine's job, these frames
   * carry the crouch, the tuck and the stretch. --- */
  pose('jump_0', { eyes: 'wide', earPerk: 1, bodyDY: 1.4, squash: 1.0 });
  pose('jump_1', { eyes: 'wide', earPerk: 1.2, bodyDY: -0.5, squash: -0.6, pawLift: 3, tailUp: 0.5 });
  pose('jump_2', { eyes: 'open', earPerk: 1.2, bodyDY: -1.0, squash: -1.0, pawLift: 2.5, tailUp: 0.4 });
  pose('jump_3', { eyes: 'open', bodyDY: 0.8, squash: 0.9, pawLift: 0.5 });

  /* --- eat / drink: head down at bowl height. Where the bowl is, is the
   * state machine's job; these frames carry the head and the chewing. --- */
  const atBowl = { bodyDY: 1.0, pawLift: 0.5 };
  pose('eat_0', Object.assign({ eyes: 'open', mouth: 'open', headDY: 6.0 }, atBowl));
  pose('eat_1', Object.assign({ eyes: 'closed', mouth: 'smile', headDY: 5.5 }, atBowl));
  pose('eat_2', Object.assign({ eyes: 'closed', mouth: 'open', headDY: 6.0 }, atBowl));
  pose('drink_0', Object.assign({ eyes: 'open', mouth: 'open', headDY: 7.0 }, atBowl));
  pose('drink_1', Object.assign({ eyes: 'closed', mouth: 'pant', headDY: 6.5 }, atBowl));

  /* --- groom / wash: sitting, head down to a raised paw --- */
  const seated = { squash: 1.0, bodyDY: 1.2, pawLift: 3.5, tailUp: 0.3 };
  pose('groom_0', Object.assign({ eyes: 'happy', mouth: 'open', headDY: 2.4 }, seated));
  pose('groom_1', Object.assign({ eyes: 'open', mouth: 'smile', headDY: 1.8 }, seated));
  pose('wash_0', Object.assign({ eyes: 'closed', mouth: 'open', headDY: 3.6 }, seated));
  pose('wash_1', Object.assign({ eyes: 'closed', mouth: 'pant', headDY: 3.0 }, seated));

  /* --- pounce: the yarn-ball lunge --- */
  pose('pounce_0', { eyes: 'wide', earPerk: 1.2, bodyDY: 1.8, squash: 1.4, tailUp: 0.4 });
  pose('pounce_1', { eyes: 'wide', earPerk: 1.4, bodyDY: -0.5, squash: -0.8, pawLift: 3.5, tailUp: 0.8 });
  pose('pounce_2', { eyes: 'open', earPerk: 0.8, bodyDY: 0.8, squash: 0.8, pawLift: 0.5, tailSway: 1.4 });

  /* --- cat tree: standing tall, batting the hanging toy --- */
  pose('tree_0', { eyes: 'open', earPerk: 1.2, bodyDY: -0.6, pawLift: 2, tailUp: 0.3 });
  pose('tree_1', { eyes: 'happy', earPerk: 1.6, bodyDY: -1.2, pawLift: 4, tailUp: 0.6 });

  /* ------------------------------------------------------------------
   * Side view — the travelling states. Authored facing right; the runtime
   * mirrors her when she heads left. Kept to the three states that cross
   * the room or leave the floor, which are the ones a front-facing sprite
   * cannot sell.
   * ---------------------------------------------------------------- */

  /* walk: a real four-beat stride with four visible legs */
  for (let i = 0; i < 4; i++) {
    side('walk_' + i, Object.assign({ eyes: 'open' }, sideWalkPose(i)));
  }

  /* jump: crouch, tuck, stretch, land (the travel is the state machine's) */
  const tuck = { nearFront: { lift: 3 }, farFront: { lift: 3 }, nearBack: { lift: 3 }, farBack: { lift: 3 } };
  side('jump_0', { eyes: 'wide', earPerk: 1, bodyY: 1.6, squash: 0.8,
    legs: { nearFront: { lift: 1 }, farFront: { lift: 1 }, nearBack: { lift: 1 }, farBack: { lift: 1 } }, tail: { lift: 1 } });
  side('jump_1', { eyes: 'wide', earPerk: 1, bodyY: 0.5, squash: -0.8, legs: tuck, tail: { lift: 3 } });
  side('jump_2', { eyes: 'open', earPerk: 1, bodyY: -0.5, squash: -1.2,
    legs: { nearFront: { lift: 2 }, farFront: { lift: 2 }, nearBack: { lift: 1 }, farBack: { lift: 1 } }, tail: { lift: 2 } });
  side('jump_3', { eyes: 'open', bodyY: 1.2, squash: 1.0,
    legs: { nearFront: { lift: 1 }, farFront: { lift: 1 } }, tail: { sway: 1.2 } });

  /* pounce: the yarn-ball lunge — coil, spring, land */
  side('pounce_0', { eyes: 'wide', earPerk: 1, bodyY: 2.2, squash: 1.4, headDY: 1.0,
    legs: { nearFront: { lift: 2 }, farFront: { lift: 2 }, nearBack: { hide: true }, farBack: { hide: true } },
    tail: { sway: -1.5, lift: 1 } });
  side('pounce_1', { eyes: 'wide', earPerk: 1, bodyY: 0.5, squash: -1.0, headDX: 1.0,
    legs: { nearFront: { lift: 4 }, farFront: { lift: 4 }, nearBack: { lift: 3 }, farBack: { lift: 3 } },
    tail: { lift: 3 } });
  side('pounce_2', { eyes: 'open', earPerk: 0.5, bodyY: 1.0, headDX: 1.5,
    legs: { nearFront: { lift: 1 }, farFront: { lift: 1 } }, tail: { sway: 1.8 } });

  TAIL_MASKS = TAIL_OF;
  return out;
}

/* ---------- output --------------------------------------------------- */

function toAscii(rows) {
  return rows.map((r, i) => String(i).padStart(2, '0') + ' ' + r).join('\n');
}

let TAIL_MASKS = {};   /* filled in by frames() */

const mode = process.argv[2] || '--preview';
const F = frames();

/* Mechanical verification, per view.
 *
 * FRONT frames must mirror — that symmetry is the entire reason for the
 * front-on sprite, and it is what lets one frame read as facing left or
 * right. Exemptions there are deliberate: the tail (read from the exact
 * mask the builder stamped, since a raised tail sits far higher than a
 * hanging one), the alternating walk paw, the eye glance, and the one-paw-up
 * grooming poses.
 *
 * SIDE frames are asymmetric by nature — she is in profile, facing right, to
 * be mirrored at draw time. So they are only checked for shape: right size,
 * and nothing landing on the last row or the last column (the flip pass
 * would clip the latter).
 */
function checkFrames() {
  let bad = 0;
  Object.keys(F).forEach(k => {
    const rows = F[k];
    if (rows.length !== H) { bad++; console.log('BAD ' + k + ': ' + rows.length + ' rows'); return; }

    const isSide = k.indexOf('side_') === 0;
    const tail = TAIL_MASKS[k];

    for (let y = 0; y < H; y++) {
      const row = rows[y];
      if (row.length !== W) { bad++; console.log('BAD ' + k + ' row ' + y + ': ' + row.length + ' cols'); continue; }
      for (let x = 0; x < W; x++) {
        if (row[x] === '.') continue;
        if (y === H - 1) { bad++; console.log('BAD ' + k + ': art on the last row'); }
        if (x === W - 1) { bad++; console.log('BAD ' + k + ': art in the last column'); }

        if (isSide) continue;                         /* profile: no mirror to keep */

        const walking = k.indexOf('walk') === 0;
        const looking = k.indexOf('look') >= 0;
        const onePaw = k.indexOf('groom') === 0 || k.indexOf('wash') === 0;
        if (tail && tail[y][x]) continue;              /* the tail */
        if (walking && y >= 26) continue;              /* alternating paw */
        if (looking) continue;                         /* eye glance */
        if (onePaw) continue;                          /* one paw raised */

        if (row[x] !== row[W - 1 - x]) {
          bad++;
          if (bad <= 12) {
            console.log('ASYM ' + k + ' row ' + y + ' col ' + x + ': ' +
              row[x] + ' vs ' + row[W - 1 - x]);
          }
        }
      }
    }
  });

  const n = Object.keys(F).length;
  const ns = Object.keys(F).filter(k => k.indexOf('side_') === 0).length;
  console.log(bad === 0
    ? 'FRAME CHECK OK — ' + n + ' frames (front ' + (n - ns) + ' mirror-symmetric, ' +
      'side ' + ns + ' flip-safe), all 32x32'
    : 'FRAME CHECK FAIL — ' + bad + ' problems');
  return bad;
}

if (mode === '--check') {
  process.exit(checkFrames() === 0 ? 0 : 1);
} else if (mode === '--build') {
  const lines = [];
  lines.push('/* ============================================================');
  lines.push(' * NES-cat — frames.js');
  lines.push(' * Literal 32x32 pixel frames for Shiro (front view).');
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