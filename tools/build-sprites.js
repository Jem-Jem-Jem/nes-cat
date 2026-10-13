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
/* A leg: a short vertical capsule from `topY` down to `footY`. Side view.
 *
 * The height is the *absolute* distance, not topY-footY. A raised leg has its
 * foot above the hip, so the signed difference goes negative and the old
 * Math.max(0.5, ...) collapsed every lifted leg to a one-pixel nub — the paw
 * vanished into the belly for grooming, washing, kneading and holding alike,
 * and no amount of raising it changed anything. The 0.5 floor is still wanted
 * for a leg with no length at all, so it stays, on the magnitude. */
function maskLeg(x, topY, footY, w) {
  const cy = (topY + footY) / 2, ry = Math.max(0.5, Math.abs(footY - topY) / 2);
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

function eyes(G, mode, dy, look, dx) {
  dx = dx || 0;
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

function face(G, dy, mouth, dx) {
  dx = dx || 0;
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
    bodyDY: 0, headDY: 0, squash: 0, bodyRX: null, tailSway: 0, tailUp: 0, earPerk: 0,
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
  /* bodyRX widens the torso — a stretch is wide and low, a loaf is compact */
  const brx = o.bodyRX == null ? 8.4 : o.bodyRX;
  const bodyMask = maskEllipse(cx, 22.8 + o.bodyDY, brx, 6.2 + o.squash);
  const bodyAll = maskOr(maskOr(bodyMask, pawL), pawR);
  /* Flat floor: an ellipse always tapers to a 1-4px nub at the bottom, which
   * reads as a stray pixel and moves when the body squashes. Cutting the
   * silhouette at y=29 gives a stable, flat sitting bottom. */
  const FLOOR = 29.0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y + 0.5 > FLOOR) bodyAll[y][x] = false;
  paint(G, bodyAll, 'W', 'K');

  /* head */
  const headDX = o.headDX || 0;
  const headMask = maskEllipse(cx + headDX, 10.5 + o.headDY, 8.4, 6.5 - o.squash * 0.3);
  paint(G, headMask, 'W', 'K');

  /* mergeHead: drop the head's outline wherever it crosses the torso.
   *
   * paint() outlines any pixel on the edge of its own mask, so a head sunk
   * into the shoulders still draws a full circle round itself and the
   * silhouette reads as two shapes resting on each other — a chin sitting on
   * a body, with a dark line across where the neck would be. A loaf is one
   * mound, and a sleeping cat is one mound, so for those the head has to
   * flow into the torso rather than sit on it. Only pixels that are inside
   * *both* masks are affected, so the outer silhouette keeps its outline and
   * only the internal seam is removed. */
  if (o.mergeHead) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (headMask[y][x] && bodyAll[y][x] && G[y][x] === 'K') G[y][x] = 'W';
      }
    }
  }

  /* ears (drawn on top so their outline reads). They must travel with the
   head: headDY can push the skull right down to a bowl, and ears left at
   their rest position would float free of it. */
  const perk = o.earPerk;
  const hy = o.headDY;
  const earL = maskTri(10.5 + headDX, 2.0 - perk + hy, 5.2 + headDX, 9.0 + hy, 14.2 + headDX, 8.0 + hy);
  const earR = maskTri(21.5 + headDX, 2.0 - perk + hy, 26.8 + headDX, 9.0 + hy, 17.8 + headDX, 8.0 + hy);
  paint(G, earL, 'W', 'K');
  paint(G, earR, 'W', 'K');
  const inL = maskTri(10.5 + headDX, 4.3 - perk + hy, 7.4 + headDX, 8.2 + hy, 13.0 + headDX, 7.6 + hy);
  const inR = maskTri(21.5 + headDX, 4.3 - perk + hy, 24.6 + headDX, 8.2 + hy, 19.0 + headDX, 7.6 + hy);
  paint(G, inL, 'P', 'P');
  paint(G, inR, 'P', 'P');

  /* features */
  eyes(G, o.eyes, o.headDY, o.look, headDX);
  face(G, o.headDY, o.mouth, headDX);

  /* shading: bottom half of head + body */
  shadeBelow(G, headMask, cx + headDX, 12 + o.headDY, 'H');
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

/* In profile only one eye shows. During a turn she is coming back toward
   the viewer and the second eye starts to appear, foreshortened — that is
   what sells the rotation. `twoEyes` switches to the paired layout. */
function eyesSide(G, hx, hy, o, pxIn) {
  if (o.twoEyes) {
    const ey = Math.round(hy - 1.0);
    /* the far eye is one pixel narrower, as it turns away */
    if (o.eyes === 'closed') {
      for (let i = 0; i < 2; i++) { pxIn(hx - 3 + i, ey, 'E'); pxIn(hx + 2 + i, ey, 'E'); }
      return;
    }
    if (o.eyes === 'happy') {
      pxIn(hx - 3, ey + 1, 'E'); pxIn(hx - 2, ey, 'E');
      pxIn(hx + 2, ey + 1, 'E'); pxIn(hx + 3, ey, 'E');
      return;
    }
    const rows = o.eyes === 'wide' ? 4 : 3;
    const off = o.eyes === 'wide' ? 1 : 0;
    for (let y = ey - 1 - off; y <= ey + (rows - 2) - off; y++) {
      pxIn(hx - 3, y, 'E');
      pxIn(hx + 2, y, 'E'); pxIn(hx + 3, y, 'E');
    }
    if (!off) { pxIn(hx - 3, ey - 1, 'W'); pxIn(hx + 2, ey - 1, 'W'); }
    return;
  }

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
    headDY: 0, headDX: 0, twoEyes: false,
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

  /* A forepaw lifted past the shoulder is the subject of the pose — it is
   * grooming, washing, working a blanket — so it draws *over* the head. Near
   * legs are painted before the head so a leg passing behind the chest reads
   * as behind; a leg raised up in front of the cheek is in front of it, and
   * without this the muzzle simply paints over the paw and the pose is just
   * a cat with its head down. */
  const nearFront = legOf('nearFront');
  if (!nearFront.hide && (nearFront.lift || 0) > 4) {
    paint(G, legsOf(['nearFront']), 'W', 'K');
    /* the paw itself, so the tip of a raised leg is not a bare outline */
    shadeBelow(G, legsOf(['nearFront']), nearFront.x + o.bodyX,
               (legTop + FLOOR - 1 - (nearFront.lift || 0)) / 2, 'H');
  }

  /* paw pads on the two near feet, only where the paw is on the ground.
     * Clamped to the floor row: these are stamped directly rather than
     * masked, so a hanging leg (carried) would otherwise print a pad on the
     * very last row. */
  const pad = key => {
    const L = legOf(key);
    if (L.hide || (L.lift || 0) > 1.5) return;
    const fy = Math.min(Math.round(FLOOR - 2 - (L.lift || 0)), 28);
    px(G, L.x + o.bodyX - 0.5, fy, 'P');
  };
  pad('nearBack'); pad('nearFront');

  return { rows: G.map(r => r.join('')), tail: tail };
}

function buildSide(o) {
  return buildSideParts(o).rows;
}

/* A four-beat diagonal gait with two passing beats: four frames of the
   diagonal pairs swinging through, then two where the body rides highest
   and the trailing legs come under it. Six is the point at which the cycle
   stops reading as a shuffle.
   The head leads the body's rise slightly, which is what stops the whole
   sprite bobbing as one rigid piece. */
const WALK_CYCLE = [
  /* nearFront, farBack, nearBack, farFront, bodyY, headDY, tailSway */
  { f: [1, 1, -1, -1], by: 0, hd: 0.2, ts: 0.6 },
  { f: [1, 1, 0, 0], by: -1, hd: -0.6, ts: 1.5 },
  { f: [0, 0, 1, 1], by: 0, hd: 0.2, ts: 1.0 },
  { f: [-1, -1, 1, 1], by: 0, hd: 0.2, ts: 0.6 },
  { f: [-1, -1, 0, 0], by: -1, hd: -0.6, ts: 1.5 },
  { f: [0, 0, -1, -1], by: 0, hd: 0.2, ts: 1.0 }
];

function sideWalkPose(phase) {
  const stride = 2.0;
  const c = WALK_CYCLE[phase % WALK_CYCLE.length];
  /* a leg swinging forward is also lifted off the floor */
  const lf = f => (f > 0 ? 2 : 0);
  return {
    bodyY: c.by,
    headDY: c.hd,
    tail: { sway: c.ts },
    legs: {
      nearFront: { x: 22.0 + c.f[0] * stride, lift: lf(c.f[0]) },
      farBack:   { x: 7.0 + c.f[1] * stride, lift: lf(c.f[1]) },
      nearBack:  { x: 12.0 - c.f[2] * stride, lift: lf(c.f[2]) },
      farFront:  { x: 17.0 - c.f[3] * stride, lift: lf(c.f[3]) }
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

  /* --- walk is profile-only: a front-facing sprite sliding left and right
     * looks like moonwalking, so these live under side_* below. --- */

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

  /* --- sleep: one mound, the same way a loaf is. A sleeping cat has no
   * neck either, so the head flows into the shoulders rather than sitting on
   * them, and the ears lie flat rather than standing. --- */
  const sleepA = {
    eyes: 'closed', sleep: true, bodyDY: 1, squash: 1.2, mergeHead: true,
    earPerk: -2.2
  };
  pose('sleep_0', Object.assign({}, sleepA, { headDY: 2.4 }));
  pose('sleep_1', Object.assign({}, sleepA, { headDY: 2.0, squash: 1.7 }));

  /* --- react (petted / played with) --- */
  pose('react_0', { eyes: 'happy', earPerk: 1, bodyDY: -1, squash: -0.4 });
  pose('react_1', { eyes: 'open', earPerk: 1, squash: 0 });

  /* --- stretch: the long cat stretch, rump up and front paws slid forward.
   * Authored here, in profile — see the side section below for why this pose
   * is the clearest case for the whole two-view rule. --- */

  /* --- loaf: settling into a compact oval with her head down on her paws,
   * the way a cat conserves heat. --- */
  /* A loaf has to read as ONE mound. The failure mode is a head circle
   * sitting on a body circle with a visible neck between them, which is just
   * a sit and carries none of the meaning. So the head goes down far enough
   * to overlap the shoulders, the ears flatten and sweep back so they stop
   * breaking the outline, and the torso swells to close the gap. */
  const loafA = {
    bodyRX: 9.4, squash: 2.6, headDY: 3.6, headDX: 0, mergeHead: true,
    tailUp: 0.45, earPerk: -3.0, eyes: 'closed', pawLift: 1.6
  };
  pose('loaf_0', Object.assign({}, loafA));
  pose('loaf_1', Object.assign({}, loafA, { squash: 3.0, headDY: 3.9, pawLift: 1.9 }));

  /* --- nod: sitting up and nodding off.
   *
   * The thing that makes a cat do this is that she is losing a fight with
   * sleep while sitting, and the fight is the whole animation: the head goes
   * down, comes back up, goes down further, and eventually does not come back
   * up. A single "sleepy" pose would be a cat falling asleep, which is what
   * `sleep` already is; this is the bit before it, and it is the bit a viewer
   * recognises instantly.
   *
   * mergeHead throughout — a head hanging forward has no neck, and without it
   * the drooping frames draw a full circle round the skull sitting on the
   * shoulders, which is a cat looking down rather than a cat going to sleep. */
  const nodA = Object.assign({}, sitBase, { bodyDY: 0.4, tailUp: 0.3, mergeHead: true });
  pose('nod_1', Object.assign({}, nodA, { eyes: 'closed', headDY: 2.8, earPerk: -1.0 }));
  pose('nod_2', Object.assign({}, nodA, { eyes: 'closed', headDY: 4.4, earPerk: -1.4, squash: 1.3 }));
  /* the snap back: eyes wide, ears up, head high. This is the frame that
   * makes the droop read as a droop and not as a pose she chose. */
  pose('nod_3', Object.assign({}, sitBase, { eyes: 'wide', headDY: -0.6, earPerk: 1.0, tailUp: 0.5 }));

  /* --- bump: a headbutt into a hand.
   *
   * The first thing a cat does about a hand that arrives is not to enjoy it,
   * it is to push the top of its skull into it — scent glands, and an
   * assertion about who owns what. Hearts alone said "she likes this"; the
   * headbutt says she is participating.
   *
   * The head goes forward and down and slightly to one side, which is the
   * shape a cat actually makes: not a nuzzle, a press. mergeHead is off here
   * deliberately — the head is thrust *forward* and has to read as a separate
   * shape doing the thrusting, not as a skull settling into a body. --- */
  const bumpA = {
    eyes: 'closed', earPerk: 0.5, mouth: 'smile',
    bodyDY: 0.3, squash: 0.3, tailUp: 0.4
  };
  pose('bump_0', Object.assign({}, bumpA, { headDX: -1.6, headDY: 1.2 }));
  pose('bump_1', Object.assign({}, bumpA, { headDX: -2.4, headDY: 2.2, squash: 0.7 }));
  /* easing back out, head still down and to the side */
  pose('bump_2', Object.assign({}, bumpA, { headDX: -0.8, headDY: 0.6, squash: 0.1 }));

  /* --- shake: the full-body shudder she does the instant she is put down.
   *
   * headDX swings the whole skull side to side — the ears and face travel
   * with it, which is what makes it read as a shake rather than a glance.
   *
   * The swing has to be wide, and the ears have to change height between the
   * two beats. At a 32px sprite a 1.6px head shift is a pixel and a half of
   * nothing, and two frames differing by that much are the same picture. The
   * ears flicking is what actually carries at this size, so they get 1.4px of
   * travel of their own on top of the swing, and the torso rocks under it. */
  pose('shake_0', { eyes: 'closed', earPerk: 1.8, headDX: -2.8, headDY: 0.6, bodyDY: 0.4, tailUp: 0.5 });
  pose('shake_1', { eyes: 'closed', earPerk: 0.4, headDX: 2.8, headDY: 0.2, bodyDY: -0.4, tailUp: 0.5 });
  pose('shake_2', { eyes: 'happy', earPerk: 0.6, headDX: 0, headDY: -0.3, tailUp: 0.3 });

  /* --- alert: something caught her ear. Head up, ears forward, eyes wide.
   * Reads as attention rather than alarm because the mouth stays a smile. --- */
  pose('alert_0', { eyes: 'wide', earPerk: 1.3, headDY: -1.6, tailUp: 0.6, mouth: 'pant' });
  pose('alert_1', { eyes: 'open', earPerk: 1.1, headDY: -1.2, tailUp: 0.4 });

  /* --- knead: working a blanket with her forepaws. --- */

  /* --- settling into sleep: curling down over the sleep pose rather than
   * snapping into it. --- */
  pose('sleep_settle', { eyes: 'closed', sleep: true, bodyDY: 0.5, headDY: 1.4, squash: 0.6, earPerk: -1.6, mergeHead: true });

  /* Everything below this line moved to the profile rig: held, jump, eat,
   * drink, groom, wash, pounce and tree are all poses where what matters is
   * her body reaching or bending somewhere, and a front-facing sprite
   * cannot show it. They are authored under side_* below.
   *
   * Reinstating a front version is one pose() line — the rig still takes
   * pawLift / headDY / mouth — but leaving unused frames in a generated file
   * only invites confusion about which art is live. */

  /* ------------------------------------------------------------------
   * Side view — everything whose meaning is in her BODY, not her face.
   *
   * A front-facing sprite cannot show a neck bending down to a bowl, a paw
   * raised to a muzzle, a body reaching up at a toy, or legs hanging loose
   * from a hand. Those are the poses that belong in profile, so they are
   * authored here and named side_*. Authored facing right; mirrored at
   * draw time.
   *
   * The front rig above keeps the states that are about her FACE — idle,
   * sit, sleep, react — where the symmetry and the expression do the work.
   * ---------------------------------------------------------------- */

  /* walk: the full cycle, six frames — see WALK_CYCLE */
  for (let i = 0; i < 6; i++) {
    side('walk_' + i, Object.assign({ eyes: 'open' }, sideWalkPose(i)));
  }

  /* stretch: the long cat stretch, rump up and front paws slid forward.
   *
   * This is the clearest case for the rule the whole two-view system rests
   * on. The shape of a stretch *is* a spine uncoiling — a rear quarter
   * raised, a back dipped, forelegs reached out ahead of the chest — and a
   * spine is exactly what a front-on view cannot show. Authored front it was
   * a head circle on a body circle with her head up: correct pixels, and no
   * pose in them at all.
   *
   * In profile the same idea is mostly rig parameters: raise the torso, drop
   * the head toward the floor, slide the front legs forward while the rear
   * stay planted, and lift the tail. The rump reads as high because the
   * body is both raised and flattened (bodyY up, bodyRY down), which
   * lengthens the back into a slope rather than a hump. */
  const stretchA = {
    eyes: 'closed', earPerk: -0.8,
    bodyY: -1.0, bodyRX: 9.2, bodyRY: 4.4,
    headDX: 0.8, headDY: 4.6,
    legs: { farFront: { x: 23.0 }, nearFront: { x: 25.5 },
            farBack: { x: 8.0 }, nearBack: { x: 12.0 } },
    tail: { lift: 1.4, sway: 1.0 }
  };
  side('stretch_0', Object.assign({}, stretchA));                        /* into it */
  side('stretch_1', Object.assign({}, stretchA, {                        /* full stretch, held */
    bodyY: -1.4, headDY: 5.2, headDX: 1.2, tail: { lift: 2.0, sway: 1.2 }
  }));
  side('stretch_2', Object.assign({}, stretchA, {                        /* easing back */
    bodyY: -0.4, bodyRY: 5.0, headDY: 3.2,
    legs: { farFront: { x: 20.5 }, nearFront: { x: 23.0 }, farBack: { x: 8.5 }, nearBack: { x: 12.5 } },
    tail: { lift: 0.8, sway: 0.8 }
  }));
  /* stretch_3: returned to standing still. Every offset stretchA put in is
   * undone here — spine back to level, head up, forelegs gathered under her,
   * tail down, eyes open — because stretch_2 is only half eased: her spine is
   * partway up and her head is still down. Ending the stretch on it meant she
   * rotated out of a crouch she had never finished leaving, which is what made
   * the whole beat feel unfinished. The turn anchors on THIS, so it needs to
   * read as a cat standing still in profile. Same rig fields as stand_0. */
  side('stretch_3', Object.assign({}, stretchA, {
    eyes: 'open', earPerk: 0,
    bodyY: 0, bodyRX: null, bodyRY: null,
    headDX: 0, headDY: 0,
    legs: {}, tail: {}
  }));

  /* jump: crouch, tuck, stretch, land (the travel is the state machine's) */
  const tuck = { nearFront: { lift: 3 }, farFront: { lift: 3 }, nearBack: { lift: 3 }, farBack: { lift: 3 } };
  side('jump_0', { eyes: 'wide', earPerk: 1, bodyY: 1.6, squash: 0.8,
    legs: { nearFront: { lift: 1 }, farFront: { lift: 1 }, nearBack: { lift: 1 }, farBack: { lift: 1 } }, tail: { lift: 1 } });
  side('jump_1', { eyes: 'wide', earPerk: 1, bodyY: 0.5, squash: -0.8, legs: tuck, tail: { lift: 3 } });
  side('jump_2', { eyes: 'open', earPerk: 1, bodyY: -0.5, squash: -1.2,
    legs: { nearFront: { lift: 2 }, farFront: { lift: 2 }, nearBack: { lift: 1 }, farBack: { lift: 1 } }, tail: { lift: 2 } });
  side('jump_3', { eyes: 'open', bodyY: 1.2, squash: 1.0,
    legs: { nearFront: { lift: 1 }, farFront: { lift: 1 } }, tail: { sway: 1.2 } });

  /* stalk: the low creep before a pounce.
   *
   * A cat does not simply decide to pounce. It drops almost flat, freezes,
   * creeps forward with its belly near the floor, and its tail starts to
   * lash. That is the tell — and the reason this is separate from `pounce`,
   * which is the launch itself. Three frames: down and long, lower and longer
   * with the tail swung out, then the rear coming up as she coils to spring.
   *
   * The body does the work here — a long low torso, head thrust forward past
   * the shoulders, legs crouched almost under the chest — so profile, for the
   * same reason as the stretch. */
  const stalkA = {
    eyes: 'wide', earPerk: 0.8, mouth: 'open',
    bodyY: 2.8, bodyRX: 9.6, bodyRY: 3.0,   /* long and low, near the floor */
    headDX: 1.6, headDY: 1.4,                /* chin forward, level with the spine */
    legs: { farFront: { x: 18.0, lift: 2.5 }, nearFront: { x: 20.0, lift: 2.5 },
            farBack: { x: 8.0, lift: 2.5 }, nearBack: { x: 11.0, lift: 2.5 } },
    tail: { sway: -1.6, lift: 0.4 }
  };
  side('stalk_0', Object.assign({}, stalkA));
  side('stalk_1', Object.assign({}, stalkA, {          /* longer still, tail out */
    bodyY: 3.2, bodyRX: 10.0, bodyRY: 2.8, headDX: 2.0,
    tail: { sway: 1.8, lift: 1.0 }
  }));
  side('stalk_2', Object.assign({}, stalkA, {          /* rear up, coiling */
    eyes: 'wide', earPerk: 1.2,
    bodyY: 2.0, bodyRX: 8.8, bodyRY: 3.6, headDX: 1.6, headDY: 0.6,
    legs: { farFront: { x: 20.0, lift: 3.5 }, nearFront: { x: 22.0, lift: 3.5 },
            farBack: { x: 7.5, lift: 1.5 }, nearBack: { x: 10.5, lift: 1.5 } },
    tail: { sway: -0.4, lift: 2.2 }
  }));

  /* scratch: raking the post.
   *
   * One of the few things a cat does with real commitment — she goes up on
   * her back legs and commits to it, alternating forelegs hard enough that
   * the whole body rocks with it. It is a forepaw doing work against a
   * vertical surface, so profile, and the near forepaw is drawn over the head
   * (see the raised-paw rule in buildSideParts) because it is in front of it.
   *
   * Three frames, because a two-frame loop at this speed is a flicker: both
   * forelegs high and rocked back, the near one raked down while the far one
   * comes up, then high again with the weight the other way. */
  const scratch = (nearLift, farLift, bodyY, headDY) => ({
    bodyY: bodyY, bodyRX: 6.4, bodyRY: 4.2,
    headDX: 0.8, headDY: headDY,
    eyes: 'wide', earPerk: 0.4, mouth: 'open',
    legs: { farBack: { hide: true }, nearBack: { lift: 1 },
            farFront: { x: 20.5, lift: farLift },
            nearFront: { x: 22.0, lift: nearLift } },
    tail: { sway: 1.2, lift: 1.6 }
  });
  /* The paw has to come up past the shoulder or it is behind the body and
   * the pose is just a cat standing up. Above the head it is drawn in front
   * of the face, which is what a raking forepaw looks like. */
  side('scratch_0', scratch(18, 11, -2.6, -0.6));  /* both up, rocked back */
  side('scratch_1', scratch(11, 19, -1.6, 0.4));   /* near raked down, far up */
  side('scratch_2', scratch(19, 11, -2.8, -0.8));  /* high again, weight back */

  /* pounce: the yarn-ball lunge — coil, spring, land */
  side('pounce_0', { eyes: 'wide', earPerk: 1, bodyY: 2.2, squash: 1.4, headDY: 1.0,
    legs: { nearFront: { lift: 2 }, farFront: { lift: 2 }, nearBack: { hide: true }, farBack: { hide: true } },
    tail: { sway: -1.5, lift: 1 } });
  side('pounce_1', { eyes: 'wide', earPerk: 1, bodyY: 0.5, squash: -1.0, headDX: 1.0,
    legs: { nearFront: { lift: 4 }, farFront: { lift: 4 }, nearBack: { lift: 3 }, farBack: { lift: 3 } },
    tail: { lift: 3 } });
  side('pounce_2', { eyes: 'open', earPerk: 0.5, bodyY: 1.0, headDX: 1.5,
    legs: { nearFront: { lift: 1 }, farFront: { lift: 1 } }, tail: { sway: 1.8 } });

  /* eat / drink: the neck bends down and forward to the bowl. `headDX`
     carries the muzzle toward it; a front view could only drop the head
     straight down, which reads as her staring at the floor. */
  const atBowl = { bodyY: 1.0, headDX: 2.5 };
  side('eat_0', Object.assign({ eyes: 'open', mouth: 'open', headDY: 5.5 }, atBowl));
  side('eat_1', Object.assign({ eyes: 'closed', mouth: 'smile', headDY: 5.0 }, atBowl));
  side('eat_2', Object.assign({ eyes: 'closed', mouth: 'open', headDY: 5.5 }, atBowl));
  side('drink_0', Object.assign({ eyes: 'open', mouth: 'open', headDY: 6.5 }, atBowl));
  side('drink_1', Object.assign({ eyes: 'closed', mouth: 'pant', headDY: 6.0 }, atBowl));

  /* groom / wash: seated with a forepaw raised to her muzzle, back paws
     tucked out of sight. The lifted paw is the whole point, so profile.
   *
   * The body has to sit HIGH and shallow for the paw to be visible at all:
   * legs are drawn from legTop (24 + bodyY) down to the floor, so a big low
   * torso simply swallows them and the raised paw ends up as a four-pixel
   * blob inside the belly. Seated cats are small and upright anyway. */
  const seated = (pawLift) => ({
    bodyRX: 6.6, bodyRY: 4.8, bodyY: -1.0, headDX: -0.5,
    legs: { farBack: { hide: true }, farFront: { hide: true }, nearBack: { hide: true },
            nearFront: { x: 20.0, lift: pawLift } },
    tail: { sway: 2.2, lift: -2.0, curl: 1.6 }
  });
  side('groom_0', Object.assign({ eyes: 'happy', mouth: 'open', headDY: 2.2 }, seated(12)));
  side('groom_1', Object.assign({ eyes: 'open', mouth: 'smile', headDY: 1.6 }, seated(13)));
  side('wash_0', Object.assign({ eyes: 'closed', mouth: 'open', headDY: 3.6 }, seated(10)));
  side('wash_1', Object.assign({ eyes: 'closed', mouth: 'pant', headDY: 3.0 }, seated(11)));

  /* knead: working a blanket with her forepaws.
   *
   * Moved to profile for the same reason as the stretch. A forepaw pressing
   * into something is a leg doing work, and the front rig has no legs — two
   * paw ellipses merged into the torso, which cannot be seen to press. The
   * front version read as a cat sitting with her head down.
   *
   * Groom is already here and shares the seated base, so the two are built to
   * be told apart by what the paw is doing: knead presses *down* into the
   * blanket with the head down watching it work, groom lifts the paw *up* to
   * the muzzle. The press is a bigger forepaw lift than the groom paw, taken
   * lower, and the head sits further forward and down over it. */
  const knead = (pawLift, bodyY) => ({
    bodyRX: 7.0, bodyRY: 5.0, bodyY: bodyY, headDX: -1.2,
    eyes: 'closed', earPerk: -0.7, mouth: 'open',
    legs: { farBack: { hide: true }, farFront: { hide: true },
            nearBack: { hide: true }, nearFront: { x: 20.5, lift: pawLift } },
    tail: { sway: 1.8, lift: -0.6, curl: 1.2 }
  });
  side('knead_0', Object.assign({ headDY: 4.0 }, knead(0, -0.6)));    /* paw pushed out */
  side('knead_1', Object.assign({ headDY: 3.4 }, knead(3.4, 0.2)));   /* paw drawn back */

  /* cat tree: standing tall, reaching up at the hanging toy.
   *
   * Three frames for the same reason scratch has three: a two-frame loop
   * alternates between two extremes and reads as a flicker, and what it leaves
   * out is the paw on its way back down. The middle frame is that, and it is
   * what makes a bat look struck rather than swapped. */
  side('tree_0', { eyes: 'open', earPerk: 1.2, bodyY: -0.6, headDY: -2.0,
    legs: { nearFront: { lift: 2 }, farFront: { lift: 2 } }, tail: { sway: 1.0, lift: 1 } });
  side('tree_1', { eyes: 'happy', earPerk: 1.6, bodyY: -1.2, headDY: -3.0,
    legs: { nearFront: { lift: 4 }, farFront: { lift: 4 }, nearBack: { lift: 1 } }, tail: { sway: 0.5, lift: 2 } });
  /* halfway between the two, not a copy of either: the body is still up, the
   * paw is still off the floor, and the head has already come off the toy */
  side('tree_2', { eyes: 'happy', earPerk: 1.4, bodyY: -0.9, headDY: -2.5,
    legs: { nearFront: { lift: 3 }, farFront: { lift: 3 }, nearBack: { lift: 0.5 } }, tail: { sway: 0.75, lift: 1.5 } });

  /* held: dangling from a hand, legs hanging loose. In profile the drop of
     the paws and the drag of the tail actually read; face-on they just look
     like a standing cat with its feet off the ground. */
  /* held: the whole arc of being picked up, not one looping dangle. There is
   a "!" the instant her paws leave the floor, then the hang, a couple of
   startled kicks, and finally settling. Each stage says something different
   and none of them can be substituted for another. */
  const hang = l => ({
    farBack: { lift: l }, farFront: { lift: l },
    nearBack: { lift: l }, nearFront: { lift: l }
  });
  /* the "!": body stretched tall, ears flat up, paws splayed clear of it */
  side('held_lift', { eyes: 'wide', earPerk: 1.8, bodyY: -0.5, squash: -0.6,
    legs: { farBack: { lift: -1 }, farFront: { x: 20.5, lift: -1 },
            nearBack: { lift: -1 }, nearFront: { x: 24.5, lift: -1 } },
    tail: { sway: 0.6, lift: 2.0 } });
  /* hanging: loose paws, tail dragged straight down */
  side('held_dangle_0', { eyes: 'open', earPerk: 1.2, bodyY: 1.2, legs: hang(-2), tail: { sway: 0 } });
  side('held_dangle_1', { eyes: 'open', earPerk: 1.0, bodyY: 1.6, legs: hang(-2.6), tail: { sway: 0.6 } });
  /* startled kicking: forepaws come forward, tail lashes */
  side('held_kick_0', { eyes: 'wide', earPerk: 1.5, bodyY: 0.8,
    legs: { farBack: { lift: -1 }, farFront: { x: 20.0, lift: 2 }, nearBack: { lift: -1 }, nearFront: { x: 24.0, lift: 2 } },
    tail: { sway: -1.8, lift: 1.0 } });
  side('held_kick_1', { eyes: 'wide', earPerk: 1.3, bodyY: 1.4,
    legs: { farBack: { lift: -2 }, farFront: { x: 19.0, lift: 4 }, nearBack: { lift: -2 }, nearFront: { x: 23.0, lift: 4 } },
    tail: { sway: 1.8, lift: 0.4 } });
  /* settled into it: half-shut, slow breathe */
  side('held_calm_0', { eyes: 'closed', earPerk: 0.4, bodyY: 1.2, legs: hang(-1.6), tail: { sway: 0.4 } });
  side('held_calm_1', { eyes: 'closed', earPerk: 0.2, bodyY: 1.6, legs: hang(-2.0), tail: { sway: -0.4 } });

  /* turn: the bridge between the two views. A body turning is what makes
     the front and profile sprites one system instead of a hard cut, so
     these sit between a front pose and a profile pose: the skull swings
     back over the shoulders and the torso narrows as she comes round.
     Authored turning to the right; the flip handles the other way. */
  /* stand: at rest in profile. The anchor on the profile side of a turn, and
     * what she holds while watching something without walking to it. */
  side('stand_0', { eyes: 'open', bodyY: 0 });
  side('stand_1', { eyes: 'open', bodyY: -0.6, headDY: -0.7, legs: {
    farBack: { lift: 0.5 }, farFront: { lift: 0.5 }, nearBack: { lift: 0.5 }, nearFront: { lift: 0.5 } } });

  /* turn: the bridge between the two views. A body turning is what makes
     * the front and profile sprites one system instead of a hard cut, so
     * these sit between a front pose and a profile pose: the torso rounds
     * off toward the viewer, the skull swings back over the shoulders and
     * the second eye appears. Authored turning to the right; the flip
     * handles the other way. */
  side('turn_1', { eyes: 'open', twoEyes: true, headDX: -5.0, bodyRX: 8.2, bodyRY: 6.0,
    legs: { farBack: { x: 9.0 }, farFront: { x: 17.5 }, nearBack: { x: 13.0 }, nearFront: { x: 20.5 } },
    tail: { sway: 0.4, lift: -2.4 } });
  side('turn_2', { eyes: 'open', twoEyes: true, headDX: -2.0, bodyRX: 8.4, bodyRY: 5.2,
    legs: { farBack: { x: 8.0 }, farFront: { x: 17.0 }, nearBack: { x: 12.5 }, nearFront: { x: 21.0 } },
    tail: { sway: 0.2, lift: -1.6 } });

  TAIL_MASKS = TAIL_OF;
  return out;
}

/* ============================================================
 * THE ROOM'S OBJECTS
 *
 * The same framework, used for the furniture. This is not tidiness — it is
 * what makes a scene object *addressable*.
 *
 * The room was 184 calls to rect/disc/pxLine, which is a picture and nothing
 * else: nothing in a pile of drawing calls knows how big the yarn ball is, so
 * there is no way to ask whether a click landed on it, and no way to stop a
 * cat walking through the plant. Both of those were true — she could be
 * dropped exactly onto the planter and the game was perfectly happy about it.
 *
 * As frames, the same data answers all three questions at once. A frame has a
 * width and a height, so it *is* the hit box and it *is* the collider; the
 * string that draws it is the thing you point at. One source, no bookkeeping
 * that can disagree with what is on screen.
 *
 * Each object carries its own `charColors`, so a palette is local to the
 * object rather than being one global table the cat and the furniture both
 * have to agree about.
 * ============================================================ */

/* A char grid of any rectangular size — the cat rig is fixed at 32x32, the
 * room's objects are whatever they actually are. */
function gridOf(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill('.'));
}
function toRows(G) { return G.map(r => r.join('')); }

/* The yarn ball: six frames of the wind at different phases, so it rolls by
 * cycling frames the way everything else here does rather than by being
 * redrawn with a live phase. Sixteen wide, so the unravelled strand trailing
 * off to the left has somewhere to live. */
function yarnFrames() {
  /* Twenty wide, not sixteen. The ball is 11 across and sits to the right of
   * the frame so the unravelled strand has somewhere to lie: at 16 wide with
   * the ball centred, there was room for two pixels of strand and what came
   * out was a detached dash on the floor a few pixels from the ball, which
   * looked like litter rather than wool.
   *
   * The strand's own slack is the point — a ball of wool that has been rolled
   * around a room has a tail, and where it lies is most of how you know it
   * moved. So it undulates, and the undulation carries the roll phase, which
   * means the tail flicks as the ball turns.
   */
  const W = 20, H = 12, cx = 13, cy = 6, r = 5;
  const out = {};
  for (let f = 0; f < 6; f++) {
    const G = gridOf(W, H);
    const phase = (f / 6) * Math.PI * 2;
    const put = (x, y, c) => {
      x = Math.round(x); y = Math.round(y);
      if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = c;
    };
    /* the strand: off the left of the ball, lying along the floor, slack
     * enough to loop once. It starts *under* the ball's edge so there is no
     * gap between the two. */
    for (let s = 0; s <= 40; s++) {
      const t = s / 40;
      const x = cx - r + 1 - t * 11;
      const y = cy + 3.4 + Math.sin(t * 5.2 + phase * 0.5) * 1.5;
      put(x, y, 'S');
      if (t < 0.35) put(x, y + 1, 'S');   /* two thick where it leaves the ball */
    }
    /* the ball: outline, body */
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > r) continue;
        put(x, y, d > r - 1 ? 'k' : 'Y');
      }
    }
    /* three windings, their phase carrying the rotation */
    for (let k = 0; k < 3; k++) {
      const a0 = phase + (k * Math.PI * 2) / 3;
      for (let s = -4; s <= 4; s++) {
        const w = r - 1 - Math.abs(s) * 0.6;
        if (w <= 0) continue;
        put(cx + Math.sin(a0 + s * 0.42) * w, cy + s, 'y');
      }
    }
    /* the light, from the window: upper left */
    put(cx - 2, cy - 2, 'W');
    put(cx - 1, cy - 3, 'W');
    out['yarn_' + f] = toRows(G);
  }
  return out;
}

/* The two bowls.
 *
 * What they replaced was two flat concentric discs — a dark ring and a
 * coloured one — which is the least a bowl can look like. You could not tell
 * it was a bowl rather than a coaster, and she put her nose in it.
 *
 * What they are now is a rim seen slightly from above: an ellipse for the
 * opening, with a front wall below it narrowing to a foot. The contents fill
 * the ellipse to a level and the surface catches the window in a couple of
 * bright pixels, so an empty bowl and a full one are different pictures and
 * she is never visibly eating out of one she has already finished.
 *
 * An earlier version drew the silhouette the wrong way up — narrow at the rim
 * and wide at the base, which is a funnel, and the cat looked like she was
 * eating out of a traffic cone. */
function bowlFrames() {
  const W = 14, H = 9, out = {};
  const CX = 7, CY = 3.5, RX = 6.4, RY = 2.2;   /* the rim opening */
  const FOOT = 8;                               /* the last row of the wall */
  const bowl = (fillChar, level) => {
    const G = gridOf(W, H);
    const put = (x, y, c) => {
      x = Math.round(x); y = Math.round(y);
      if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = c;
    };
    /* how far the bowl reaches at each row: the ellipse while it is the rim,
     * then the wall tapering in to the foot */
    const rimBot = CY + RY;
    const reach = y => {
      if (y <= rimBot) {
        const dy = (y - CY) / RY;
        return dy >= -1 && dy <= 1 ? RX * Math.sqrt(1 - dy * dy) : 0;
      }
      const t = (y - rimBot) / (FOOT - rimBot);
      return RX * (1 - t * 0.55);
    };
    /* the body */
    for (let y = Math.floor(CY - RY); y <= FOOT; y++) {
      const hw = reach(y);
      if (hw <= 0.4) continue;
      /* The span is floored, not rounded, so both ends of the row are real
       * integers and the outline test below always has something to catch.
       * Testing against the float width instead meant rows whose fractional
       * span fell just short got no outline at all, and the bowl had a soft
       * fringe on its widest rows. */
      const n = Math.floor(hw);
      for (let x = -n; x <= n; x++) {
        const edge = Math.abs(x) === n;
        /* the first row below the opening is the rim's near lip: lighter
         * than the wall under it, which is what makes it read as a lip and
         * not as a seam */
        const lip = y === Math.ceil(rimBot);
        put(CX + x, y, edge ? 'k' : (lip ? 'R' : 'C'));
      }
    }
    /* the contents, filling the ellipse to `level` (0 empty, 1 brimming) */
    if (fillChar && level > 0) {
      const surface = CY - RY + (1 - level) * (RY * 2 - 1);
      for (let y = Math.ceil(surface); y <= Math.floor(rimBot); y++) {
        const dy = (y - CY) / RY;
        const inner = Math.floor(RX * Math.sqrt(Math.max(0, 1 - dy * dy))) - 1;
        if (inner < 0) continue;
        for (let x = -inner; x <= inner; x++) {
          put(CX + x, y, fillChar);
        }
      }
      /* the surface catches the window */
      for (let x = -2; x <= 2; x++) put(CX + x, Math.round(surface), 'l');
    }
    return G;
  };
  /* two states each, which is all the animation a bowl needs: it is either
   * there or it has been eaten. The surface drops as it goes, so the full
   * frame and the empty frame are not just a fill appearing and vanishing. */
  out.bowl_food = toRows(bowl('F', 0.85));
  out.bowl_food_empty = toRows(bowl(null, 0));
  out.bowl_water = toRows(bowl('W', 0.9));
  out.bowl_water_empty = toRows(bowl(null, 0));
  return out;
}

/* Char palettes, per object. These are the *unlit* colours: scene.js passes
 * ambient + ambientAmt to Sprite.draw, which mixes them the same way the
 * hand-drawn room did, so an object that becomes a sprite does not also
 * change how the light falls on it. */
const SCENE_PALETTES = {
  yarn: {
    k: '#b04468', Y: '#e79ab5', y: '#c96b8c', W: '#ffd9e6', S: '#d97f9d'
  },
  bowl: {
    k: '#2b1c14', C: '#8a5c31', R: '#a06a3c', l: '#ffffff',
    F: '#c06a2e', W: '#4a9fd8'
  },
  plant: {
    k: '#2c1a10', C: '#7a4423', R: '#b5763f', D: '#6d3c1f', E: '#3c2a1a',
    S: '#3f7a30', G: '#4f8f3a', H: '#6fb854'
  },
  tree: {
    k: '#241608', W: '#7a4f28', d: '#4a3018', L: '#9a6c38',
    R: '#c9a86b', r: '#a3854f', C: '#3a2412', T: '#e76e55', U: '#f3a08c'
  },
  toy: {
    k: '#6b5a2a', Y: '#f2c230', l: '#fff3a8', d: '#a8862a'
  }
};

/* ---------- a line, on a char grid -------------------------------------- */

/* Bresenham into a grid. The cat rig has its own, but that one paints; this
 * one stamps characters, and it has to respect whatever is already there — a
 * stem crossing a leaf should not erase the leaf. */
function pxLineTo(G, x0, y0, x1, y1, ch, W, H) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H && G[y0][x0] === '.') G[y0][x0] = ch;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= -dy) { err -= dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function discOn(G, cx, cy, r, ch, W, H, onlyEmpty) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r + r * 0.4) continue;
      const px = Math.round(cx + x), py = Math.round(cy + y);
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      if (onlyEmpty && G[py][px] !== '.') continue;
      G[py][px] = ch;
    }
  }
}

/* ---------- the plant ---------------------------------------------------
 *
 * Eight frames of the fronds swaying, each frond offset three frames from its
 * neighbour so they never move in lockstep — which is what the hand-drawn one
 * did with `Math.sin(t*0.9 + i*0.85)`, quantised to a loop.
 *
 * The loop rate is a deliberate change rather than a translation. The original
 * period was seven seconds, and eight frames over seven seconds is a bit over
 * one frame a second, which for a *sway* is a stutter rather than a movement.
 * Two seconds is twice as fast and still the same gesture, and it is the rate
 * the room's other loops run at.
 *
 * Anchored on the base of the pot, forty wide because the outermost frond
 * reaches fifteen to the side and its leaf is five more. Anchored on anything
 * narrower the two outside leaves are simply cropped off, and a plant with
 * its edges shaved off reads as a mistake rather than as a crop.
 */
function plantFrames() {
  const W = 40, H = 42, CX = 20, BASE = H - 1;
  const FRONDS = [
    { a: -1.05, len: 17, r: 4 }, { a: -0.55, len: 21, r: 5 },
    { a: 0.00, len: 24, r: 5 }, { a: 0.55, len: 21, r: 5 },
    { a: 1.05, len: 17, r: 4 }
  ];
  const out = {};
  for (let f = 0; f < 8; f++) {
    const G = gridOf(W, H);
    /* soil line: the top of the pot, where the fronds come out */
    const soilY = BASE - 15;

    for (let i = 0; i < FRONDS.length; i++) {
      const fr = FRONDS[i];
      /* three frames of offset between neighbours, so over the eight-frame
       * loop each frond runs a full cycle and no two are ever in step */
      const sway = Math.sin(((f + i * 3) / 8) * Math.PI * 2) * 1.7;
      const ex = CX + Math.sin(fr.a) * fr.len + sway;
      const ey = soilY - Math.cos(fr.a) * fr.len + Math.abs(sway) * 0.4;
      pxLineTo(G, CX, soilY, ex, ey, 'S', W, H);
      discOn(G, ex, ey, fr.r, 'G', W, H);
      /* the catch-light on the top of each leaf */
      G[Math.round(ey) - 1][Math.round(ex) - 1] = 'H';
      G[Math.round(ey) - 1][Math.round(ex)] = 'H';
    }

    /* the pot, over the roots of the stems: a terracotta body, a lit lip, a
     * dark rim and the soil line the stems come out of */
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 22; x++) {
        const py = BASE - 16 + y;
        G[py][CX - 11 + x] =
          (y === 0) ? 'k' : (y === 1 ? 'R' : (y === 2 ? 'D' : (x === 0 || x === 21 ? 'k' : 'C')));
      }
    }
    /* the soil, and the shadow it throws on the inside of the pot */
    for (let x = -9; x <= 9; x++) { G[BASE - 15][CX + x] = 'D'; G[BASE - 14][CX + x] = 'E'; }
    out['plant_' + f] = toRows(G);
  }
  return out;
}

/* ---------- the cat tree ------------------------------------------------
 *
 * One frame: it does not move. Anchored at the left of the lower perch rather
 * than at the plinth, because the perch overhangs the plinth on the left and
 * anchoring on the plinth would crop it.
 *
 * Two details from the hand-drawn version are preserved because they were
 * right and are easy to lose: the rope's seam moves right as it climbs, which
 * is what a spiral does and what stops it reading as the rungs of a ladder;
 * and the plinth is stamped last, so the post stands *in* the base rather than
 * on it. The post is otherwise drawn straight over the top of the plinth and
 * the base reads as a shadow behind a stick.
 */
function treeFrames() {
  /* frame coords are world minus (188, 55) */
  const W = 52, H = 84, out = {};
  const G = gridOf(W, H);
  const rect = (x, y, w, h, ch) => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (xx >= 0 && xx < W && yy >= 0 && yy < H) G[yy][xx] = ch;
      }
    }
  };
  const postX = 21, postTop = 7, postBot = 82;

  /* the post, wrapped in rope */
  rect(postX, postTop, 8, postBot - postTop, 'r');
  for (let y = postTop; y < postBot; y += 3) {
    rect(postX, y, 8, 2, 'R');
    const seam = postX + (Math.floor((y - postTop) / 6) % 2 ? 6 : 1);
    rect(seam, y, 1, 2, 'r');
  }

  /* lower perch, cantilevered left, with a bracket under its inner end */
  rect(1, 44, 22, 5, 'W');
  rect(1, 44, 22, 1, 'L');
  rect(1, 48, 22, 1, 'k');
  rect(12, 45, 3, 5, 'C');

  /* middle platform, with a lip standing proud at each end */
  rect(10, 22, 30, 6, 'W');
  rect(10, 22, 30, 1, 'L');
  rect(10, 27, 30, 1, 'k');
  rect(10, 22, 2, 6, 'd');
  rect(38, 22, 2, 6, 'd');

  /* top bed: a tray with raised sides and a cushion sitting in it */
  rect(14, 0, 34, 9, 'W');
  rect(14, 0, 34, 1, 'L');
  rect(14, 8, 34, 1, 'k');
  rect(14, 0, 3, 9, 'd');
  rect(45, 0, 3, 9, 'd');
  rect(18, 3, 26, 4, 'T');
  rect(18, 3, 26, 1, 'U');

  /* the plinth, last, so the post stands in it rather than on it */
  rect(4, 77, 46, 6, 'W');
  rect(4, 77, 46, 1, 'L');
  rect(4, 82, 46, 1, 'k');
  rect(8, 78, 38, 4, 'd');
  rect(8, 78, 38, 1, 'L');

  out.tree = toRows(G);
  return out;
}

/* ---------- the hanging toy ---------------------------------------------
 *
 * Five frames of the pendulum, string and ball together. The string is part
 * of the frame rather than a pxLine so that the whole toy is one addressable
 * object with one size — the same reason the yarn's unravelled strand is in
 * its frame.
 */
function toyFrames() {
  /* Thirty-two tall, not twenty-eight: the ball's centre sits 26px below the
   * pivot and it is six across, so the last row of its shading fell off the
   * bottom of a shorter frame. The unused-colour note in --check is how that
   * showed up. */
  const W = 11, H = 32, out = {};
  for (let f = 0; f < 5; f++) {
    const G = gridOf(W, H);
    const put = (x, y, c) => {
      x = Math.round(x); y = Math.round(y);
      if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = c;
    };
    /* -1 .. 1 across the swing, which is the ±5px the hand-drawn version used */
    const swing = Math.sin((f / 5) * Math.PI * 2) * 4;
    /* the pivot is at the top-centre of the frame */
    const px = 5 + swing, py = 26;
    pxLineTo(G, 5, 0, px, py, 'k', W, H);
    discOn(G, px, py + 2, 3, 'Y', W, H);
    put(px - 1, py + 1, 'l');
    put(px, py + 1, 'l');
    /* the shaded underside */
    for (let x = -2; x <= 2; x++) put(px + x, py + 4, 'd');
    out['toy_' + f] = toRows(G);
  }
  return out;
}

/* Everything the room draws through the sprite API, as data. */
function sceneSprites() {
  return {
    yarn: { name: 'yarn', charColors: SCENE_PALETTES.yarn, frames: yarnFrames() },
    bowl: { name: 'bowl', charColors: SCENE_PALETTES.bowl, frames: bowlFrames() },
    plant: { name: 'plant', charColors: SCENE_PALETTES.plant, frames: plantFrames() },
    tree: { name: 'tree', charColors: SCENE_PALETTES.tree, frames: treeFrames() },
    toy: { name: 'toy', charColors: SCENE_PALETTES.toy, frames: toyFrames() }
  };
}

/* ---------- output --------------------------------------------------- */

function toAscii(rows) {
  return rows.map((r, i) => String(i).padStart(2, '0') + ' ' + r).join('\n');
}

let TAIL_MASKS = {};   /* filled in by frames() */

const mode = process.argv[2] || '--preview';
const F = frames();
const S = sceneSprites();

/* Scene-object frames get their own, much looser, checks than the cat's.
 * The cat is 32x32 and front-facing, so it can be held to mirror symmetry and
 * to a fixed grid. A yarn ball is 16x12 and is a ball; the only things worth
 * asserting about it are that it is rectangular, that every character it
 * uses has a colour (otherwise it renders magenta and nobody notices for a
 * month), and that it is not empty. */
function checkScene() {
  let bad = 0;
  for (const set of Object.keys(S)) {
    const sprite = S[set];
    const chars = new Set();
    for (const name of Object.keys(sprite.frames)) {
      const rows = sprite.frames[name];
      const w = rows[0].length;
      if (!w || !rows.length) { bad++; console.log('BAD scene ' + set + '/' + name + ': empty'); continue; }
      let ink = 0;
      for (let y = 0; y < rows.length; y++) {
        if (rows[y].length !== w) {
          bad++; console.log('BAD scene ' + set + '/' + name + ' row ' + y + ': ' + rows[y].length + ' cols, expected ' + w);
          continue;
        }
        for (let x = 0; x < w; x++) {
          const c = rows[y][x];
          if (c === '.') continue;
          ink++;
          chars.add(c);
          if (!sprite.charColors[c]) {
            bad++; console.log('BAD scene ' + set + '/' + name + ": char '" + c + "' has no colour in " + set);
          }
        }
      }
      if (!ink) { bad++; console.log('BAD scene ' + set + '/' + name + ': frame is empty'); }
    }
    for (const c of Object.keys(sprite.charColors)) {
      if (!chars.has(c)) {
        console.log('note: ' + set + ' declares colour ' + c + ' that no frame uses');
      }
    }
  }
  return bad;
}

/* Mechanical verification, per view.
 *
 * FRONT frames must mirror — that symmetry is the entire reason for the
 * front-on sprite, and it is what lets one frame read as facing left or
 * right. Exemptions there are deliberate: the tail (read from the exact
 * mask the builder stamped, since a raised tail sits far higher than a
 * hanging one), the alternating walk paw, the eye glance, the one-paw-up
 * grooming poses, and the two poses that press her head to one side — the
 * shake on landing and the headbutt into a hand, both of which are the head
 * travelling sideways on purpose.
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
        const shaking = k.indexOf('shake') === 0;
        const bumping = k.indexOf('bump') === 0;
        if (tail && tail[y][x]) continue;              /* the tail */
        if (walking && y >= 26) continue;              /* alternating paw */
        if (looking) continue;                         /* eye glance */
        if (onePaw) continue;                          /* one paw raised */
        if (shaking) continue;                         /* head swung side to side */
        if (bumping) continue;                         /* head pressed to one side */

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
  const bad = checkFrames();
  const sbad = checkScene();
  if (bad === 0 && sbad === 0) {
    const sf = Object.values(S).reduce((n, s) => n + Object.keys(s.frames).length, 0);
    console.log('SCENE CHECK OK — ' + sf + ' object frames in ' + Object.keys(S).length +
      ' sprites, every char coloured');
  }
  process.exit(bad === 0 && sbad === 0 ? 0 : 1);
} else if (mode === '--build') {
  const lines = [];
  lines.push('/* ============================================================');
  lines.push(' * NES-cat — frames.js');
  lines.push(' * Literal pixel frames: Shiro at 32x32, the room’s objects at');
  lines.push(' * whatever size they actually are.');
  lines.push(' *');
  lines.push(' * GENERATED by tools/build-sprites.js — edit the tool, not this file.');
  lines.push(' *');
  lines.push(' * Char legend for Shiro:  . transparent   K outline   W body');
  lines.push(' *               H shade        G deep shade  P pink   N nose');
  lines.push(' *               E eye          B blush        M mouth');
  lines.push(' *');
  lines.push(' * The room’s objects are a second table, and a second idea: each one');
  lines.push(' * carries its own charColors rather than sharing the cat’s, because a');
  lines.push(' * ball of wool and a cat are made of different things.');
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
  lines.push('');
  lines.push('  /* The room, as sprites: one entry per object, each with its own');
  lines.push('   * palette. scene.js makes these with the same makeSprite() the cat');
  lines.push('   * uses, so a frame is a hit box and a collider as well as a');  lines.push('   * picture. */');
  lines.push('  NESCAT.sceneSprites = {');
  Object.keys(S).forEach((set, si) => {
    const sprite = S[set];
    lines.push('    ' + set + ': {');
    lines.push("      name: '" + sprite.name + "',");
    lines.push('      charColors: {');
    Object.keys(sprite.charColors).forEach((c, ci) => {
      lines.push("        '" + c + "': '" + sprite.charColors[c] + "'" +
        (ci === Object.keys(sprite.charColors).length - 1 ? '' : ','));
    });
    lines.push('      },');
    lines.push('      frames: {');
    Object.keys(sprite.frames).forEach((k, i) => {
      lines.push('        ' + k + ': [');
      sprite.frames[k].forEach(r => lines.push("          '" + r + "',"));
      lines.push('        ]' + (i === Object.keys(sprite.frames).length - 1 ? '' : ','));
    });
    lines.push('      }');
    lines.push('    }' + (si === Object.keys(S).length - 1 ? '' : ','));
  });
  lines.push('  };');
  lines.push("})(typeof window !== 'undefined' ? window : globalThis);");
  lines.push('');
  const outPath = path.join(__dirname, '..', 'NES-cat', 'js', 'frames.js');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  const sf = Object.values(S).reduce((n, s) => n + Object.keys(s.frames).length, 0);
  console.log('wrote ' + outPath + '  (' + Object.keys(F).length + ' cat frames, ' +
    sf + ' object frames)');
} else if (mode === '--rig2-preview') {
  /* rig2 is required HERE, lazily, so no other path ever loads it. The
   * frame build above is untouched and cannot be reached from this file
   * by accident. `--check` and `--build` never call it. */
  const rig2 = require('./rig2.js');
  const host = {
    W, H, grid, emptyMask, maskOr, maskEllipse, maskTri,
    paint, px, shadeBelow, stampCurve, toAscii
  };

  const ts = process.argv.slice(3).filter(a => !isNaN(parseFloat(a))).map(parseFloat);
  const at = ts.length ? ts : [0, 0.25, 0.5, 0.75];
  const useOld = process.argv.indexOf('--old') >= 0;
  const LEGS_R2 = rig2.LEG_KEYS;

  /* One frame in the repo's own --preview format, plus the resolved joint
   * angles, because the question this mode exists to answer is whether a
   * leg FOLDS at a fractional phase and the angles are the evidence. */
  const dump = (label, p) => {
    const d = rig2.drawFrame(p, host);
    console.log('\n== ' + label + ' ==');
    console.log(host.toAscii(d.rows));
    console.log('  ' + LEGS_R2.filter(k => d.legs.parts[k]).map(k => {
      const a = d.legs.parts[k];
      return k + '  hip ' + a.angles.hip.toFixed(0) +
             '  tibia ' + a.angles.tibia.toFixed(0) +
             '  meta ' + a.angles.meta.toFixed(0) +
             '  | fold off the straight line: knee ' + a.bendPx.knee.toFixed(2) +
             '  ankle ' + a.bendPx.ankle.toFixed(2) + ' px' +
             (a.clamped ? '  UNREACHABLE' : '');
    }).join('\n  '));
    return d.rows;
  };

  const rigCells = at.map(t => {
    const label = (useOld ? 'old-cycle ' : 'rig2 walk ') + 't=' + t.toFixed(2);
    return { label: label, rows: dump(label, useOld ? rig2.walkPoseFromOldCycle(t) : rig2.walkPose(t)) };
  });
  const oldCells = at.map(t => {
    const n = 'side_walk_' + (Math.round(t * 6) % 6);
    return { label: 'old ' + n, rows: F[n] };
  });

  /* The same chain on the case that gives it room: a foreleg tucked up
   * under the elbow, which is what groom/wash/knead/hold all want. */
  if (!useOld) {
    console.log('\n---- same chain, TUCKED foreleg (the case with travel) ----');
    const tuckCells = at.map(t => {
      const label = 'tuck t=' + t.toFixed(2);
      return { label: label, rows: dump(label, rig2.tuckPose(t)) };
    });
    for (let y = 0; y < H; y++) {
      console.log(tuckCells.map(c => (c.rows[y] || '').padEnd(W, '.')).join(' '));
    }
  }

  /* The whole point of the mode: both rigs in one glance. rig2 on the top
   * row, the old frames it is standing next to on the one below. */
  console.log('\n---- side by side: rig2 (top) vs the old rig\'s walk (bottom) ----');
  const strip = cells => {
    for (let y = 0; y < H; y++) {
      console.log(cells.map(c => (c.rows[y] || '').padEnd(W, '.')).join(' '));
    }
  };
  console.log(rigCells.map(c => c.label.padEnd(W + 1)).join(' ').slice(0, (W + 1) * at.length - 1));
  strip(rigCells);
  console.log('');
  console.log(oldCells.map(c => c.label.padEnd(W + 1)).join(' ').slice(0, (W + 1) * at.length - 1));
  strip(oldCells);
} else {
  /* --preview takes either a cat frame name or `yarn_0` / `bowl_food`, so the
   * room's objects can be eyeballed the same way the cat can. */
  const want = process.argv.slice(2).filter(a => a.charAt(0) !== '-');
  const names = want.length ? want : Object.keys(F);
  names.forEach(k => {
    if (F[k]) {
      console.log('\n== ' + k + ' ==');
      console.log(toAscii(F[k]));
      return;
    }
    for (const set of Object.keys(S)) {
      if (S[set].frames[k]) {
        console.log('\n== ' + set + '/' + k + ' ==');
        console.log(toAscii(S[set].frames[k]));
        return;
      }
    }
    console.log('\n== ' + k + ' == (no such frame)');
  });
}