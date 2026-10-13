/* ============================================================
 * NES-cat — tools/rig2.js   (slices 1-2: an articulated leg, at any scale)
 *
 * BESIDE the existing rig, not inside it. Nothing here is called by
 * build-sprites.js's frame build, so `npm run sprites:build` emits
 * byte-identical output. That is the whole safety net: the old rig
 * stays the control group while the new one proves itself.
 *
 * SLICE 1 established that the machinery works and cannot be seen.
 * A leg was hip -> knee -> ankle -> paw solved by FK, poses were a
 * flat vector with lerpPose, and walkPose(t) ran on a continuous t.
 * The measured result was a knee 0.02px off the straight line — a
 * 0.4-degree leg. Not a bug. A 32x32 cat has about five rows of leg
 * and nowhere for a knee to go.
 *
 * SLICE 2 (this file's size work) does the two things that move it:
 *   - the resolution is a parameter, not a constant
 *   - there is a 64x64 cat whose legs are 36.5% of her standing
 *     height instead of 12.6%
 *
 * WHAT IS HERE
 *   1. makeHost(w,h)  raster helpers at an arbitrary grid
 *   2. maskChain      a tapered capsule along a polyline, OR-ed like maskOr
 *   3. a leg as hip -> knee -> ankle -> paw, solved by FK
 *   4. poses as a FLAT vector of numbers, plus lerpPose
 *   5. walkPose(t)    a continuous gait, no authored frames
 *
 * NOTHING HERE IMPORTS build-sprites.js. The raster helpers below are
 * copies of that file's, carried over expression for expression so the
 * pixel convention is identical — see the note on makeHost.
 * ============================================================ */
'use strict';

const DEG = Math.PI / 180;

/* ---------- resolution-parameterised raster helpers --------------------
 *
 * These are build-sprites.js's helpers with the module-level W and H
 * swapped for a pair taken at construction. Every expression is the
 * same, in particular the pixel test:
 *
 *     const dx = (x + 0.5 - cx) / rx;
 *
 * Pixel centres are (x + 0.5, y + 0.5). That convention is what keeps
 * a shape from landing half a pixel off every other shape in the
 * sprite; changing it at a different resolution makes the outline
 * disagree with itself, so it is copied rather than re-derived.
 *
 * They are copies because build-sprites.js is the control group and
 * the brief's only permitted change to it is a preview flag. */
function makeHost(w, h) {
  const grid = () => Array.from({ length: h }, () => new Array(w).fill('.'));
  const emptyMask = () => Array.from({ length: h }, () => new Array(w).fill(false));
  const maskOr = (...ms) => {
    const m = emptyMask();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      for (const a of ms) if (a[y][x]) { m[y][x] = true; break; }
    }
    return m;
  };
  const maskEllipse = (cx, cy, rx, ry) => {
    const m = emptyMask();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) m[y][x] = true;
    }
    return m;
  };
  const maskTri = (ax, ay, bx, by, cx2, cy2) => {
    const m = emptyMask();
    const sign = (px, py, x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      const d1 = sign(px, py, ax, ay, bx, by);
      const d2 = sign(px, py, bx, by, cx2, cy2);
      const d3 = sign(px, py, cx2, cy2, ax, ay);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      m[y][x] = !(neg && pos);
    }
    return m;
  };
  const paint = (G, m, fill, outline) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m[y][x]) continue;
      const edge =
        !(y > 0 && m[y - 1][x]) || !(y < h - 1 && m[y + 1][x]) ||
        !(x > 0 && m[y][x - 1]) || !(x < w - 1 && m[y][x + 1]);
      G[y][x] = edge ? outline : fill;
    }
  };
  const px = (G, x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < w && y >= 0 && y < h) G[y][x] = c;
  };
  const shadeBelow = (G, m, cx, from, c) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m[y][x]) continue;
      if (G[y][x] !== 'W') continue;
      if (y > from) G[y][x] = c;
    }
  };
  const stampCurve = (G, p0, p1, p2, radius, fill, outline) => {
    const m = emptyMask();
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
      const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
      const r = radius * (1 - 0.35 * t);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const dx = xx + 0.5 - x, dy = yy + 0.5 - y;
        if (dx * dx + dy * dy <= r * r) m[yy][xx] = true;
      }
    }
    paint(G, m, fill, outline);
    return m;
  };
  return { W: w, H: h, grid, emptyMask, maskOr, maskEllipse, maskTri, paint, px, shadeBelow, stampCurve };
}

/* the default grid, so maskChain works with no host at all */
const HOST_32 = makeHost(32, 32);

/* ---------- 1. maskChain ----------------------------------------------
 *
 * A polyline with a radius AT each point, linearly interpolated
 * between consecutive points, so a limb tapers hip-to-paw.
 *
 * The radius is sampled at the pixel's own projection onto the
 * segment (s clamped to [0,1]), so the ends close into circles of
 * their own radius and the middle is a linear radius field. That is
 * the shape you get by OR-ing a tapered capsule per segment. */
function maskChain(points, radii, host) {
  const host0 = host || HOST_32;
  const w = host0.W, h = host0.H;
  const m = host0.emptyMask();
  if (!points || points.length < 2) return m;

  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i][0], ay = points[i][1], ra = radii[i];
    const bx = points[i + 1][0], by = points[i + 1][1], rb = radii[i + 1];
    const ex = bx - ax, ey = by - ay;
    const elen2 = ex * ex + ey * ey;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5;
        const s = elen2 === 0
          ? 0
          : Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / elen2));
        const r = ra + (rb - ra) * s;
        if (r <= 0) continue;
        const dx = px - (ax + ex * s), dy = py - (ay + ey * s);
        const dxn = dx / r, dyn = dy / r;
        if (dxn * dxn + dyn * dyn <= 1) m[y][x] = true;
      }
    }
  }
  return m;
}

/* ---------- 2. geometry, per resolution --------------------------------
 *
 * A leg's fold is bounded by its own segment length: a joint can only
 * leave the straight hip-to-paw line by as much as the bone that ends
 * at it. Slice 1 measured 0.97px at 32x32, where the longest segment
 * was 1.35px. So the fold is not a solver problem, it is a budget
 * problem, and the budget is in here.
 *
 * GEOM_32 is slice 1's rig, character for character, so nothing about
 * the existing behaviour moves. GEOM_64 is the new cat.
 *
 * LEG LENGTH AS A SHARE OF STANDING HEIGHT, measured not estimated:
 *
 *   32:  hip y=23.4, paw y=26.3  -> span  2.9px.  Standing height is
 *        ground (29) to ear tip (row 4) = 25px.      2.9 / 25 = 11.6%
 *   64:  hip y=36.0, paw y=55.0  -> span 19.0px.  Standing height is
 *        ground (58) to ear tip (row 6) = 52px.     19.0 / 52 = 36.5%
 *
 * 36.5% clears the 35% the brief asks for. A real cat's leg is about
 * 40% of its standing height, so this is a cat and not a loaf.
 *
 * THE 64 CHAIN IS DIGITIGRADE, and the shape is deliberate:
 *
 *      hip (36)
 *       |
 *      femur 7.0      down and FORWARD, to the stifle/elbow
 *       |
 *      knee
 *       \
 *        tibia 9.2    down and BACKWARD, to the hock. This is the
 *       /             segment that makes a cat look bent the wrong way,
 *      ankle          and it is the longest bone in the leg.
 *       |
 *      meta 6.4       down and FORWARD again, to the paw
 *      paw (55)
 *
 * So the joint a viewer reads as "the knee" — the one halfway down a
 * leg that turns the wrong way — is at the tibia/metatarsus join. That
 * is the ankle, which is exactly what it is on a cat, and which is why
 * the leg reads as digitigrade rather than as a bent stick. Nothing
 * here bends forward: `bend` is -1 for every leg, so the tibia can
 * only go backward and the metatarsus only forward off it. */

const GEOM_32 = {
  size: 32,
  FLOOR: 29.0,
  LEG_TOP: 24.0,
  HIP_Y: 23.4,
  PAW_Y: 26.3,
  body: { x: 15.0, y: 21.0, rx: 8.5, ry: 4.8 },
  head: { x: 22.5, y: 13.5, rx: 6.0, ry: 5.5 },
  headEar: { top: 9.4, wide: 6.2, inner: 4.0, pink: [3.9, 5.6] },
  tail: { base: 2.5, c1: 3.2, c2: 5.0, rise: 8.0, r: 2.4, from: 0.5, c1y: 1.5, c2y: 8.0 },
  legX: { nearFront: 22.0, farBack: 7.0, nearBack: 12.0, farFront: 17.0 },
  padRow: 28,
  leg: {
    front: {
      femur: 1.35, tibia: 1.25, meta: 1.00,
      r: [1.70, 1.55, 1.45, 1.60],
      bend: -1, maxBend: 72, hipLimit: 34, tuck: -0.34
    },
    hind: {
      femur: 1.40, tibia: 1.30, meta: 0.95,
      r: [1.80, 1.65, 1.50, 1.60],
      bend: -1, maxBend: 68, hipLimit: 30, tuck: 0.26
    }
  },
  gait: {
    stride: 2.0, lift: 1.5, duty: 0.62,
    off: { nearFront: 0.00, farBack: 0.00, nearBack: 0.50, farFront: 0.50 },
    hipSwing: 0.55, bodyLift: 0.45, headLead: 0.8, tailSway: 1.05, tailAmp: 0.45,
    hipA: { front: 16, hind: 26 }
  },
  bend: { hipX: 21.0, headDY: 2.6, frontHip: 7, frontTibia: -9, frontMeta: 4, hindHip: 8, hindTibia: -9, hindMeta: 4 },
  groom: { liftHigh: 180, liftLow: 168, bodyY1: 0.3, bodyY2: 0.4,
           headDY1: 1.0, headDY2: 1.3, headDX1: -1.5, headDX2: -2.5, tailSway: 2.0 }
};

const GEOM_64 = {
  size: 64,
  FLOOR: 58.0,
  LEG_TOP: 36.0,
  HIP_Y: 36.0,
  PAW_Y: 55.0,
  body: { x: 29.0, y: 34.0, rx: 15.0, ry: 8.5 },
  head: { x: 46.0, y: 18.0, rx: 9.5, ry: 9.0 },
  headEar: { top: 12.0, wide: 11.0, inner: 8.0, pink: [6.6, 10.0] },
  tail: { base: 5.0, c1: 6.4, c2: 12.0, r: 4.0, from: 5.0, c1y: 7.0, c2y: 12.0 },
  legX: { nearFront: 44.0, farBack: 16.0, nearBack: 25.0, farFront: 34.0 },
  padRow: 57,
  leg: {
    front: {
      femur: 7.0, tibia: 9.2, meta: 6.4,
      r: [3.10, 2.10, 1.80, 2.90],
      bend: -1, maxBend: 62, hipLimit: 40, tuck: -0.60
    },
    hind: {
      femur: 7.2, tibia: 9.2, meta: 6.2,
      r: [3.30, 2.30, 2.00, 2.90],
      bend: -1, maxBend: 58, hipLimit: 42, tuck: 0.45
    }
  },
  gait: {
    stride: 4.0, lift: 6.0, duty: 0.62,
    off: { nearFront: 0.00, farBack: 0.00, nearBack: 0.50, farFront: 0.50 },
    hipSwing: 0.55, bodyLift: 1.5, headLead: 0.8, tailSway: 2.4, tailAmp: 1.0,
    hipA: { front: 16, hind: 26 }
  },
  /* the pose the acceptance criterion is measured on: a front leg with
   * the paw up and drawn back, so the stifle, hock and metatarsus all
   * leave the straight line at once. */
  bend: { hipX: 44.0, headDY: 3.0, frontHip: 30, frontTibia: -40, frontMeta: 20, hindHip: 32, hindTibia: -38, hindMeta: 20 },
  /* grooming: how far the foreleg is lifted, in degrees. Measured, not
   * guessed — see GROOM_TARGET. 176 puts the paw on the cheek beside
   * the eye; 158 puts it lower, on the muzzle. */
  groom: { liftHigh: 180, liftLow: 168, bodyY1: 0.6, bodyY2: 0.8,
           headDY1: 4.0, headDY2: 2.5, headDX1: -3.0, headDX2: -5.0, tailSway: 4.0 }
};

function geomFor(size) {
  if (!size) return GEOM_32;
  return Number(size) >= 64 ? GEOM_64 : GEOM_32;
}

/* the 32 leg spec, kept under its old name for slice 1's callers */
const LEG_SPEC = GEOM_32.leg;
const LEG_SPEC_64 = GEOM_64.leg;

/* Angle convention: 0 is straight DOWN (+y). Positive leans toward
 * +x, which is forward for a cat authored facing right. */
function dir(a) { return [Math.sin(a), Math.cos(a)]; }

/* solveLeg: hip -> knee is forward kinematics off `hipA`; knee ->
 * ankle -> paw is a two-link solve onto the paw target, which is what
 * makes the fold a fold: when the target comes up off the floor, the
 * two links have to reach it by bending rather than by stretching.
 *
 * Returns the point list maskChain wants, the radii, the resolved
 * joint angles, and `bendPx` — how far each joint actually leaves the
 * straight hip-to-paw line. That last number is the whole question
 * this rig asks: a fold that moves the joint 0.2px off the chord is a
 * shorter straight stick, and one that moves it 1.5px is a bend you
 * can see. */
function solveLeg(spec, hipX, hipY, hipA, footX, footY) {
  const ha = Math.max(-spec.hipLimit, Math.min(spec.hipLimit, hipA)) * DEG;
  const k = dir(ha);
  const knee = [hipX + k[0] * spec.femur, hipY + k[1] * spec.femur];

  let dx = footX - knee[0], dy = footY - knee[1];
  let d = Math.hypot(dx, dy);
  const reach = (spec.tibia + spec.meta) * 0.999;
  let clamped = false;
  if (d > reach) { dx *= reach / d; dy *= reach / d; d = reach; clamped = true; }
  if (d < 1e-6) { dx = 0; dy = 1e-6; d = 1e-6; }

  /* chord angle from the knee to the (possibly clamped) target, then
   * the internal angle of the two-link triangle, signed by `bend`:
   * bend -1 puts the low joint behind the chord, which is the
   * hock/carpus direction in profile. */
  const chord = Math.atan2(dx, dy);
  const cosA = (spec.tibia * spec.tibia + d * d - spec.meta * spec.meta) /
               (2 * spec.tibia * d);
  const fold = Math.min(spec.maxBend, Math.acos(Math.max(-1, Math.min(1, cosA))) / DEG);
  const tibiaA = chord + spec.bend * fold * DEG;

  const t = dir(tibiaA);
  const ankle = [knee[0] + t[0] * spec.tibia, knee[1] + t[1] * spec.tibia];
  const paw = [ankle[0] + (footX - ankle[0]), ankle[1] + (footY - ankle[1])];

  /* signed distance off the straight hip-to-paw chord, for the knee
   * and for the ankle. This is the pixel-level "is there a bend". */
  const off = p => {
    const cx = footX - hipX, cy = footY - hipY;
    const cl = Math.hypot(cx, cy) || 1;
    return Math.abs((p[0] - hipX) * cy - (p[1] - hipY) * cx) / cl;
  };

  return {
    points: [[hipX, hipY], knee, ankle, paw],
    radii: spec.r.slice(),
    clamped: clamped,
    bendPx: { knee: off(knee), ankle: off(ankle) },
    angles: {
      hip: ha / DEG,
      tibia: tibiaA / DEG,
      meta: Math.atan2(paw[0] - ankle[0], paw[1] - ankle[1]) / DEG,
      fold: fold
    }
  };
}

/* solveLegAngles: the same chain, driven by three ABSOLUTE joint angles
 * instead of a paw target. Pure forward kinematics, knee to paw
 * included — nothing is solved backwards and nothing clamps.
 *
 * This exists because the target-driven solve above concentrates the
 * ENTIRE fold in one joint. Asked to fold a 21px chain onto a 13px
 * span it puts 90 degrees into the tibia and lays it out horizontal,
 * which measures as a big bend and looks like a chicken leg. Angles
 * are the honest way to author a bend: a pose can say "this joint
 * turns 14 degrees" and mean it.
 *
 * Returns the same shape as solveLeg so everything downstream is
 * unchanged. */
function solveLegAngles(spec, hipX, hipY, hipA, tibiaA, metaA) {
  const j = a => {
    const c = Math.max(-89, Math.min(89, a));
    return dir(c * DEG);
  };
  const f = j(hipA), t = j(tibiaA), m = j(metaA);
  const knee = [hipX + f[0] * spec.femur, hipY + f[1] * spec.femur];
  const ankle = [knee[0] + t[0] * spec.tibia, knee[1] + t[1] * spec.tibia];
  const paw = [ankle[0] + m[0] * spec.meta, ankle[1] + m[1] * spec.meta];
  const off = p => {
    const cx = paw[0] - hipX, cy = paw[1] - hipY;
    const cl = Math.hypot(cx, cy) || 1;
    return Math.abs((p[0] - hipX) * cy - (p[1] - hipY) * cx) / cl;
  };
  return {
    points: [[hipX, hipY], knee, ankle, paw],
    radii: spec.r.slice(),
    clamped: false,
    bendPx: { knee: off(knee), ankle: off(ankle) },
    angles: { hip: hipA, tibia: tibiaA, meta: metaA, fold: Math.abs(tibiaA - hipA) }
  };
}

/* ---------- 3. poses as a flat vector ---------------------------------
 *
 * A flat object of numbers and NOTHING else. The old rig merges
 * nested `legs: { nearFront: {x, lift} }` bags with Object.assign,
 * which is a snapshot and not a point in a space — you cannot blend
 * one of those with anything. Flat keys blend field for field.
 *
 * Per leg: <key>_hipX, <key>_hipA, <key>_footX, <key>_footY, <key>_hide.
 * Plus bodyY, headDY, tailSway. */
function lerpPose(a, b, t) {
  const out = {};
  const keys = Object.keys(Object.assign({}, a, b));
  for (const k of keys) {
    const av = a[k], bv = b[k];
    out[k] = (typeof av === 'number' && typeof bv === 'number')
      ? av + (bv - av) * t
      : (t < 0.5 ? av : bv);
  }
  return out;
}

const LEG_KEYS = ['nearFront', 'farBack', 'nearBack', 'farFront'];

/* The four legs of the side rig, and whether each is front or hind.
 * The neutral hip x comes from the geometry, so a 64x64 cat's legs
 * stand where a 64x64 cat's legs stand. */
function legAt(g, key) {
  return { baseX: g.legX[key], kind: (key === 'nearFront' || key === 'farFront') ? 'front' : 'hind' };
}

/* ---------- 4. a walk, computed ---------------------------------------
 *
 * ZERO authored poses. Everything below is a function of t.
 *
 *   gait.stride   fore/aft travel of a paw, px either side of neutral
 *   gait.lift     peak paw height off the floor, px
 *   gait.duty     fraction of the cycle a paw is on the ground
 *   gait.off      per-leg phase offset, in cycles
 *
 * The old cycle quantised a paw into three x-positions and two
 * heights across six frames. This instead uses a stance/swing split:
 * a paw on the ground travels BACKWARD-to-FORWARD at a constant rate
 * (so it does not slip) and only leaves the floor for the back third
 * of the cycle, on a raised-cosine arc. That is a gait model, not a
 * lookup table.
 *
 * The offsets are the old cycle's answer read off WALK_CYCLE: the two
 * diagonal pairs (nearFront+farBack, nearBack+farFront) are half a
 * cycle apart. */
const GAIT = GEOM_32.gait;

function frac(u) { return u - Math.floor(u); }

/* One paw's path through the cycle. u is 0..1; dx is fore/aft from
 * neutral, up is px off the floor. At u=0 the paw is furthest BACK. */
function footPath(u, gait) {
  const G = gait || GAIT;
  u = frac(u);
  if (u < G.duty) {
    return { dx: -G.stride + (2 * G.stride) * (u / G.duty), up: 0 };
  }
  const k = (u - G.duty) / (1 - G.duty);
  return {
    dx: G.stride - 2 * G.stride * k,
    up: G.lift * Math.pow(Math.sin(Math.PI * k), 0.75)
  };
}

function walkPose(t, gait, size) {
  const g = geomFor(size);
  const G = gait || g.gait;
  const body = -G.bodyLift * (0.5 - 0.5 * Math.cos(2 * Math.PI * 2 * (t - 0.42)));
  const p = {
    bodyY: body,
    headDY: G.headLead * body + 0.2 * (g.size / 32),
    tailSway: G.tailSway - G.tailAmp * Math.cos(4 * Math.PI * t)
  };
  LEG_KEYS.forEach(k => {
    const u = t + G.off[k];
    const f = footPath(u, G);
    const at = legAt(g, k);
    p[k + '_hipX'] = at.baseX + f.dx * G.hipSwing;
    /* the femur leans the way the foot is going — this is what puts
     * the digitigrade Z on the hind leg */
    p[k + '_hipA'] = (f.dx / G.stride) * G.hipA[at.kind];
    /* A paw does not rise straight up. The carpus folds, so a lifting
     * paw comes back toward the elbow as it comes up, and `tuck` is
     * that. Without it the paw lifts under a straight leg and the fold
     * has nothing to do but shorten. */
    p[k + '_footX'] = at.baseX + f.dx + g.leg[at.kind].tuck * f.up;
    p[k + '_footY'] = g.PAW_Y - f.up;
    p[k + '_hide'] = 0;
  });
  return p;
}

/* bentPose: one leg folded, the rest standing. This is the pose the
 * acceptance criterion is measured on, and it is authored in JOINT
 * ANGLES rather than a paw target.
 *
 * The angles are the whole point. A target-driven pose that wants this
 * much bend asks a 20px chain to reach a 13px span, and the solve puts
 * 90 degrees into the tibia and lays it out horizontal: a number that
 * measures well and looks like a chicken leg. Authoring the angles says
 * what the bend IS instead.
 *
 * The shape is digitigrade and read left to right: the upper bone goes
 * down and FORWARD to the stifle or elbow, the long middle bone goes
 * down and BACKWARD to the hock, and the metatarsus comes down and
 * forward again to the paw. Two direction changes, both backward-facing
 * folds, which is a cat's leg. Nothing here bends the wrong way: the
 * middle bone is the only one with a large angle and it is negative. */
function bentPose(t, size) {
  const g = geomFor(size);
  const B = g.bend;
  const e = t * t * (3 - 2 * t);
  const p = { bodyY: 0, headDY: B.headDY * e, tailSway: 1.2 * (g.size / 32) };
  LEG_KEYS.forEach(k => {
    const at = legAt(g, k);
    p[k + '_hipX'] = at.baseX;
    p[k + '_hipA'] = (at.kind === 'front' ? B.frontHip : B.hindHip) * e;
    p[k + '_tibiaA'] = (at.kind === 'front' ? B.frontTibia : B.hindTibia) * e;
    p[k + '_metaA'] = (at.kind === 'front' ? B.frontMeta : B.hindMeta) * e;
    p[k + '_hide'] = 0;
  });
  p.nearFront_hipX = B.hipX;
  return p;
}

/* GROOM_TARGET — why the paw gets to the face, measured.
 *
 * Slice 2's closing note said "a 22.6px chain cannot reach the cheek at
 * y~12, it clamps and lies." y~12 is the CROWN. Measured from the hip
 * at (44,36) on a 22.6px chain:
 *
 *     cheek  (44,18)  18.0px away   slack 4.6px   REACHABLE
 *     ear    (41,13)  23.2px away   slack -0.6px  impossible
 *     crown  (44,12)  24.0px away   slack -1.4px  impossible
 *
 * So the target was wrong, not the leg, and no geometry had to change.
 * A grooming cat brings a paw to the SIDE of her face — the cheek, the
 * ear base, the corner of the eye — not to the top of her head.
 *
 * The lift is what closes the gap. A standing nearFront has its paw
 * 19px BELOW its hip; `legUp` rotates that about the hip, so the paw
 * arrives 19px ABOVE it, at row ~16. Nothing is stretched and nothing
 * clamps, because the chain is exactly as long as it always was.
 *
 * The head comes DOWN to meet the paw rather than the paw being dragged
 * up past it, which is both what a cat does and the reason a 3px head
 * dip is enough.
 *
 * `variant` selects the beat:
 *   0  paw to the cheek beside the eye, head level   — the lick
 *   1  paw lower on the muzzle, head dipped further   — the wash
 * Both keep three paws on the ground, because a cat that has both front
 * paws up is not washing, it is falling over. */
function groomPose(t, variant, size) {
  const g = geomFor(size);
  const v = variant ? 1 : 0;
  const e = t * t * (3 - 2 * t);
  const G = g.groom;
  const p = {
    bodyY: (v ? G.bodyY2 : G.bodyY1) * e,
    headDY: (v ? G.headDY2 : G.headDY1) * e,
    headDX: (v ? G.headDX2 : G.headDX1) * e,
    tailSway: G.tailSway
  };
  LEG_KEYS.forEach(k => {
    const at = legAt(g, k);
    const grooms = (k === 'nearFront');
    p[k + '_hipX'] = at.baseX;
    p[k + '_legUp'] = 0;
    p[k + '_hide'] = 0;
    if (grooms) {
      /* The grooming leg's angles are authored BACKWARDS on purpose.
       * `legUp` rotates the finished chain, so the sign that reads as
       * "elbow forward" after the lift is a negative femur BEFORE it.
       * Measured post-lift this puts the elbow 3.6px in front of the
       * shoulder, the wrist 3.3px behind it and the paw forward again
       * at the cheek — a Z with the point down at the front, which is
       * the shape of a foreleg held up to a face. */
      p[k + '_hipA'] = -35;
      p[k + '_tibiaA'] = 45;
      p[k + '_metaA'] = -20;
    } else {
      /* The other three keep PAW TARGETS, not angles, so that when the
       * body dips they stay planted. An angle-driven leg is rigidly
       * welded to the body and sinks with it; a cat crouching to wash
       * keeps all three other feet on the floor. */
      p[k + '_hipA'] = at.kind === 'front' ? 6 : 10;
      p[k + '_footX'] = at.baseX;
      p[k + '_footY'] = g.PAW_Y;
    }
  });
  /* the grooming leg: lifted to the face, and folded rather than
   * straight, so the bend is the one the walk already has */
  p.nearFront_hipX = g.legX.nearFront;
  p.nearFront_legUp = (v ? G.liftLow : G.liftHigh) * e;
  return p;
}
function tuckPose(t, size) {
  const g = geomFor(size);
  const s = g.size / 32;
  const p = {
    bodyY: 0, headDY: 2.6 * s, tailSway: 1.2 * s,
    farFront_hide: 1, nearBack_hide: 1, farBack_hide: 1
  };
  LEG_KEYS.forEach(k => {
    const at = legAt(g, k);
    p[k + '_hipX'] = at.baseX;
    p[k + '_hipA'] = 16 * s * 0.25;
    p[k + '_footX'] = at.baseX;
    p[k + '_footY'] = g.PAW_Y;
  });
  const e = t * t * (3 - 2 * t);
  p.nearFront_hipX = g.legX.nearFront - 1.0 * s;
  p.nearFront_hipA = 6 * s * 0.25;
  p.nearFront_footX = g.legX.nearFront - 1.8 * s;
  p.nearFront_footY = g.PAW_Y - 2.6 * s * e;
  return p;
}

/* ---------- the old rig's six authored rows, as points in this space ---
 *
 * Kept so the interpolated walk can be compared against the walk that
 * exists, and so `lerpPose` has something real to blend. These are
 * slice 1's numbers verbatim at 32x32. */
const OLD_STRIDE = 2.0;
const OLD_LIFT = 2.0;

const OLD_CYCLE = [
  { f: [1, 1, -1, -1], by: 0, hd: 0.2, ts: 0.6 },
  { f: [1, 1, 0, 0], by: -1, hd: -0.6, ts: 1.5 },
  { f: [0, 0, 1, 1], by: 0, hd: 0.2, ts: 1.0 },
  { f: [-1, -1, 1, 1], by: 0, hd: 0.2, ts: 0.6 },
  { f: [-1, -1, 0, 0], by: -1, hd: -0.6, ts: 1.5 },
  { f: [0, 0, -1, -1], by: 0, hd: 0.2, ts: 1.0 }
];

function oldPoseAsVector(i, size) {
  const g = geomFor(size);
  const s = g.size / 32;
  const c = OLD_CYCLE[((i % 6) + 6) % 6];
  const lf = f => (f > 0 ? OLD_LIFT * s : 0);
  const p = { bodyY: c.by * s, headDY: c.hd * s, tailSway: c.ts * s };
  LEG_KEYS.forEach((k, n) => {
    const at = legAt(g, k);
    /* the old cycle sign: the rear pair is negated so the two diagonal
     * pairs are anti-phase in the same world frame */
    const sgn = (k === 'nearBack' || k === 'farFront') ? -1 : 1;
    p[k + '_hipX'] = at.baseX + c.f[n] * OLD_STRIDE * s * 0.34;
    p[k + '_footX'] = at.baseX + c.f[n] * OLD_STRIDE * s;
    p[k + '_footY'] = g.PAW_Y - lf(c.f[n]);
    p[k + '_hipA'] = (at.kind === 'hind' ? 16 : 0);
  });
  return p;
}

function walkPoseFromOldCycle(t, size) {
  const u = frac(t) * 6;
  const i = Math.floor(u);
  return lerpPose(oldPoseAsVector(i, size), oldPoseAsVector(i + 1, size), u - i);
}

/* ---------- drawing ---------------------------------------------------
 *
 * The torso, head, face and tail are drawn only so the legs can be
 * judged in context; they are NOT a replacement for buildSideParts.
 *
 * Legs go down BEFORE the torso, not after. At 64x64 the hip joint
 * sits 6.5px inside a body whose belly is 8.5px deep, so a leg painted
 * over the flank stamps a leg-coloured blob on her side. Painting the
 * legs first lets the torso occlude the hip, which is what a leg
 * actually does, and it costs the ability to draw a raised paw over
 * the head — a real cost, recorded, and the thing a later slice has
 * to solve properly. */

function legMask(p, key, g) {
  g = g || geomFor(p.size);
  const at = legAt(g, key);
  let L;
  /* a pose may carry explicit joint angles, in which case the chain is
   * pure FK; otherwise the paw target drives the two-link solve */
  if (typeof p[key + '_tibiaA'] === 'number') {
    L = solveLegAngles(g.leg[at.kind], p[key + '_hipX'], g.HIP_Y + p.bodyY,
                       p[key + '_hipA'] || 0, p[key + '_tibiaA'], p[key + '_metaA'] || 0);
  } else {
    L = solveLeg(g.leg[at.kind], p[key + '_hipX'], g.HIP_Y + p.bodyY,
                 p[key + '_hipA'], p[key + '_footX'], p[key + '_footY']);
  }
  /* `legUp` LIFTS the whole leg about the hip. A grooming cat raises her
   * foreleg roughly vertical alongside her chest, which is not a
   * hip-joint rotation the 0=down convention can express (it would need
   * angles past 90 degrees) but it is exactly a rotation of the solved
   * chain about its own hip.
   *
   * This is why a 22.6px chain reaches the cheek. Rotating a leg whose
   * paw is 19px below its hip puts that paw 19px ABOVE the hip, so the
   * paw arrives at row ~16 without the chain being lengthened by one
   * pixel and therefore without ever clamping. See GROOM_TARGET. */
  const up = p[key + '_legUp'];
  if (up) {
    const a = up * DEG, c = Math.cos(a), s = Math.sin(a);
    const h = L.points[0];
    L = Object.assign({}, L, {
      points: L.points.map((q, i) => i === 0 ? q : [
        h[0] + (q[0] - h[0]) * c - (q[1] - h[1]) * s,
        h[1] + (q[0] - h[0]) * s + (q[1] - h[1]) * c
      ])
    });
  }
  return L;
}

function rig2Legs(p, host, g) {
  const m = host.emptyMask();
  const parts = {};
  LEG_KEYS.forEach(k => {
    if (p[k + '_hide']) { parts[k] = null; return; }
    parts[k] = legMask(p, k, g);
    const lm = maskChain(parts[k].points, parts[k].radii, host);
    for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++) if (lm[y][x]) m[y][x] = true;
  });
  return { mask: m, parts: parts };
}

function drawFrame(p, host, size) {
  const g = geomFor(size);
  host = host || makeHost(g.size, g.size);
  const G = host.grid();
  const body = g.body, head = g.head;
  const bx = body.x, by = body.y + p.bodyY;
  const hx = head.x + (p.headDX || 0), hy = head.y + p.headDY + p.bodyY;
  const E = g.headEar, T = g.tail;

  host.stampCurve(G, [bx - body.rx + T.base, by - T.from],
    [bx - body.rx + T.base - T.c1 - p.tailSway, by - T.c1y],
    [bx - body.rx + T.base - T.c2 - p.tailSway, by - T.c2y], T.r, 'W', 'K');

  const legs = rig2Legs(p, host, g);
  const ink = (k, fill) => {
    if (!legs.parts[k]) return;
    host.paint(G, maskChain(legs.parts[k].points, legs.parts[k].radii, host), fill, 'K');
  };

  /* both pairs go down before the torso; the far pair in deep shade so
   * it reads as the further pair */
  ink('farBack', 'G');
  ink('farFront', 'G');
  ink('nearBack', 'W');
  ink('nearFront', 'W');

  const bodyMask = host.maskEllipse(bx, by, body.rx, body.ry);
  for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++) if (y + 0.5 > g.FLOOR) bodyMask[y][x] = false;
  host.paint(G, bodyMask, 'W', 'K');
  host.shadeBelow(G, bodyMask, bx, by + body.ry * 0.27, 'H');

  const headMask = host.maskEllipse(hx, hy, head.rx, head.ry);
  const cheek = host.maskEllipse(hx + head.rx * 0.62, hy + head.ry * 0.29, head.rx * 0.44, head.ry * 0.44);
  const headAll = host.maskOr(headMask, cheek);
  host.paint(G, headAll, 'W', 'K');
  host.paint(G, host.maskTri(hx - head.rx * 0.77, hy - head.ry * 0.62,
                             hx - E.wide, hy - E.top, hx - head.rx * 0.10, hy - head.ry * 0.91), 'W', 'K');
  host.paint(G, host.maskTri(hx + head.rx * 0.37, hy - head.ry * 0.73,
                             hx + E.wide * 0.90, hy - E.top * 0.98, hx + head.rx * 0.90, hy - head.ry * 0.65), 'W', 'K');
  host.px(G, hx - E.pink[0], hy - E.pink[1], 'P');
  host.px(G, hx + E.pink[1], hy - E.pink[1] - 0.2, 'P');

  /* one eye and a face, clipped to the skull */
  const ex = Math.round(hx + head.rx * 0.10), ey = Math.round(hy - head.ry * 0.18);
  const pxIn = (x, y, c) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= host.W || yi < 0 || yi >= host.H) return;
    if (!headAll[yi][xi]) return;
    G[yi][xi] = c;
  };
  const eo = Math.max(1, Math.round(g.size / 32));
  for (let y = ey - eo; y <= ey + eo; y++) { pxIn(ex - eo, y, 'E'); pxIn(ex, y, 'E'); }
  pxIn(ex - eo, ey - eo, 'W');
  const nx = Math.round(hx + head.rx * 0.82), ny = Math.round(hy + head.ry * 0.18);
  pxIn(nx, ny, 'N');
  pxIn(nx - eo, ny + eo, 'M');
  pxIn(nx, ny + eo * 2, 'M');
  host.shadeBelow(G, headAll, hx, hy + head.ry * 0.22, 'H');

  /* A RAISED paw draws over the face, and it draws over it LAST.
   * A cat washing her cheek puts the paw in front of it, and the paw is
   * the subject of the pose; the muzzle and the eye painting over the
   * paw leaves it looking like a cat with her head down for no reason.
   * This has to come after the face, which is the whole reason it did
   * not work when it sat with the ears.
   *
   * Only the part of a lifted leg that is actually up here is redrawn.
   * The clip is what keeps slice 1's regression from coming back: that
   * regression was the HIP ball stamping a leg-coloured blob on her
   * flank, and the hip is 6.5px inside an 8.5px-deep belly, far below
   * the cut. A raised leg is CLIPPED, not merely reordered. */
  LEG_KEYS.forEach(k => {
    if (!legs.parts[k]) return;
    if (!(p[k + '_legUp'] > 0)) return;
    const lm = maskChain(legs.parts[k].points, legs.parts[k].radii, host);
    const cut = Math.min(host.H - 1, Math.round(hy + head.ry));
    for (let y = cut + 1; y < host.H; y++) for (let x = 0; x < host.W; x++) lm[y][x] = false;
    host.paint(G, lm, (k === 'farFront' || k === 'farBack') ? 'G' : 'W', 'K');
  });

  /* paw pad on a near paw that is actually down */
  ['nearBack', 'nearFront'].forEach(k => {
    const A = legs.parts[k];
    if (!A) return;
    if (A.points[3][1] < g.PAW_Y - 0.4 * (g.size / 32)) return;
    host.px(G, A.points[3][0] - 0.5, Math.min(Math.round(A.points[3][1] + 1.0 * (g.size / 32)), g.padRow), 'P');
  });

  return { rows: G.map(r => r.join('')), legs: legs, geom: g };
}

/* standing height, measured off a drawn frame rather than asserted:
 * the topmost inked row of the cat to the floor line. */
function measureStanding(rows, g) {
  let top = null;
  for (let y = 0; y < rows.length; y++) {
    /* the topmost row with any ink at all. A row is 64 chars of which
     * the cat occupies a few dozen, so "has no '.'" is never true at
     * this size — look for a character that is not transparent. */
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] !== '.') { top = y; break; }
    }
    if (top !== null) break;
  }
  if (top === null) return { top: null, height: 0, leg: g.PAW_Y - g.HIP_Y, pct: 0 };
  const height = g.FLOOR - top;
  const leg = g.PAW_Y - g.HIP_Y;
  return { top: top, height: height, leg: leg, pct: (leg / height) * 100 };
}

module.exports = {
  DEG, makeHost, HOST_32, maskChain,
  GEOM_32, GEOM_64, geomFor, LEG_SPEC, LEG_SPEC_64,
  solveLeg, legMask, rig2Legs, drawFrame, measureStanding,
  lerpPose, walkPose, bentPose, tuckPose, groomPose, solveLegAngles, oldPoseAsVector, walkPoseFromOldCycle,
  footPath, LEG_KEYS, legAt, GAIT, frac
};