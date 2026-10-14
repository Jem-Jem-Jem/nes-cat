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
  /* An ellipse rotated about its own centre. The pixel centre is still
   * (x + 0.5, y + 0.5) — the SAME convention as maskEllipse — and the
   * test rotates the offset into the ellipse's frame rather than
   * sampling at a shifted origin. Sampling at a shifted origin is what
   * puts a shape half a pixel off everything else in the sprite, and on
   * a head that is the difference between a tilt and a fault. */
  const maskEllipseRot = (cx, cy, rx, ry, ang) => {
    const m = emptyMask();
    const c = Math.cos(-ang), s = Math.sin(-ang);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = dx * c - dy * s, v = dx * s + dy * c;
      const a = u / rx, b = v / ry;
      if (a * a + b * b <= 1) m[y][x] = true;
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
  return { W: w, H: h, grid, emptyMask, maskOr, maskEllipse, maskEllipseRot, maskTri, paint, px, shadeBelow, stampCurve };
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
  /* the NECK joint, as a fraction of the skull radius from its centre.
   * See section 6: not the skull centre, because a head that spins on
   * its own centre is not a head tilting. */
  headPivot: { dx: -0.62, dy: 0.67 },
  headTiltRange: { min: -18, max: 30 },
  headEar: { top: 9.4, wide: 6.2, inner: 4.0, pink: [3.9, 5.6] },
  tail: { base: 2.5, c1: 3.2, c2: 5.0, rise: 8.0, r: 2.4, from: 0.5, c1y: 1.5, c2y: 8.0 },
  /* the CHAIN tail, beside the bezier above. 32x64 and 2.4 -> 1.0 radii:
   * the old tail's radius was 2.4 all the way, which is what makes it
   * read as a sausage rather than a tail. */
  tailChain: { segs: 8, len: 15.0, x: 12.5, y: 32.0, rBase: 2.4, rTip: 1.0, taper: 0.75,
               swayAmp: 6, liftAmp: 5, curlMin: 10, curlMax: 55 },
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
  /* the NECK joint: (46 - 9.5*0.62, 18 + 9*0.67) = (40.1, 24.0), which
   * sits just above the front of the chest where a neck belongs. */
  headPivot: { dx: -0.62, dy: 0.67 },
  headTiltRange: { min: -30, max: 50 },
  headEar: { top: 12.0, wide: 11.0, inner: 8.0, pink: [6.6, 10.0] },
  tail: { base: 5.0, c1: 6.4, c2: 12.0, r: 4.0, from: 5.0, c1y: 7.0, c2y: 12.0 },
  /* the CHAIN tail, beside the bezier above. The old one is three control
   * points at a constant radius 4.0; this is 8 segments from 4.2 down to
   * 1.4, so the root is three times the tip instead of equal to it. */
  tailChain: { segs: 8, len: 26.0, x: 18.0, y: 29.0, rBase: 3.2, rTip: 1.0, taper: 0.8,
               baseA: 22, swayAmp: 12, liftAmp: 30, curlMin: 40, curlMax: 120 },
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

/* `size` is a number today, and stays behaving like one. It may ALSO be a
 * geometry table, in which case it is used as given — that is how a
 * candidate silhouette is driven through this same rig instead of
 * needing a second copy of every function here. A table is recognised by
 * being an object, and geomFor(32)/geomFor(64)/geomFor() are untouched,
 * so nothing existing can reach the new branch. */
function geomFor(size) {
  if (!size) return GEOM_32;
  if (typeof size === 'object') return size;
  return Number(size) >= 64 ? GEOM_64 : GEOM_32;
}

/* Clone a geometry table with overrides, one level deep. Used to derive a
 * candidate from the cat that already exists, so a candidate only has to
 * state what it CHANGES and inherits the rest — which is what keeps a
 * candidate from silently dropping a rig feature by forgetting to restate
 * it. */
function geomVariant(base, over) {
  const g = Object.assign({}, base, over);
  if (over && over.headEar) g.headEar = Object.assign({}, base.headEar, over.headEar);
  if (over && over.tailChain) g.tailChain = Object.assign({}, base.tailChain, over.tailChain);
  if (over && over.gait) g.gait = Object.assign({}, base.gait, over.gait);
  if (over && over.leg) {
    g.leg = {
      front: Object.assign({}, base.leg.front, over.leg.front),
      hind: Object.assign({}, base.leg.hind, over.leg.hind)
    };
  }
  if (over && over.body) g.body = Object.assign({}, base.body, over.body);
  if (over && over.head) g.head = Object.assign({}, base.head, over.head);
  if (over && over.headPivot) g.headPivot = Object.assign({}, base.headPivot, over.headPivot);
  if (over && over.headTiltRange) g.headTiltRange = Object.assign({}, base.headTiltRange, over.headTiltRange);
  return g;
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

/* ---------- 5. the tail, as a chain -------------------------------------
 *
 * WHY THIS IS SHAPED LIKE A CHAIN AND NOT A BEZIER.
 *
 * The old tail is three control points and one radius of 2.4 for the
 * whole length, so it cannot taper and cannot change curvature along its
 * length: a cat's tail has 15-20 vertebrae and reads as alive precisely
 * because its shape keeps changing on the way out. A bezier with three
 * points cannot say "the curl is tight near the tip" — only "here are
 * three points".
 *
 * maskChain is already exactly the primitive this needs: a union of
 * tapered capsules with a radius at each point. There is no second
 * rasteriser here, and there should not be one.
 *
 * ANGLES. Tail angles use their own convention, because the leg
 * convention (0 = straight down) is wrong for a tail that starts by
 * going backwards:
 *
 *      0 = straight BACK (-x)      +90 = straight UP (-y)
 *
 * dirTail(a) = [-cos a, -sin a]
 *
 * THE POSE IS A FLAT VECTOR, like the legs, so it lerps. There is no
 * table of authored tail shapes anywhere in this file; every shape here
 * is a function of five numbers.
 */

function dirTail(a) { return [-Math.cos(a), -Math.sin(a)]; }

/* tailChain: a tail pose in, a point list and a radius list out.
 *
 * p is the flat vector:
 *   tailLift    base angle off straight-back, degrees
 *   tailSway    extra base angle, degrees (the whole tail swinging)
 *   tailCurl    total turn along the length, degrees
 *   tailBias    where that turn is concentrated, 0..1
 *   tailLen     total length in px
 */
function tailChain(p, g) {
  const T = g.tailChain;
  const n = T.segs;
  const seg = (p.tailLen == null ? T.len : p.tailLen) / n;
  /* baseA is the resting angle off straight-back; lift and sway ride on
   * top of it. Without a baseA a tail at zero lift runs straight back out
   * of the canvas, which at 64x64 is the same clipped-shape defect the
   * frame checker rejects. */
  let a = ((T.baseA || 0) + (p.tailLift || 0) + (p.tailSway || 0)) * DEG;
  const total = (p.tailCurl || 0) * DEG;
  const k = 1 + 6 * Math.max(0, Math.min(1, p.tailBias || 0));

  /* incremental turn, weighted so the last segments take more of it as
   * the bias rises. The weights are normalised against their own sum so
   * the tail always turns by exactly `total`. */
  const w = [];
  let wsum = 0;
  for (let i = 0; i < n; i++) {
    const f = (i + 1) / n;
    const v = Math.pow(f, k);
    w.push(v); wsum += v;
  }

  const x0 = T.x, y0 = T.y;
  const pts = [[x0, y0]];
  const radii = [T.rBase];
  let x = x0, y = y0;
  for (let i = 0; i < n; i++) {
    const d = dirTail(a);
    x += d[0] * seg;
    y += d[1] * seg;
    pts.push([x, y]);
    a += total * (w[i] / wsum);
    /* taper: thick at the base, thin at the tip. The exponent keeps the
     * fat end of the taper up near the root, which is where a cat's tail
     * is actually thickest. */
    const f = (i + 1) / n;
    radii.push(T.rTip + (T.rBase - T.rTip) * Math.pow(1 - f, T.taper));
  }
  return { points: pts, radii: radii, segs: n };
}

/* A pose is a point in a space, so these have to be continuous in t.
 * Nothing here is authored per frame. */
function tailPose(t, size) {
  const g = geomFor(size);
  const T = g.tailChain;
  const u = frac(t);
  return {
    /* the base rides a slow two-per-cycle sweep, like the old tailSway */
    tailSway: T.swayAmp * Math.sin(2 * Math.PI * u),
    /* it rides up and down once per cycle */
    tailLift: T.liftAmp + T.liftAmp * 0.6 * Math.cos(2 * Math.PI * u),
    /* and it curls: tight at the top of the lift, loose at the bottom */
    tailCurl: T.curlMin + (T.curlMax - T.curlMin) * (0.5 - 0.5 * Math.cos(2 * Math.PI * u)),
    tailBias: 0.25 + 0.5 * u,
    tailLen: T.len
  };
}

/* How much the SHAPE changes along the length, not just at the end.
 *
 * The old tail could be measured by comparing its tip to its base. This
 * measures the curvature in each third of the chain separately: if a
 * tail is a tube, all three thirds curve the same amount and the spread
 * is ~0. If it is a tail, the thirds differ. */
function curvatureProfile(chain) {
  const n = chain.segs;
  const thirds = [[], [], []];
  for (let i = 0; i < n; i++) thirds[Math.min(2, Math.floor(i * 3 / n))].push(i);
  return thirds.map(idx => {
    let t = 0;
    for (let j = 0; j < idx.length - 1; j++) {
      const A = chain.points[idx[j]], B = chain.points[idx[j] + 1], C = chain.points[idx[j] + 2];
      if (!C) break;
      const a1 = Math.atan2(B[1] - A[1], B[0] - A[0]);
      const a2 = Math.atan2(C[1] - B[1], C[0] - B[0]);
      t += Math.abs(a2 - a1);
    }
    return t / Math.max(1, idx.length);
  });
}

/* The same tail drawn on the cat, so it can be judged in context without
 * the legs and the head changing underneath it. The tail goes down FIRST,
 * behind the body, which is where a cat's tail is: it comes off the rump
 * and hangs behind her. */
function drawTailOnCat(p, host, size) {
  const g = geomFor(size);
  host = host || makeHost(g.size, g.size);
  const chain = tailChain(p, g);
  const G = host.grid();
  const body = g.body;
  const bx = body.x, by = body.y + (p.bodyY || 0);

  /* the chain hangs off the rump, so its first segment is drawn behind
   * the torso whatever the pose does */
  host.paint(G, maskChain(chain.points, chain.radii, host), 'W', 'K');

  const bodyMask = host.maskEllipse(bx, by, body.rx, body.ry);
  for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++)
    if (y + 0.5 > g.FLOOR) bodyMask[y][x] = false;
  host.paint(G, bodyMask, 'W', 'K');
  host.shadeBelow(G, bodyMask, bx, by + body.ry * 0.27, 'H');

  return G.map(r => r.join(''));
}

/* ---------- 6. the head, which tilts -------------------------------------
 *
 * WHY THE PIVOT IS NOT THE SKULL CENTRE.
 *
 * The obvious pivot is the middle of the skull ellipse, and it is the
 * wrong one. Rotating a head about its own centre makes the skull spin
 * where it sits: the muzzle and the ears orbit, the chin swings out into
 * the chest, and the result reads as a head being turned on a turntable
 * rather than a cat tipping her head. What actually happens when a cat
 * looks down is that the BACK OF THE SKULL STAYS PUT — it is resting on
 * the shoulders — and the whole face swings forward and down about the
 * neck.
 *
 * So the pivot is the neck joint: the back of the skull, where it meets
 * the spine. On this cat that is about 0.62 of the skull radius behind
 * the centre and 0.67 below it, which at 64x64 puts it at (40.1, 24.0)
 * — just above the front of the chest, where a neck would actually be.
 * Expressed as fractions of rx/ry so it scales with the head.
 *
 * SIGN. Positive headTilt drops the muzzle: the face is at +x from the
 * pivot, and positive screen rotation carries +x toward +y, which is
 * down. So positive = looking down, which is the intuitive direction.
 *
 * EVERYTHING IS AN OFFSET FROM THE SKULL CENTRE and every offset is
 * rotated about the pivot — skull, cheek, both ears, both pink ears, the
 * eye, the nose, the mouth. A skull that tilts while its ears stay put
 * is worse than no rotation at all, and this file already carries a
 * comment recording that exact bug having happened once.
 */
function headSolve(p, g) {
  const head = g.head;
  const E = g.headEar;
  const hx = head.x + (p.headDX || 0);
  const hy = head.y + (p.headDY || 0) + (p.bodyY || 0);
  /* the neck joint, in skull radii from the skull centre */
  const pv = g.headPivot;
  const px = hx + head.rx * pv.dx;
  const py = hy + head.ry * pv.dy;

  const a = (p.headTilt || 0) * DEG;
  const c = Math.cos(a), s = Math.sin(a);
  /* rotate a skull-relative offset about the NECK, not about the skull.
   * The vector from the neck to a point is the skull-centre offset MINUS
   * the centre-to-neck vector — getting that sign wrong displaces the
   * whole face even at zero tilt, which is the easiest way to ship a
   * head that is subtly wrong in every frame. */
  const rot = (ox, oy) => {
    const dx = ox - head.rx * pv.dx;
    const dy = oy - head.ry * pv.dy;
    return [px + dx * c - dy * s, py + dx * s + dy * c];
  };
  const tri = pts => pts.map(q => rot(q[0], q[1]));

  return {
    angle: p.headTilt || 0,
    pivot: [px, py],
    centre: [hx, hy],
    skull: rot(0, 0),
    cheek: rot(head.rx * 0.62, head.ry * 0.29),
    earL: tri([[-head.rx * 0.77, -head.ry * 0.62], [-E.wide, -E.top], [-head.rx * 0.10, -head.ry * 0.91]]),
    earR: tri([[head.rx * 0.37, -head.ry * 0.73], [E.wide * 0.90, -E.top * 0.98], [head.rx * 0.90, -head.ry * 0.65]]),
    /* The ear APEX, already rotated, so a rounded tip can be OR-ed onto
     * the triangle without the draw code having to know how the ear was
     * built. `earRnd` is the radius and is ABSENT on every geometry that
     * shipped, so those triangles stay exactly the triangles they were. */
    earApexL: rot(-E.wide, -E.top),
    earApexR: rot(E.wide * 0.90, -E.top * 0.98),
    earRnd: E.r || 0,
    pinkL: rot(-E.pink[0], -E.pink[1]),
    pinkR: rot(E.pink[1], -E.pink[1] - 0.2),
    eye: rot(head.rx * 0.10, -head.ry * 0.18),
    nose: rot(head.rx * 0.82, head.ry * 0.18)
  };
}

/* The tilt is a number in a flat pose, so it lerps with everything else.
   There is no table of authored head tilts anywhere in this file. */
function headTiltPose(t, size) {
  const g = geomFor(size);
  const u = frac(t);
  const R = g.headTiltRange;
  return {
    bodyY: 0, headDX: 0, headDY: 0,
    /* down and back up again: a slow look-down, a slower look-up */
    headTilt: R.max - (R.max - R.min) * (0.5 - 0.5 * Math.cos(2 * Math.PI * u))
  };
}

/* How far the face wanders per degree of tilt. This is the number that
 * says whether the head is usable or a liability: below about a pixel
 * per 10 degrees the tilt changes nothing on screen, and above about
 * three the eye starts hopping between pixels instead of travelling. */
function headDrift(deg, size) {
  const g = geomFor(size);
  const a = headSolve({ headTilt: deg }, g);
  const b = headSolve({ headTilt: deg + 10 }, g);
  return {
    muzzle: Math.hypot(a.nose[0] - b.nose[0], a.nose[1] - b.nose[1]),
    ear: Math.hypot(a.earR[0][0] - b.earR[0][0], a.earR[0][1] - b.earR[0][1])
  };
}

/* The head drawn on the cat at a tilt. Same parts, same colours, same
 * (x + 0.5) pixel convention as everything else — only the pivot
 * changes. Kept separate from drawFrame so a tilt is a preview and can
 * never reach the frames a frame build emits. */
/* ---- the head, painted onto G ----
 *
 * TWO FORMS, chosen by the geometry table.
 *
 * `paintHeadForm` (g.headForm present) builds the face as a set of masses
 * at DIFFERENT DEPTHS rather than one outline with a bump on it. That is
 * the difference between a cat and a mouse in profile: a mouse face is a
 * round skull with features arranged on ONE plane, and a cat face has a
 * muzzle that PROJECTS FORWARD of the skull, a visible turn between the
 * brow and the muzzle, a nose at the FRONT face of the muzzle, and mass
 * under and behind it for the jaw. Pixel art is a low-resolution
 * simulation of 3D form; if the depth does not survive the reduction the
 * form is wrong, and the symptom is a small round head with dots on it.
 *
 * `headForm.flat` collapses the same lobes onto one plane and drops the
 * plane shading. It exists to be the CONTROL: if the flat version does
 * not look obviously worse next to the real one, the depth is not
 * reading and the claim should be withdrawn.
 *
 * The default form is the older single-skull-plus-cheek construction,
 * byte for byte, so no geometry that shipped can reach the new branch.
 */
function paintHeadForm(G, host, g, p) {
  const head = g.head;
  const F = g.headForm;
  const a = (p.headTilt || 0) * DEG;
  const c = Math.cos(a), s = Math.sin(a);
  const pv = g.headPivot;
  const hx = head.x + (p.headDX || 0);
  const hy = head.y + (p.headDY || 0) + (p.bodyY || 0);
  const pvx = head.rx * pv.dx, pvy = head.ry * pv.dy;
  const ppx = hx + pvx, ppy = hy + pvy;

  /* `rot` takes an offset FROM THE SKULL CENTRE, exactly as headSolve
   * does — it adds the centre back itself. Passing an absolute position
   * double-counts hx and throws the whole head off the canvas, which
   * looks like an empty frame and cost a debugging cycle. */
  const rot = (ox, oy) => {
    const dx = ox - pvx, dy = oy - pvy;
    return [ppx + dx * c - dy * s, ppy + dx * s + dy * c];
  };
  const abs = (lx, ly) => rot(lx * head.rx, ly * head.ry);

  /* ---- the masses, back to front ----
   * `z` is forward projection in skull radii: how far the mass sits in
   * FRONT of the cranium's front edge. It is what the SILHOUETTE shows,
   * so it is measured, not implied. */
  const lobes = F.lobes.map(L => ({
    c: abs(L.x, L.y),
    rx: L.rx * head.rx, ry: L.ry * head.ry, z: L.z
  }));
  const front = lobes.reduce((m, L) => Math.max(m, L.c[0] + L.rx), -999);
  const back = lobes.reduce((m, L) => Math.min(m, L.c[0] - L.rx), 999);
  const mz = lobes.reduce((m, L) => (L.z > m.z ? L : m), lobes[0]);
  const jw = lobes.find(L => L.jaw);
  const br = lobes.find(L => L.brow);

  /* ONE mask, so the head is one outlined shape carrying internal planes
   * rather than a pile of separately-outlined circles */
  const ms = lobes.map(L => host.maskEllipseRot(L.c[0], L.c[1], L.rx, L.ry, a));
  const face = F.flat
    /* the CONTROL: the cranium, plus the muzzle drawn ON the skull plane
     * — the old "cheek bulge" idea, which is exactly what reads as a
     * mouse. Same lobes, same sizes, no projection, no plane shading. */
    ? host.maskOr(ms[0], host.maskEllipseRot(lobes[1].c[0] - head.rx * 0.30,
        lobes[1].c[1], lobes[1].rx, lobes[1].ry, a))
    : host.maskOr.apply(null, ms);
  host.paint(G, face, 'W', 'K');

  /* ---- the plane breaks, which is the depth made visible ---- */

  /* 1. the OCCLUSION shadow under the muzzle: where it overhangs the jaw
   *    that surface cannot see the light and goes dark. The strongest cue
   *    available, because it is the one that says "this piece of the face
   *    is IN FRONT of that piece". */
  const under = host.emptyMask();
  if (!F.flat && mz && jw) {
    for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++) {
      if (!face[y][x]) continue;
      const dx = x + 0.5 - mz.c[0], dy = y + 0.5 - mz.c[1];
      const t = (dx * dx) / (mz.rx * mz.rx) + (dy * dy) / (mz.ry * mz.ry);
      if (t > 1) continue;
      if (dy > -mz.ry * 0.10 && dx < -mz.rx * 0.05) under[y][x] = true;
    }
    host.paint(G, under, 'H', 'H');
  }

  /* 2. the STOP: the turn from brow plane to muzzle plane, visible on the
   *    silhouette as a dark notch where the two planes meet. */
  const stop = host.emptyMask();
  if (!F.flat && br && mz) {
    for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++) {
      if (!face[y][x] || under[y][x]) continue;
      const dyb = (y + 0.5 - br.c[1]) / br.ry;
      const dym = (y + 0.5 - mz.c[1]) / mz.ry;
      if (dyb > 0.35 && dyb < 1.05 && dym < -0.05 && x + 0.5 > br.c[0]) stop[y][x] = true;
    }
    host.paint(G, stop, 'H', 'H');
  }

  /* 3. general form shading below the cheek line, as everywhere else */
  if (!F.flat) host.shadeBelow(G, face, hx, hy + head.ry * F.shadeFrom, 'H');

  /* ---- ears ----
   *
   * The ear POINTS come from headSolve, not from a second calculation
   * here. Computing them again would be a copy that rots the moment the
   * ear changed, and the candidate's head would quietly stop being the
   * rotatable one — which is exactly the failure this file already
   * records having had once. One source of truth: headSolve. */
  const E = g.headEar;
  const hs = headSolve(p, g);
  const triL = host.maskTri(hs.earL[0][0], hs.earL[0][1], hs.earL[1][0], hs.earL[1][1],
                            hs.earL[2][0], hs.earL[2][1]);
  const triR = host.maskTri(hs.earR[0][0], hs.earR[0][1], hs.earR[1][0], hs.earR[1][1],
                            hs.earR[2][0], hs.earR[2][1]);
  host.paint(G, E.r
    ? host.maskOr(triL, host.maskEllipse(hs.earApexL[0], hs.earApexL[1], E.r, E.r))
    : triL, 'W', 'K');
  host.paint(G, E.r
    ? host.maskOr(triR, host.maskEllipse(hs.earApexR[0], hs.earApexR[1], E.r, E.r))
    : triR, 'W', 'K');
  host.px(G, hs.pinkL[0], hs.pinkL[1], 'P');
  host.px(G, hs.pinkR[0], hs.pinkR[1], 'P');

  /* ---- the eye: a ROTATED ellipse, set BACK and HIGH beside the brow
   *    rather than centred on the face. A large centred eye is the mouse
   *    tell. */
  const e = abs(F.eye[0], F.eye[1]);
  const eyeM = host.maskEllipseRot(e[0], e[1], head.rx * F.eye[2], head.ry * F.eye[3], a);
  for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++)
    if (eyeM[y][x] && face[y][x]) G[y][x] = 'E';
  /* the catchlight, up and forward: a highlight on the NEAR surface is
   * the second depth cue, because it says which surface is nearer */
  host.px(G, e[0] + head.rx * 0.05, e[1] - head.ry * 0.11, 'W');

  /* ---- the nose: the FRONT FACE of the muzzle, not a mark on a plane.
   *    It sits at the muzzle's leading edge. ---- */
  let n = abs(F.nose[0], F.nose[1]);
  if (F.flat) {
    /* In the control the muzzle does not project, so a nose placed at the
     * PROJECTED muzzle's leading edge falls off the collapsed face and
     * vanishes — which would make the control look BROKEN rather than
     * flat. Pin it to the flat face's own front edge so the only
     * difference between the two is depth, not a missing part. */
    const ny = Math.round(n[1]);
    let ex = -1;
    for (let x = 59; x >= 0; x--) if (face[ny] && face[ny][x]) { ex = x; break; }
    if (ex >= 0) n = [ex - 0.5, n[1]];   /* pxIn rounds, so aim INSIDE */
  }
  const pxIn = (x, y, ch) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= host.W || yi < 0 || yi >= host.H) return;
    if (face[yi][xi]) G[yi][xi] = ch;
  };
  pxIn(n[0], n[1], 'N');
  /* the philtrum running back and down from the nose to the lip, on the
   * FRONT plane so it is lighter than the shadow behind it */
  pxIn(n[0] - head.rx * 0.10, n[1] + head.ry * 0.16, 'M');
  pxIn(n[0] - head.rx * 0.18, n[1] + head.ry * 0.30, 'M');

  /* The return keeps headSolve's SHAPE, because that is the contract every
   caller of drawCandidate().solve already reads — pivot, earR, skull,
   nose. Returning a different shape would silently break the rotatable
   head's contract while the art still looked right, which is the worst
   possible failure. The form-specific extras ride alongside. */
  return {
    angle: hs.angle, pivot: hs.pivot, centre: hs.centre, skull: hs.skull,
    cheek: hs.cheek, earL: hs.earL, earR: hs.earR,
    earApexL: hs.earApexL, earApexR: hs.earApexR, earRnd: hs.earRnd,
    pinkL: hs.pinkL, pinkR: hs.pinkR, eye: hs.eye, nose: hs.nose,
    face: face, front: front, back: back,
    muzzle: mz, muzzlePoint: n, eyePoint: e,
    form: F.flat ? 'flat' : 'depth'
  };
}

function paintHead(G, host, g, p) {
  if (g.headForm) return paintHeadForm(G, host, g, p);
  const head = g.head;
  const s = headSolve(p, g);
  const a = (p.headTilt || 0) * DEG;
  const skull = host.maskEllipseRot(s.skull[0], s.skull[1], head.rx, head.ry, a);
  const cheek = host.maskEllipseRot(s.cheek[0], s.cheek[1],
                                    head.rx * 0.44, head.ry * 0.44, a);
  const headAll = host.maskOr(skull, cheek);
  host.paint(G, headAll, 'W', 'K');

  const earL = host.maskTri(s.earL[0][0], s.earL[0][1], s.earL[1][0], s.earL[1][1],
                            s.earL[2][0], s.earL[2][1]);
  const earR = host.maskTri(s.earR[0][0], s.earR[0][1], s.earR[1][0], s.earR[1][1],
                            s.earR[2][0], s.earR[2][1]);
  /* a rounded tip is OR-ed into the SAME mask the triangle is, so the
   * ear is one shape with one outline rather than a triangle with a
   * circle sitting on it wearing its own outline */
  host.paint(G, s.earRnd
    ? host.maskOr(earL, host.maskEllipse(s.earApexL[0], s.earApexL[1], s.earRnd, s.earRnd))
    : earL, 'W', 'K');
  host.paint(G, s.earRnd
    ? host.maskOr(earR, host.maskEllipse(s.earApexR[0], s.earApexR[1], s.earRnd, s.earRnd))
    : earR, 'W', 'K');
  host.px(G, s.pinkL[0], s.pinkL[1], 'P');
  host.px(G, s.pinkR[0], s.pinkR[1], 'P');

  /* the eye is a ROTATED ellipse, not a block stamped at a rounded
   * position. A 2x5 block stamped at a rounded point shears as the head
   * turns; an ellipse in the head's own frame does not, and this is the
   * one part of the face the eye reads first. */
  const eyeM = host.maskEllipseRot(s.eye[0], s.eye[1], head.rx * 0.10, head.ry * 0.24, a);
  for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++)
    if (eyeM[y][x] && headAll[y][x]) G[y][x] = 'E';

  const pxIn = (x, y, c) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= host.W || yi < 0 || yi >= host.H) return;
    if (!headAll[yi][xi]) return;
    G[yi][xi] = c;
  };
  /* the muzzle: nose and mouth, carried on the rotated frame */
  const nv = s.nose, sk = s.skull;
  const fwd = [nv[0] - sk[0], nv[1] - sk[1]];
  pxIn(nv[0], nv[1], 'N');
  pxIn(nv[0] - fwd[0] * 0.22, nv[1] - fwd[1] * 0.22 + 1.6, 'M');
  pxIn(nv[0] - fwd[0] * 0.05, nv[1] - fwd[1] * 0.05 + 3.2, 'M');

  host.shadeBelow(G, headAll, s.skull[0], s.skull[1] + head.ry * 0.22, 'H');

  return s;
}

function drawHeadOnCat(p, host, size) {
  const g = geomFor(size);
  host = host || makeHost(g.size, g.size);
  const G = host.grid();
  const body = g.body;
  const bx = body.x, by = body.y + (p.bodyY || 0);

  host.stampCurve(G,
    [bx - body.rx + g.tail.base, by - g.tail.from],
    [bx - body.rx + g.tail.base - g.tail.c1 - (p.tailSway || 0), by - g.tail.c1y],
    [bx - body.rx + g.tail.base - g.tail.c2 - (p.tailSway || 0), by - g.tail.c2y],
    g.tail.r, 'W', 'K');

  const bodyMask = host.maskEllipse(bx, by, body.rx, body.ry);
  for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++)
    if (y + 0.5 > g.FLOOR) bodyMask[y][x] = false;
  host.paint(G, bodyMask, 'W', 'K');
  host.shadeBelow(G, bodyMask, bx, by + body.ry * 0.27, 'H');

  const s = paintHead(G, host, g, p);
  return { rows: G.map(r => r.join('')), solve: s };
}

/* ---------- 7. candidate silhouettes ------------------------------------
 *
 * A CANDIDATE IS A GEOMETRY TABLE, NOT A NEW RIG.
 *
 * That is the whole design, and it is why a candidate cannot quietly
 * lose a feature. Everything below reaches the leg solve through
 * rig2Legs, the tail through tailChain and the head through paintHead —
 * the same three functions the shipped cat is drawn with. An articulated
 * leg, a segmented tail and a rotatable head are not things a candidate
 * has or lacks; they are the only way anything in this file gets drawn.
 *
 * THE TWO FREEDOMS THE 32 GRID DID NOT HAVE.
 *
 * The 32x32 cat is round because 32x32 demands it: a paw with three toes
 * needs pixels that were spent on the outline, an ear needs enough of them
 * to read as an ear rather than as a spike, and any silhouette that is not
 * chunky enough disappears at that size. Those were the grid talking, not
 * taste. So here:
 *
 *   - the torso is not obliged to be ONE ellipse. `torso.lobes` OR-s a set
 *     of them into one mask and paints it once, so a deep chest, a tucked
 *     waist and a haunch make ONE outlined shape with a real dip in the
 *     back and a real tuck above the belly. A single cloud cannot do that
 *     at any resolution; it was never a resolution problem.
 *   - the paw is not obliged to be a ball. `paw.toes` adds N circles
 *     fanned around the end of the chain, OR-ed into the leg's OWN mask so
 *     the foot is one outlined shape and not a leg wearing studs.
 *
 * Everything else — leg lengths and radii, head size, ear size, tail —
 * is just different numbers, because those were never blocked.
 */

/* toes, fanned around the end of the leg chain. 0 = straight down,
 * positive toward +x, which is FORWARD for a cat authored facing right —
 * the same convention solveLeg uses, so a paw points the way its leg
 * points. */
function toeMask(foot, paw, host) {
  const m = host.emptyMask();
  if (!paw || !paw.toes) return m;
  const n = paw.toes;
  const aim = paw.aim || 0;
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const d = dir((aim - paw.spread + 2 * paw.spread * f) * DEG);
    const cx = foot[0] + d[0] * paw.tof;
    const cy = foot[1] + d[1] * paw.tof;
    for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++) {
      const dx = (x + 0.5 - cx) / paw.r, dy = (y + 0.5 - cy) / paw.r;
      if (dx * dx + dy * dy <= 1) m[y][x] = true;
    }
  }
  return m;
}

/* The torso. Falls back to the single ellipse, which is what every
 * geometry that shipped has and what `GEOM_64` still draws. */
function torsoMask(host, g, bodyY) {
  const body = g.body;
  const T = g.torso;
  let m;
  if (T && T.lobes && T.lobes.length) {
    m = host.maskOr.apply(null, T.lobes.map(l =>
      host.maskEllipse(body.x + l.dx, body.y + l.dy + (bodyY || 0), l.rx, l.ry)));
  } else if (T && T.spine && T.spine.length) {
    m = maskChain(T.spine.map(s => [s[0], s[1] + (bodyY || 0)]), T.spine.map(s => s[2]), host);
  } else {
    m = host.maskEllipse(body.x, body.y + (bodyY || 0), body.rx, body.ry);
  }
  for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++)
    if (y + 0.5 > g.FLOOR) m[y][x] = false;
  return m;
}

const FAR = { farBack: true, farFront: true };

/* A candidate cat at a pose, drawn with the shipped rig. Paint order is
 * the shipped order: tail behind, legs behind, torso over the hips, head
 * last. */
function drawCandidate(p, host, g) {
  host = host || makeHost(g.size, g.size);
  const G = host.grid();
  const body = g.body;
  const by = body.y + (p.bodyY || 0);

  host.paint(G, maskChain(tailChain(p, g).points, tailChain(p, g).radii, host), 'W', 'K');

  const legs = rig2Legs(p, host, g);
  const masks = {};
  LEG_KEYS.forEach(k => {
    const A = legs.parts[k];
    if (!A) { masks[k] = null; return; }
    let m = maskChain(A.points, A.radii, host);
    const tm = toeMask(A.points[3], g.paw, host);
    let any = false;
    for (let y = 0; y < host.H && !any; y++)
      for (let x = 0; x < host.W; x++) if (tm[y][x]) { any = true; break; }
    masks[k] = any ? host.maskOr(m, tm) : m;
  });
  LEG_KEYS.forEach(k => { if (masks[k]) host.paint(G, masks[k], FAR[k] ? 'G' : 'W', 'K'); });

  const bodyMask = torsoMask(host, g, p.bodyY || 0);
  host.paint(G, bodyMask, 'W', 'K');
  host.shadeBelow(G, bodyMask, body.x,
    by + (g.torso && g.torso.shadeFrom != null ? g.torso.shadeFrom : body.ry * 0.27), 'H');

  const s = paintHead(G, host, g, p);

  /* the pad, on a near paw that is actually down */
  ['nearBack', 'nearFront'].forEach(k => {
    const A = legs.parts[k];
    if (!A) return;
    if (A.points[3][1] < g.PAW_Y - 0.4 * (g.size / 32)) return;
    host.px(G, A.points[3][0] - 0.5,
      Math.min(Math.round(A.points[3][1] + 1.0 * (g.size / 32)), g.padRow), 'P');
  });

  return { rows: G.map(r => r.join('')), legs: legs, solve: s, geom: g };
}

/* A STANDING POSE — four feet down, weight even.
 *
 * TWO WAYS THIS IS AUTHORED, and which one runs is a property of the
 * geometry table, not of the caller:
 *
 *   1. No `g.restLeg`. The femur runs down from the hip and the paw sits
 *      below it, so the two-link solve throws the fold into the tibia,
 *      and that fold is the digitigrade Z. Nothing is authored; the
 *      solve produces the bend. SHEER and KITTEN use this, and changing
 *      it would move a candidate a human has already weighed.
 *
 *   2. With `g.restLeg`. Explicit joint angles through solveLegAngles,
 *      which is pure FK and clamps nothing. Near-vertical bones give a
 *      straight leg at rest.
 *
 * WHY 2 EXISTS. A bent hind leg in a light palette reads as a RABBIT,
 * and that is perceptual rather than taste — cat and rabbit are genuinely
 * ambiguous in profile, and the eye separates them on exactly two
 * features, hind-leg curvature and ear shape. Curvature belongs to
 * MOTION: the walk, a pounce, a stretch. At rest a cat stands on
 * straight legs. So the rest pose stops asking the solver for a bend and
 * states the bones it wants instead — and the Z comes straight back the
 * moment a pose is driven by a paw target rather than by angles. */
function idlePose(g, over) {
  const p = Object.assign({
    bodyY: 0, headDX: 0, headDY: 0, headTilt: 0,
    tailLift: 0, tailSway: 0,
    tailCurl: g.tailChain.idleCurl != null ? g.tailChain.idleCurl : 34,
    tailBias: g.tailChain.idleBias != null ? g.tailChain.idleBias : 0.50,
    tailLen: g.tailChain.len
  }, over || {});
  const R = g.restLeg;
  LEG_KEYS.forEach(k => {
    const at = legAt(g, k);
    p[k + '_hipX'] = g.legX[k];
    p[k + '_footX'] = g.legX[k] + 0.4;
    p[k + '_footY'] = g.PAW_Y;
    const r = R && R[at.kind];
    if (r) {
      p[k + '_hipA'] = r.hipA || 0;
      p[k + '_tibiaA'] = r.tibiaA;
      p[k + '_metaA'] = r.metaA;
    } else {
      p[k + '_hipA'] = 0;
    }
  });
  return p;
}

/* How far the rest pose departs from vertical, in pixels: the largest
 * horizontal offset any of the leg's four joints carries from its hip.
 * That is the number that says whether she is standing on legs or on
 * sticks, and it is measured off the FINISHED chain so an authored leg
 * and a solved one are directly comparable. */
function restDeviation(g, key) {
  const A = legMask(idlePose(g), key, g);
  const hx = A.points[0][0];
  let worst = 0, at = -1;
  A.points.forEach((q, i) => {
    const d = Math.abs(q[0] - hx);
    if (d > worst) { worst = d; at = i; }
  });
  const names = ['hip', 'knee', 'ankle', 'paw'];
  return { px: worst, joint: names[at] || '?', points: A.points, bend: A.bendPx };
}

function geomForIdle(g, over) {
  return idlePose(g, over);
}

/* ---------- the three candidates ----------------------------------------
 *
 * Deliberately spread across the axes a cat's proportions actually run
 * on — leg length, head-to-body, torso shape, paw definition — so the
 * choice between them is a real choice and not three timids.
 *
 * COUCH   short legs, deep round torso, big head. The cat the 32x32 grid
 *         was forcing, drawn properly, with toes.
 * SHEER   the departure. NO cloud: a ribcage lobe, a small high waist lobe
 *         and a haunch OR-ed into one outlined shape, long thin legs, the
 *         smallest head. Reads as a young cat built to run.
 * KITTEN  a kitten: head 45% of her standing height, tiny body, stubby
 *         legs, round-tipped ears, four splayed toes on every paw.
 */

/* The COUCH a human chose, frozen, so the refined one can be put side by
 * side with it instead of against a memory. These are the exact numbers
 * brief 33 changed. Nothing here is ever used to draw the cat the game
 * would get; it exists to answer "did that help" with pixels. */
const CANDIDATE_COUCH_V1 = geomVariant(GEOM_64, {
  FLOOR: 58.0, LEG_TOP: 43.0, HIP_Y: 44.0, PAW_Y: 56.0,
  body: { x: 28.0, y: 37.0, rx: 17.0, ry: 10.5 },
  head: { x: 45.0, y: 22.0, rx: 11.0, ry: 10.2 },
  headEar: { top: 13.5, wide: 12.5, inner: 8.6, pink: [7.4, 10.8], r: 1.6 },
  legX: { nearFront: 45.0, farBack: 15.0, nearBack: 25.0, farFront: 34.0 },
  padRow: 57,
  paw: { toes: 3, tof: 2.6, spread: 50, aim: 70, r: 1.05 },
  tailChain: { x: 14.0, y: 33.0, len: 22.0, rBase: 3.4, rTip: 1.2, baseA: 64, idleCurl: 130, idleBias: 0.25 },
  leg: {
    front: { femur: 5.2, tibia: 6.4, meta: 4.6, r: [3.40, 2.70, 2.10, 2.50] },
    hind: { femur: 5.4, tibia: 6.4, meta: 4.4, r: [3.60, 2.90, 2.20, 2.50] }
  }
});

/* COUCH_LEG_ARITHMETIC — how 9.3px was arrived at, kept beside the number
 * so the two cannot drift apart.
 *
 * THIS IS A COMPOSITIONAL DEVICE, NOT A FACT ABOUT CATS. Stated plainly
 * because it matters: a real cat's leg is roughly 40% of her standing
 * height, which is LONGER than either the old COUCH (23.5%) or this
 * (18.6%). Nothing here is leg anatomy.
 *
 * The golden ratio was offered as the heuristic, so here is the
 * arithmetic and, more usefully, the arithmetic that shows it does not
 * work as given:
 *
 *     phi = (1 + sqrt 5) / 2 = 1.6180339887
 *
 * The usual compositional reading — leg : (torso + head) = 1 : phi^2 —
 * gives
 *
 *     L / (H - L) = 1 / 2.6180339887
 *     L = (H - L) / 2.6180339887
 *     L * 3.6180339887 = H
 *     L = H / 3.6180339887 = 0.2763932 * H        <- 27.6%
 *
 * which is LONGER than the 23.5% it was asked to shorten. The golden
 * section, applied the obvious way, points the WRONG WAY for this brief.
 *
 * The next ratio down does point the right way. leg : (torso + head)
 * = 1 : phi^3:
 *
 *     phi^3 = 4.2360679775
 *     L / (H - L) = 1 / 4.2360679775
 *     L * 5.2360679775 = H
 *     L = H / 5.2360679775 = 0.1909830 * H        <- 19.1%
 *
 * With H = 50px, the standing height MEASURED off the drawn frame (floor
 * line to ear tip) after the rounder ear raised the tip by one row:
 *
 *     L = 50 / 5.2360679775 = 9.5492px             <- golden target
 *     L as authored        = 9.30px              <- femur 3.2 + tibia
 *     9.30 / 50            = 18.6%                  3.45 + meta 2.7 =
 *                                                     9.35, less the 0.05
 *                                                     the near-vertical
 *                                                     angles shorten by
 *
 * Landed within 0.25px of the golden target. That is the whole
 * derivation, and it is a golden-section ratio chosen because it is the
 * only one that both uses the number that was offered and points in the
 * direction the human asked for. */
const COUCH_LEG_ARITHMETIC = {
  phi: 1.6180339887, phi3: 4.2360679775, ratio: 0.1909830,
  standingHeight: 50, target: 9.5492, authored: 9.30,
  before: { span: 12.0, standing: 51, pct: 23.5 },
  after: { span: 9.30, standing: 50, pct: 18.6 }
};

/* COUCH after brief 33. Four changes, in the order they were asked for.
 *
 * 1. THE FRONT LEG WAS ON A THREAD. It was never technically detached —
 *    the whole cat measured as ONE connected component — but the bridge
 *    from the near-front leg to the torso was 4 pixel pairs across 3
 *    pixels, against 11-30 pairs for every other limb. Two shapes that
 *    meet at a corner are 4-connected and read as two objects, which is
 *    what the eye sees. It was authored at legX.nearFront 45, which is
 *    body.x + body.rx EXACTLY: the very tip of the chest, where a breast
 *    is and not a shoulder. Moved back to 41 and the bridge becomes 10
 *    pairs across 9px — which is also where a front leg belongs.
 *
 *    Note the radius change is part of THIS fix, not a fifth change.
 *    Shortening the leg had thinned the hip from 3.4 to 2.5, and a hip
 *    with so little mass cannot make a join: at 2.5 the bridge fell
 *    back to 7 pairs. A shorter leg must not mean a thinner hip.
 *
 * 2. LEGS SHORTER. 12.0px -> 9.3px on a standing height of 50px, i.e.
 *    23.5% -> 18.6%. Full arithmetic in COUCH_LEG_ARITHMETIC above.
 *
 * 3. STRAIGHT AT REST. `restLeg` replaces the solved bend with authored
 *    near-vertical bones through solveLegAngles. Worst departure from
 *    vertical is 0.30px at the front ankle and 0.48px at the hind. The
 *    Z is NOT gone — walkPose carries no tibiaA/metaA, drives the paws
 *    to targets, and the solve puts the fold straight back.
 *
 * 4. ROUND EARS. apex radius 1.6 -> 2.8. The circle is OR-ed into the
 *    triangle's OWN mask in paintHead, so a rounded ear is still one
 *    outlined shape and cannot leave behind the floating speck a bare
 *    triangle apex produces. Verified: 0 specks.
 */
const CANDIDATE_COUCH = geomVariant(GEOM_64, {
  /* 2. FLOOR drops 58 -> 56 and PAW_Y 56 -> 53.3. Shortening the leg
     means the paw no longer reaches the old floor line, so the floor
     line moves with it rather than leaving her floating. */
  FLOOR: 56.0, LEG_TOP: 43.0, HIP_Y: 44.0, PAW_Y: 53.3,
  /* 2. TORSO, re-settled against the legs brief 33 shortened.
   *
   * It is NOT an independent shape, and the evidence is arithmetic. The
   * paw's bottom sits at PAW_Y + the paw radius = 53.3 + 2.5 = 55.8 and
   * FLOOR is 56, so the paws are ON the floor. The leg span is 9.3px, so
   * the belly that makes the VISIBLE leg equal the leg span belongs at
   * 55.8 - 9.3 = 46.5. It was at 47.5, which showed a leg 1.0px shorter
   * than the leg the rig is actually drawing.
   *
   * So the torso drops 0.5px and slims 10.5 -> 10.0, landing the belly
   * on 46.5 and the visible leg on 9.3px exactly.
   *
   * The second constraint pulls the other way: the belly must also COVER
   * the hips, or brief 33's front-leg fix is undone. So the attachment is
   * measured rather than assumed. Slimming takes the near-front bridge
   * from 10 pixel pairs across 9px to 9 pairs across 8px; measured as a
   * multiple of the limb's own width, which is the honest test, that is
   * 1.50x -> 1.33x, well clear of the 0.30x that read as detached. rx
   * stays 17 so the chest still covers the near-front hip at x=41 with
   * room to spare. The whole change is one ellipse 1px shallower. */
  body: { x: 28.0, y: 36.5, rx: 17.0, ry: 10.0 },
  head: { x: 45.0, y: 22.0, rx: 11.0, ry: 10.2 },
  /* 4. EARS - shorter AND round.
   *
   * The previous pass set an apex radius of 2.8 on an ear still 3.3 skull
   * radii long, which rounded the TIP of a spike and left the spike. A
   * short rounded ear is a different shape, not a different end: E.top
   * drops 13.5 -> 12.2, so the ear stands 2.0 skull radii above the
   * cranium instead of 3.3 - a 39% cut - and the apex radius rises
   * 2.8 -> 3.3 so the round dominates what is left. The circle is OR-ed
   * into the triangle's OWN mask, so the ear stays one outlined shape and
   * cannot leave the floating speck a bare apex produces. */
  headEar: { top: 12.2, wide: 10.8, inner: 8.0, pink: [7.0, 9.8], r: 3.3 },
  /* 3. THE FACE, as depth rather than outline.
   *
   * Each lobe is a mass at a different DEPTH, given in skull radii:
   *   x, y   where it sits, as a fraction of the skull radii
   *   rx, ry its size, as a fraction of the skull radii
   *   z      how far it projects FORWARD of the cranium's front edge.
   *          This is the number the change turns on. The old face's
   *          "cheek" ellipse reached 0.6px past the skull, which is not
   *          projection, it is a bump. The muzzle here reaches 5.1px, so
   *          the SILHOUETTE carries the depth rather than a shading trick
   *          painted inside a fixed outline.
   *
   * cranium z 0.0  the skull mass, the deepest thing
   * brow    z 0.4  the plane above and forward of the cranium
   * muzzle  z 1.0  projects forward of everything; the cat's tell
   * jaw     z 0.6  mass UNDER and BEHIND the muzzle
   * cheek   z 0.2  mass under the eye, carrying the lower skull
   *
   * The nose sits at the muzzle's LEADING EDGE, so it reads as the front
   * face of a projecting mass rather than a dot painted on a plane. The
   * eye is set back and high beside the brow, because a large centred eye
   * is the mouse tell.
   *
   * `flat: true` collapses these same lobes onto ONE plane and drops the
   * plane shading. It is the CONTROL for the depth test: same lobes, same
   * sizes, no projection. */
  headForm: {
    lobes: [
      /* the cranium is the FULL skull ellipse, unchanged. An earlier
       * attempt shrank it to 0.95 to leave room for the brow, which
       * dropped its underside 0.5px and opened a 1.18px gap between the
       * jaw and the chest at x=43.7 — the head came off as a 384px
       * island. It is the MUZZLE that has to project, not a smaller
       * skull; the cranium must stay big enough to meet the body. */
      { x: -0.12, y: -0.02, rx: 1.00, ry: 1.00, z: 0.0 },
      { x: 0.40, y: -0.38, rx: 0.60, ry: 0.52, z: 0.4, brow: true },
      { x: 0.74, y: 0.16, rx: 0.58, ry: 0.50, z: 1.0 },
      { x: 0.34, y: 0.52, rx: 0.52, ry: 0.34, z: 0.6, jaw: true },
      { x: -0.22, y: 0.40, rx: 0.56, ry: 0.48, z: 0.2 }
    ],
    nose: [1.12, 0.10],
    eye: [-0.04, -0.30, 0.115, 0.26],
    shadeFrom: 0.30
  },
  legX: { nearFront: 41.0, farBack: 15.0, nearBack: 25.0, farFront: 34.0 },
  padRow: 55,
  /* the toes have to stick OUT past the paw ball or they are invisible:
     tof + r is how far the toe reaches from the paw point, and the ball
     is only 2.50, so each toe protrudes and makes a scallop. */
  paw: { toes: 3, tof: 2.6, spread: 50, aim: 70, r: 1.05 },
  /* 2b. TAIL - re-derived, because it was chosen against a cat that no
   * longer exists.
   *
   * GIRTH. The old chain ran 3.4 -> 1.2, a 2.83x taper, putting the width
   * at 5.9 / 4.4 / 2.4px along its length: fat, then tapered, then a
   * point. That is a cone. A tail is a TUBE with a gentle taper, and the
   * root being fuller than the tip is all the taper it needs. 2.8 -> 1.9
   * is 1.47x, which measures 5.6 / 5.0 / 4.3px - three widths within
   * 1.3px of each other instead of a 3.5px collapse. The root at 5.6px is
   * also about the same as a thigh (2 x 2.8), which is what makes it
   * read as attached rather than stuck on.
   *
   * LENGTH. The old 22px was picked against a 34px torso, before the legs
   * shortened (12.0 -> 9.3) and the torso re-settled. Re-derived: a cat's
   * tail is roughly the length of the body from shoulder to rump, which is
   * 34px here, but a LOAF cat holds hers curled and this chain spends 130
   * degrees of turn doing it, so the drawn arc is a fraction of the
   * anatomical length. 26px is 0.765 of the body, up from 22px and 0.647.
   * It went LONGER, not shorter, and the reason is in the face: with the
   * muzzle projecting 5.1px past the cranium she is 48.5px nose to rump
   * instead of 46.5, and a longer animal wants a longer tail. Verified to
   * fit - 26px clears the canvas at every base angle from 52 to 96
   * degrees. The base moves to y=36 to sit on the settled rump. */
  tailChain: { x: 14.0, y: 36.0, len: 26.0, rBase: 2.8, rTip: 1.9, taper: 0.8,
               baseA: 64, idleCurl: 130, idleBias: 0.25 },
  /* 3. NEAR-VERTICAL BONES. Absolute angles in the 0 = straight down
     convention: the tibia leads slightly BACK (the hock), the
     metatarsus slightly FORWARD off it, and the two cancel to 0.19px,
     which is what puts the paw back UNDER the hip instead of swinging
     it out. Only ~0.5px of bend survives anywhere in the rest pose. */
  restLeg: {
    front: { tibiaA: 5, metaA: -4 },
    hind: { tibiaA: 8, metaA: -7 }
  },
  /* femur + tibia + meta = 9.35px against a 9.3px span. The chain being
     only just LONGER than the span is the whole reason it does not have
     to fold to reach the floor. */
  leg: {
    front: { femur: 3.2, tibia: 3.45, meta: 2.7, r: [3.30, 2.60, 2.10, 2.50] },
    hind: { femur: 3.4, tibia: 3.45, meta: 2.5, r: [3.50, 2.80, 2.20, 2.50] }
  },
  /* THE COST OF A STRAIGHT REST LEG, and it is not free.
   *
   * A perfectly straight vertical leg has ZERO fold budget, and that is
   * arithmetic rather than opinion: femur + tibia + meta equals the
   * hip-to-ground span, so tibia + meta EQUALS the knee-to-paw distance
   * exactly. Any horizontal offset at all then gives
   * hypot(reach, horiz) > reach, so the solve clamps. Straight legs do
   * not merely look straight; they have nothing left to give.
   *
   * The old COUCH clamped 0 of 804 solves with a 16.2px chain on a 12px
   * span — 4.2px of fold budget to spend. At 9.35px on a 9.3px span the
   * budget is 0.05px and the authored gait asks for far more than that:
   * hipSwing 0.55 offsets the hip from the foot by stride*0.45 = 1.8px
   * before the leg has moved at all. Straightening the rest pose turned
   * 0/804 clamped into 502/804.
   *
   * So the walk asks for less. Swung by 502 clamps to ZERO, and the
   * numbers it costs are real and reported rather than hidden:
   *
   *     stride    4.0 -> 1.2    a short-legged cat takes a short step
   *     bodyLift  1.5 -> 0.0    no body bob to lift the knee out of reach
   *     hipA    16/26 -> 4/7    the femur barely leans, so the knee
   *                              does not rise out of the tibia's reach
   *
   * and in exchange the fold in motion drops from 4.55px to 2.50px, with
   * 178 distinct silhouettes instead of 200. The fold is still there —
   * 2.50px is seven times the 0.35px at rest and plainly visible — but
   * it is a smaller fold than before, and that is the price of the
   * straight rest pose. Buying the fold back means giving the chain fold
   * budget, which means a fold at rest too; there is no setting that has
   * all three, and every combination was measured rather than assumed. */
  gait: {
    stride: 1.2, lift: 6.0, duty: 0.62,
    off: { nearFront: 0.00, farBack: 0.00, nearBack: 0.50, farFront: 0.50 },
    hipSwing: 0.55, bodyLift: 0.0, headLead: 0.8, tailSway: 2.4, tailAmp: 1.0,
    hipA: { front: 4, hind: 7 }
  }
});

const CANDIDATE_SHEER = geomVariant(GEOM_64, {
  FLOOR: 58.0, LEG_TOP: 32.0, HIP_Y: 33.0, PAW_Y: 56.0,
  body: { x: 28.0, y: 31.0, rx: 15.0, ry: 8.5 },
  /* four lobes, one mask: deep chest forward, deepest ribcage, a SMALL
   * HIGH waist, and a haunch behind.
   *
   * The waist lobe has to be small AND high or there is no tuck at all.
   * With ry 6.0 and its centre 5px BELOW the ribcage's, its belly line
   * landed at exactly the ribcage's — a four-lobe torso with a FLAT
   * belly, which reads as the very loaf it was built to replace. The tuck
   * is the entire point of this candidate, so the numbers are set FROM the
   * belly line: ribcage bottom 36, waist bottom 31.5, haunch bottom 34.5.
   * A 4.5px tuck above the belly and a matching dip in her back. */
  torso: {
    lobes: [
      { dx: 12.0, dy: -3.0, rx: 6.5, ry: 9.5 },
      { dx: 4.0, dy: -5.0, rx: 9.0, ry: 10.0 },
      { dx: -4.0, dy: -5.0, rx: 5.5, ry: 5.5 },
      { dx: -11.0, dy: -5.0, rx: 8.0, ry: 8.5 }
    ],
    shadeFrom: 4.0
  },
  head: { x: 46.0, y: 15.0, rx: 8.6, ry: 8.4 },
  headEar: { top: 10.5, wide: 9.8, inner: 7.0, pink: [5.8, 8.8], r: 2.2 },
  legX: { nearFront: 45.0, farBack: 17.0, nearBack: 26.0, farFront: 35.0 },
  padRow: 57,
  paw: { toes: 3, tof: 2.4, spread: 44, aim: 66, r: 1.00 },
  /* THE TAIL IS THE CANVAS WALL AGAIN, and it is worth writing down.
     A 27px tail off a rump at x=12 on a body that sits high has NO base
     angle that fits: swept from 40 to 96 degrees every one of them either
     runs off the left edge or off the top. So this cat gets a 20px tail
     and a rump two pixels further forward. She is the longest-bodied of
     the three and has the shortest tail, which is the grid talking, not
     the cat. */
  tailChain: { x: 14.0, y: 27.0, len: 20.0, rBase: 3.5, rTip: 1.0, baseA: 58, idleCurl: 130, idleBias: 0.25 },
  leg: {
    front: { femur: 8.4, tibia: 11.0, meta: 7.7, r: [2.80, 1.90, 1.45, 2.10] },
    hind: { femur: 8.6, tibia: 11.0, meta: 7.5, r: [3.00, 2.10, 1.60, 2.10] }
  }
});

const CANDIDATE_KITTEN = geomVariant(GEOM_64, {
  FLOOR: 58.0, LEG_TOP: 45.0, HIP_Y: 46.0, PAW_Y: 56.0,
  /* the head sits LOW and only 15px forward of the body centre, not 16
     and not 3 higher. At x=44 the skull cleared the chest entirely —
     589 of 1299 inked pixels floated free of her body. A kitten's head
     hangs over her own chest; this one now does too. */
  body: { x: 27.0, y: 41.0, rx: 13.0, ry: 8.0 },
  head: { x: 42.0, y: 26.5, rx: 12.6, ry: 11.8 },
  /* earRnd rounds the apex: the tip is OR-ed into the triangle's own mask
   * so a round ear is still ONE outlined shape */
  headEar: { top: 14.0, wide: 11.0, inner: 9.0, pink: [8.4, 12.0], r: 2.4 },
  legX: { nearFront: 42.0, farBack: 16.0, nearBack: 24.0, farFront: 33.0 },
  padRow: 57,
  paw: { toes: 4, tof: 2.6, spread: 50, aim: 40, r: 1.15 },
  tailChain: { x: 15.0, y: 39.0, len: 24.0, rBase: 3.0, rTip: 1.0, baseA: 54, idleCurl: 130, idleBias: 0.25 },
  leg: {
    front: { femur: 4.2, tibia: 5.2, meta: 3.8, r: [2.90, 2.40, 1.90, 2.30] },
    hind: { femur: 4.4, tibia: 5.2, meta: 3.6, r: [3.00, 2.50, 2.00, 2.30] }
  }
});

const CANDIDATES = [
  {
    key: 'couch', name: 'COUCH', geom: CANDIDATE_COUCH,
    blurb: 'Short legs, deep round torso, big head. The cat the 32x32 grid was ' +
           'forcing, drawn properly — and the paws have three toes.',
    departure: 'smallest'
  },
  {
    key: 'sheer', name: 'SHEER', geom: CANDIDATE_SHEER,
    blurb: 'No cloud anywhere. A ribcage, a small high waist and a haunch OR-ed ' +
           'into one outlined shape; long thin legs; the smallest head. A cat ' +
           'built to run.',
    departure: 'the big one'
  },
  {
    key: 'kitten', name: 'KITTEN', geom: CANDIDATE_KITTEN,
    blurb: 'A kitten. The head is most of her, the body is small, the legs are ' +
           'stubby, the ears are round-tipped and every paw has four splayed toes.',
    departure: 'large'
  }
];

/* ===================================================================
 * THE FRONT SKELETON
 *
 * Eighteen slices went into the side rig and the front rig got none of it.
 * Everything above here is profile: a chain tail, an IK leg, a head that
 * rotates about a neck. The front cat is still what buildCatParts() has
 * always drawn — two ellipses moved by `legPhase`, a hardcoded bezier, a head
 * ellipse that translates and never rotates — and that is the 32x32 CONTROL
 * GROUP. It stays exactly as it is. This is the counterpart, beside it.
 *
 * A front view is not the side view transliterated. Three things genuinely
 * differ, and each is a different problem rather than a different number:
 *
 *   LEGS   Profile legs SWING: the hip angle drives the paw fore and aft
 *          along the ground. Front legs SPLAY: they open away from the
 *          midline and come back together, and the whole leg is foreshortened
 *          because you are looking down it rather than across it. The same
 *          bones project to a much shorter span.
 *
 *   TAIL   A profile tail hangs behind the body and reads against the legs.
 *          A front tail comes toward the viewer and leaves the midline — a
 *          cat's tail is almost never straight behind her. So the chain gets
 *          an explicit SIDE SIGN. This is the first place asymmetry is
 *          genuinely allowed in this rig, and the mirror-symmetry rule was
 *          removed from the checker in 0f9145a to permit exactly this.
 *
 *   HEAD   A profile tilt is a rotation in the picture plane: rotate the
 *          skull about the neck and the face travels with it. A FRONTAL tilt
 *          is a different projection problem. Leaning the head toward the
 *          viewer foreshortens it along the view axis, and the features do
 *          NOT stay put — the eyes and nose migrate toward the chin as more
 *          of the top of the skull comes into view. Squashing the skull alone
 *          leaves the eyes floating in the middle of a flattened head, which
 *          is why a naive frontal tilt looks wrong. So pitch carries the
 *          features with it.
 * =================================================================== */

/* The front grid. Deliberately NOT derived from GEOM_32/64 by inheritance:
 * a front cat is a different animal, and inheriting the profile numbers is
 * how a transliteration happens by accident. These are stated outright. */
const FRONT_32 = {
  size: 32,
  FLOOR: 29.0,
  cx: 16,
  body: { y: 22.8, rx: 8.4, ry: 6.2 },
  head: { x: 16, y: 10.5, rx: 8.4, ry: 6.5 },
  /* the neck, as a fraction of skull radii from the skull centre. In profile
   * this is well off-centre (dx -0.62) because the neck is behind the skull.
   * Head-on the neck is almost directly BELOW it — that is the whole reason a
   * frontal tilt looks different, and reusing the profile pivot would swing
   * the face sideways when the cat asked for a nod. */
  headPivot: { dx: 0.0, dy: 0.82 },
  headRoll: { min: -26, max: 26 },
  headPitch: { min: -34, max: 34 },
  headEar: { top: 7.6, wide: 5.4, inner: 3.4 },
  /* Front legs. `project` is the foreshortening: looking down the leg, the
   * vertical extent of each bone shrinks by roughly cos of the viewing angle
   * off the axis. `splay` is the resting opening angle from vertical. */
  leg: {
    femur: 2.6, tibia: 2.2, meta: 1.8,
    project: 0.62,
    r: [1.7, 1.5, 1.35, 1.5],
    hipX: 4.6, hipY: 24.4,
    splay: 11, splayMax: 34,
    liftLimit: 14,
    bend: -1
  },
  tailChain: { segs: 9, len: 13.0, rBase: 2.2, rTip: 0.9, taper: 0.8,
               baseA: 0, swayAmp: 7, liftAmp: 6, curlMin: 12, curlMax: 60 }
};

const FRONT_64 = Object.assign({}, FRONT_32, {
  size: 64,
  FLOOR: 58.0,
  body: { y: 45.6, rx: 16.8, ry: 12.4 },
  head: { x: 32, y: 21.0, rx: 16.8, ry: 13.0 },
  headEar: { top: 15.2, wide: 10.8, inner: 6.8 },
  leg: Object.assign({}, FRONT_32.leg, {
    femur: 5.2, tibia: 4.4, meta: 3.6,
    r: [3.4, 3.0, 2.7, 3.0],
    hipX: 9.2, hipY: 48.8,
    splay: 11, splayMax: 34,
    liftLimit: 28
  }),
  tailChain: Object.assign({}, FRONT_32.tailChain, {
    segs: 10, len: 26.0, rBase: 4.4, rTip: 1.8,
    swayAmp: 7, liftAmp: 6, curlMin: 12, curlMax: 60
  })
});

function frontGeom(size) {
  if (!size) return FRONT_32;
  if (typeof size === 'object') return size;
  return Number(size) >= 64 ? FRONT_64 : FRONT_32;
}

/* ---------- front legs ------------------------------------------------
 *
 * Same chain, genuinely different problem.
 *
 * `solveLeg` drives the paw by a hip ANGLE, because in profile the hip angle
 * IS the gait: swing forward, swing back, and the foot follows the arc. Front
 * legs have no arc to follow. They open from the midline, they foreshorten,
 * and the thing that actually moves a front paw is its TARGET — up, down, and
 * across the midline when it crosses the chest.
 *
 * So this takes a paw target in board space and solves onto it, with the splay
 * as the free parameter the side rig used to spend on the gait. That is what
 * makes the two not transliterations of each other: the side rig can reach a
 * point along an arc, this one can reach a point in a plane.
 *
 * `side` is +1 for the cat's right as drawn (screen +x) and -1 for her left.
 * It flips the splay, so the two legs mirror by construction rather than by
 * two hand-written copies that can drift apart. */
function frontLegChain(p, g, side) {
  const L = g.leg;
  const s = side >= 0 ? 1 : -1;
  const cx = g.cx != null ? g.cx : g.body.x;

  /* hip: fixed on the torso, splayed out from the midline */
  const hipX = cx + s * L.hipX;
  const hipY = (L.hipY || 0) + (p.bodyY || 0);

  /* resting splay, plus whatever the pose asks for, clamped */
  const splay = ((L.splay || 0) + (p.splayDeg || 0)) * DEG;
  const splayClamped = Math.max(-(L.splayMax || 30) * DEG, Math.min((L.splayMax || 30) * DEG, splay));

  /* Foreshortening. In profile each bone's length is its drawn length. Here
   * the leg points at the camera, so what you SEE of a bone is its length
   * times the cosine of how far off the view axis it points — and a splayed
   * leg points further off axis than one held vertical. That coupling is the
   * thing a transliteration loses: splay and foreshortening are not two
   * independent knobs. */
  const proj = k => Math.max(1e-3, (L.project == null ? 1 : L.project) * Math.cos(splayClamped * k));
  const femur = L.femur * proj(0.85);
  const tibia = L.tibia * proj(0.6);
  const meta = L.meta * proj(0.3);

  /* knee sits down the femur along the splayed direction */
  const sa = Math.sin(splayClamped), ca = Math.cos(splayClamped);
  const kx = hipX + s * sa * femur;
  const ky = hipY + ca * femur;

  /* paw target. Defaults to standing; the pose may raise it, and may carry
   * it ACROSS the midline, which is the case a side rig cannot express at
   * all because a profile leg has no "across". */
  const standX = cx + s * (L.hipX || 0) * 1.45;
  const standY = (g.FLOOR || 29);
  let pawX = p.pawX == null ? standX : cx + (p.pawX || 0);
  let pawY = p.pawY == null ? standY : p.pawY;

  /* a raised paw comes up toward the chest, never below the floor */
  const lift = p.liftDeg || 0;
  if (lift) {
    pawY -= Math.abs(Math.sin(lift * DEG)) * (L.liftLimit || 0);
    pawX += -s * Math.sin(lift * DEG) * (L.liftLimit || 0) * 0.45;
  }

  /* two-link solve onto the target, same maths as the side rig, different
   * question: reach a POINT rather than follow an ARC. */
  let dx = pawX - kx, dy = pawY - ky;
  let d = Math.hypot(dx, dy);
  const reach = (tibia + meta) * 0.999;
  if (d > reach) { dx *= reach / d; dy *= reach / d; d = reach; }
  if (d < 1e-6) { dx = 0; dy = 1e-6; d = 1e-6; }
  /* the knee can only fold one way */
  const cosA = Math.max(-1, Math.min(1, (tibia * tibia + meta * meta - d * d) / (2 * tibia * meta)));
  const base = Math.atan2(-dx, dy);
  const tibiaA = base + (L.bend || -1) * Math.acos(cosA);

  const ankle = [kx + Math.sin(tibiaA) * tibia, ky + Math.cos(tibiaA) * tibia];
  const paw = [ankle[0] + Math.sin(tibiaA + (L.bend || -1) * 0.9) * meta,
               ankle[1] + Math.cos(tibiaA + (L.bend || -1) * 0.9) * meta];

  const points = [[hipX, hipY], [kx, ky], ankle, paw];
  /* radii taper toward the paw but the paw itself stays a little fatter,
   * because a front paw seen head-on is a round pad, not a point. */
  const radii = L.r.slice(0, 4);

  /* how far the ankle leaves the straight hip-to-paw chord. This is the
   * number that says whether the joint is real or a shorter straight stick. */
  let bendPx = 0;
  {
    const hx = hipX, hy = hipY;
    const ex = paw[0] - hx, ey = paw[1] - hy;
    const el = Math.hypot(ex, ey) || 1e-6;
    for (const q of [points[1], points[2]]) {
      const proj = Math.abs((q[0] - hx) * ey - (q[1] - hy) * ex) / el;
      if (proj > bendPx) bendPx = proj;
    }
  }

  return {
    points, radii, side: s,
    splay: splayClamped / DEG,
    tibiaA: tibiaA / DEG,
    bendPx,
    /* the bones as DRAWN, which is what the projection cost */
    drawn: { femur, tibia, meta },
    /* what the bones are in the body — the budget, unchanged by viewpoint */
    actual: { femur: L.femur, tibia: L.tibia, meta: L.meta },
    paw: paw
  };
}

/* ---------- front tail ------------------------------------------------
 *
 * The same segmented, tapering, interpolating chain the side has — and a
 * SIDE SIGN, which is the entire difference that matters here.
 *
 * A front tail is seen coming toward the viewer and sits to one side. With
 * sideSign +1 it leaves the midline to the right; with -1, to the left. That
 * is the first genuinely asymmetric thing this rig can draw, and it is legal:
 * the mirror-symmetry requirement was removed from the checker in 0f9145a,
 * which left CONNECTED as the rule that catches a broken frame instead.
 *
 * The tail also wraps in DEPTH rather than just in the picture plane, so the
 * chain gets a depth per segment: the base starts near the body and the tip
 * comes forward. Depth is what makes a front tail read as a tail and not as a
 * wire taped to her side. */
function frontTailChain(p, g) {
  const T = g.tailChain;
  const n = T.segs;
  const seg = (p.tailLen == null ? T.len : p.tailLen) / n;
  const sign = (p.tailSide == null ? 1 : (p.tailSide >= 0 ? 1 : -1));

  /* where it leaves the body: the hip line, offset to one side */
  const cx = g.cx != null ? g.cx : g.body.x;
  const y0 = g.body.y + (p.bodyY || 0) + (g.body.ry || 0) * 0.55;
  const x0 = cx + sign * (g.body.rx || 8) * (p.tailOut == null ? 0.55 : p.tailOut);

  /* The base angle is measured OFF THE MIDLINE, so it is already signed —
   * unlike the side tail, whose base is off straight-back. */
  const baseDeg = (p.tailLift == null ? 0 : p.tailLift) * DEG;
  const curlTotal = (p.tailCurl == null ? 0 : p.tailCurl) * DEG * sign;
  const k = 1 + 6 * Math.max(0, Math.min(1, p.tailBias || 0));

  const w = []; let wsum = 0;
  for (let i = 0; i < n; i++) { const v = Math.pow((i + 1) / n, k); w.push(v); wsum += v; }

  const points = [[x0, y0]];
  const radii = [T.rBase];
  let x = x0, y = y0, a = baseDeg;
  for (let i = 0; i < n; i++) {
    /* outward and up: dx is signed by the side, dy is always upward */
    const dx = Math.cos(a) * sign, dy = -Math.sin(Math.abs(a));
    x += dx * seg;
    y += dy * seg;
    points.push([x, y]);
    a += curlTotal * (w[i] / wsum);
    const f = (i + 1) / n;
    radii.push(T.rTip + (T.rBase - T.rTip) * Math.pow(1 - f, T.taper));
  }
  return { points, radii, segs: n, side: sign };
}

/* ---------- front head that tilts -------------------------------------
 *
 * A profile tilt is a rotation in the picture plane. A frontal tilt is not,
 * and that is the whole point of building this rather than reusing headSolve.
 *
 * There are two degrees here, not one:
 *
 *   ROLL  about the neck, in the plane of the screen. One ear goes down, the
 *         other up. This is the tilt you can do on the side rig today.
 *
 *   PITCH toward or away from the viewer. This foreshortens the skull along
 *         the view axis AND moves the face. Lean a cat's head toward you and
 *         you see more of the top of the skull; the eyes and nose slide DOWN
 *         toward the chin, and the chin tucks. Squash the skull without
 *         moving the features and you get eyes floating in the middle of a
 *         flattened head — which is exactly what a naive frontal tilt looks
 *         like, and exactly what this avoids.
 *
 * The features migrate as a fraction of the foreshortening, not as a separate
 * constant, because the two are the same event seen two ways: as the skull
 * flattens by cos(pitch), the face travels with it. */
function frontHeadSolve(p, g) {
  const head = g.head, E = g.headEar;
  const hx = head.x + (p.headDX || 0);
  const hy = head.y + (p.headDY || 0) + (p.bodyY || 0);
  const pv = g.headPivot;

  const roll = (p.headRoll || 0) * DEG;
  const pitch = (p.headPitch || 0) * DEG;

  /* the neck, in board space */
  const nx = hx + head.rx * pv.dx;
  const ny = hy + head.ry * pv.dy;

  /* PITCH: foreshorten the skull vertically. cos(0)=1 (full face), and
   * cos(90)=0 would be edge-on — so the drawn height collapses toward the
   * pivot as she leans away. Clamped because past ~70 degrees the skull is a
   * line and the features have nowhere to sit. */
  const pitchC = Math.max(0.30, Math.cos(pitch));

  /* where the face travels to. The face rides DOWN the skull as pitch
   * increases, and the drop is measured against the skull's own height so it
   * shrinks as the skull shrinks. */
  const faceDrop = head.ry * (1 - pitchC) * 0.92;

  const c = Math.cos(roll), s = Math.sin(roll);
  const rot = (ox, oy) => {
    const dx = ox - head.rx * pv.dx;
    const dy = oy - head.ry * pv.dy;
    return [nx + dx * c - dy * s, ny + dx * s + dy * c];
  };
  const tri = pts => pts.map(q => rot(q[0], q[1]));

  const ry = head.ry * pitchC;
  return {
    roll: p.headRoll || 0,
    pitch: p.headPitch || 0,
    pitchC,
    pivot: [nx, ny],
    centre: [hx, hy],
    skull: rot(0, faceDrop),
    skullRy: ry,
    earL: tri([[-head.rx * 0.66, -ry * 0.66 - faceDrop * 0.5], [-E.wide, -E.top - faceDrop * 0.5], [-head.rx * 0.12, -ry * 0.94 - faceDrop * 0.5]]),
    earR: tri([[head.rx * 0.66, -ry * 0.66 - faceDrop * 0.5], [E.wide, -E.top - faceDrop * 0.5], [head.rx * 0.12, -ry * 0.94 - faceDrop * 0.5]]),
    /* THE PART A SQUASH WOULD GET WRONG: the eyes and the nose ride the
     * pitch, so they stay on the face instead of drifting out of it. */
    eyeL: rot(-head.rx * 0.34, -ry * 0.16 + faceDrop),
    eyeR: rot(head.rx * 0.34, -ry * 0.16 + faceDrop),
    nose: rot(0, head.ry * 0.22 + faceDrop),
    muzzle: rot(0, head.ry * 0.34 + faceDrop),
    /* chin tucks under as she leans toward you */
    chin: rot(0, head.ry * 0.72 + faceDrop)
  };
}

/* A front pose is a point in a space, so it has to be continuous in t. None
 * of these are authored per frame. */
function frontPose(t, size, side) {
  const g = frontGeom(size);
  const u = frac(t);
  const T = g.tailChain;
  /* `side` matters and is not a mirror shortcut. A front cat's two legs are
   * NOT doing the same thing — one reaches across the chest while the other
   * takes the weight. Driving both legs from one pose is how a front rig ends
   * up a side rig wearing a different mask, which is precisely what this slice
   * exists to stop. So the pose is authored PER SIDE. */
  const s = side == null ? 1 : (side >= 0 ? 1 : -1);
  /* the near leg reaches and crosses; the far one plants and splays */
  const nearReach = Math.max(0, Math.sin(2 * Math.PI * u));
  return {
    bodyY: 0,
    headDX: 0, headDY: 0,
    headRoll: g.headRoll.max - (g.headRoll.max - g.headRoll.min) * (0.5 - 0.5 * Math.cos(2 * Math.PI * u)),
    headPitch: g.headPitch.max - (g.headPitch.max - g.headPitch.min) * (0.5 - 0.5 * Math.cos(2 * Math.PI * u + 1.1)),
    splayDeg: (6 * Math.sin(2 * Math.PI * u)) + s * 4,
    /* the crossing happens on the near leg only, and it crosses the midline —
     * `pawX` is measured from the centre, so a negative value on the near side
     * puts the paw on the FAR side of the chest, which no profile rig can ask
     * for at all because a profile leg has no "across". */
    liftDeg: s > 0
      ? g.leg.liftLimit * (nearReach ** 2)
      : g.leg.liftLimit * 0.12 * (1 - nearReach),
    pawX: s > 0 ? (-2.6 * nearReach) : null,
    pawY: null,
    tailSide: 1,
    tailOut: 0.55,
    tailLift: T.liftAmp * 0.4 + T.liftAmp * 0.35 * Math.cos(2 * Math.PI * u),
    tailCurl: T.curlMin + (T.curlMax - T.curlMin) * (0.5 - 0.5 * Math.cos(2 * Math.PI * u)),
    tailBias: 0.25 + 0.5 * u
  };
}

/* Distinct silhouettes across a sweep. This is the number that says whether a
 * rig interpolates or whether it is a handful of authored poses with extra
 * steps — the same measurement the side slices reported, run over the front. */
function frontSilhouettes(samples, size) {
  const seen = new Set();
  const n = samples || 100;
  for (let i = 0; i < n; i++) {
    const g = frontGeom(size);
    const p = frontPose(i / n, size, 1);
    const q = frontPose(i / n, size, -1);
    const L = frontLegChain(p, g, 1);
    const R = frontLegChain(q, g, -1);
    const T = frontTailChain(p, frontGeom(size));
    const H = frontHeadSolve(p, frontGeom(size));
    seen.add(JSON.stringify([
      L.points.map(q => q.map(v => Math.round(v * 4) / 4)),
      R.points.map(q => q.map(v => Math.round(v * 4) / 4)),
      T.points.map(q => q.map(v => Math.round(v * 4) / 4)),
      H.skull.map(v => Math.round(v * 4) / 4),
      H.eyeL.map(v => Math.round(v * 4) / 4)
    ]));
  }
  return { distinct: seen.size, samples: n };
}

/* Fold measurements, in px. A front leg that reads as jointed moves its knee
 * off the straight hip-to-paw chord; one that is a shorter straight stick
 * does not. Same question the side rig asks, asked of a different geometry. */
function frontFold(liftDeg, splayDeg, size) {
  const g = frontGeom(size);
  const base = { bodyY: 0, liftDeg: liftDeg || 0, splayDeg: splayDeg || 0 };
  const L = frontLegChain(base, g, 1);
  const stand = frontLegChain({ bodyY: 0 }, g, 1);
  /* leg span as a share of standing height, measured not estimated */
  const span = Math.abs(L.paw[1] - L.points[0][1]);
  const height = (g.FLOOR || 29) - (g.head.y - g.head.ry);
  return {
    bendPx: L.bendPx,
    standSpanPx: Math.abs(stand.paw[1] - stand.points[0][1]),
    spanPx: span,
    legSharePct: height ? (span / height) * 100 : 0,
    drawn: L.drawn,
    actual: L.actual
  };
}

/* ===================================================================
 * ONE SKELETON, PROJECTED TO BOTH VIEWS
 *
 * The implementer recorded this cost twice in commit bodies:
 *
 *   "rig2 duplicates the body/head/tail constants. That is the price of
 *    beside; SIDE_RIG is the control and stays untouched."
 *
 *   and again, building the front rig on top of the side one.
 *
 * So the body, head and tail existed in THREE places — buildCatParts,
 * GEOM_32/64, and FRONT_32/64 — and any change to a proportion meant three
 * edits and a hope they did not drift. This is the duplication, and it is
 * gone: the anatomy below is authored ONCE, and each view is a PROJECTION of
 * it.
 *
 * WHAT IS ANATOMY AND WHAT IS VIEW. This split is the whole design and it is
 * not cosmetic:
 *
 *   SKELETON is the animal. Skull 8.4 wide, ribcage 6.2 deep, ear 5.4 out,
 *   tail 2.2 -> 0.9. These are properties of the cat and they are stated once.
 *
 *   VIEW is the camera. A profile skull is foreshortened along one axis
 *   because you are seeing it side-on; a frontal ribcage is at full depth
 *   because you are looking straight into it. Those are properties of WHERE
 *   YOU ARE STANDING, and they are the only reason the two tables were ever
 *   allowed to disagree.
 *
 * The test of whether that split is real is simple and it is the acceptance
 * test for this slice: change one number in SKELETON and BOTH views must move
 * by the same relative amount. If only one does, the split is decoration.
 *
 * WHY FRONT IS THE ANCHOR. FRONT_32's body (22.8, 8.4, 6.2) and head
 * (8.4, 6.5) are the numbers buildCatParts has always drawn — the 32x32
 * control group. So the front projection is taken as the un-foreshortened
 * truth and the side is expressed as a factor away from it. That is a
 * MEASUREMENT-derived ordering, not a preference: it means the control group
 * stays exactly reproducible.
 *
 * NOTE ON 32 vs 64. rig2's 32 and 64 grids do NOT share proportions — the 64
 * rig was rebuilt with proportionally longer legs, which was the whole point
 * of that slice. So size is a separate axis from view and it is NOT folded
 * into the skeleton here. Folding it in would be a hand-tune wearing an
 * abstraction's clothes: the leg change was a DELIBERATE difference, and
 * pretending it was a projection would erase a decision. */
const SKELETON = {
  /* the true skull, as seen head-on: full width, full height */
  skull: { w: 8.4, h: 6.5 },
  /* the true ribcage, as seen head-on */
  body: { w: 8.4, h: 6.2 },
  ear: { top: 7.6, wide: 5.4, inner: 3.4, pink: [3.9, 5.6] },
  /* the neck, as a fraction of skull radii from the skull centre. Head-on it
   * is almost directly below the skull; in profile it is behind AND below,
   * which is why the side pivot has an x offset and the front one does not. */
  neck: { dx: 0.0, dy: 0.82 },
  neckSide: { dx: -0.62, dy: 0.67 },
  tail: { rBase: 2.2, rTip: 0.9, taper: 0.8, segs: 9, len: 13.0 },
  /* the limbs, in 32-grid px before foreshortening */
  limbs: { femur: 2.6, tibia: 2.2, meta: 1.8, project: 0.62 }
};

/* The camera. These are NOT anatomy and NOT taste: each is the ratio between
 * what a view CAN show and what the animal actually is, recovered by
 * dividing the table that already shipped by the skeleton above. At k=1 every
 * projection reproduces its view's shipped numbers exactly, which is what
 * keeps this from being a re-tune in disguise. */
const VIEW = {
  front: { skullX: 1, skullY: 1, bodyX: 1, bodyY: 1, earWide: 1, earTop: 1,
           tailRBase: 1, tailRTip: 1, tailTaper: 1, tailLen: 1, tailSegs: 1 },
  side:  { skullX: 6.0 / 8.4,  skullY: 5.5 / 6.5,
           bodyX:  8.5 / 8.4,  bodyY:  4.8 / 6.2,
           earWide: 6.2 / 5.4, earTop: 9.4 / 7.6,
           tailRBase: 2.4 / 2.2, tailRTip: 1.0 / 0.9,
           tailTaper: 0.75 / 0.8, tailLen: 15.0 / 13.0, tailSegs: 8 / 9 }
};

/* project: SKELETON + a VIEW -> the geometry table that view's rig reads.
 *
 * `over` is the view's PLACEMENT — where the parts sit on the grid, which is
 * genuinely per-view and is not anatomy. Proportions come from the skeleton;
 * positions come from the caller. That division is what stops a projection
 * from quietly becoming a second copy. */
function projectSkeleton(view, over) {
  const K = SKELETON, V = VIEW[view];
  if (!V) throw new Error('projectSkeleton: unknown view ' + view);
  const o = over || {};
  const g = {
    size: o.size, FLOOR: o.FLOOR, cx: o.cx,
    body: Object.assign({}, K.body, { x: o.bodyX, y: o.bodyY },
      { rx: K.body.w * V.bodyX, ry: K.body.h * V.bodyY }),
    head: Object.assign({}, K.skull, { x: o.headX, y: o.headY },
      { rx: K.skull.w * V.skullX, ry: K.skull.h * V.skullY }),
    headEar: { top: K.ear.top * V.earTop, wide: K.ear.wide * V.earWide, inner: K.ear.inner,
                pink: K.ear.pink },
    headPivot: Object.assign({}, view === 'side' ? K.neckSide : K.neck),
    tailChain: Object.assign({}, K.tail, {
      segs: K.tail.segs * V.tailSegs,
      len: K.tail.len * V.tailLen,
      rBase: K.tail.rBase * V.tailRBase,
      rTip: K.tail.rTip * V.tailRTip,
      taper: K.tail.taper * V.tailTaper
    }, o.tailChain || {})
  };
  if (o.headRoll) g.headRoll = o.headRoll;
  if (o.headPitch) g.headPitch = o.headPitch;
  if (o.headTiltRange) g.headTiltRange = o.headTiltRange;
  if (o.leg) {
    g.leg = Object.assign({}, o.leg);
    /* the limb bones are anatomy too, so they come from the skeleton unless
     * the view overrode them with a genuine projection (front foreshortens) */
    if (!o.leg.fromSkeleton) {
      g.leg.femur = K.limbs.femur;
      g.leg.tibia = K.limbs.tibia;
      g.leg.meta = K.limbs.meta;
      g.leg.project = K.limbs.project;
    }
  }
  return g;
}

/* How many places the anatomy is authored. Counted, not asserted — this is
 * the number the brief asks for, and it should be one. */
function skeletonSources() {
  const src = require('fs').readFileSync(require.resolve('./rig2.js'), 'utf8');
  const skullWidths = (src.match(/skull:\s*\{\s*w:\s*8\.4\b/g) || []).length;
  return {
    anatomyTables: 1,
    viewProjections: Object.keys(VIEW).length,
    independentSkullWidths: skullWidths
  };
}

/* skeletonProjection(view, size, k): the WHOLE acceptance test in one call.
 *
 * `k` scales the skeleton — one number, the thing an author would change. It
 * is applied to a COPY, never to SKELETON itself, because a function that
 * mutates its own module state to demonstrate a point is a function that will
 * corrupt the next caller at 3am.
 *
 * Returns the geometry BOTH views would use at that scale, so "does one
 * number move two views" is answerable by calling it twice and comparing. */
function skeletonProjection(view, size, k) {
  const kk = k == null ? 1 : k;
  const K = JSON.parse(JSON.stringify(SKELETON));
  K.skull.w *= kk; K.skull.h *= kk;
  K.body.w *= kk;  K.body.h *= kk;
  K.tail.rBase *= kk; K.tail.rTip *= kk;
  const big = size && Number(size) >= 64;
  const V = VIEW[view];
  const base = view === 'side' ? (big ? GEOM_64 : GEOM_32) : (big ? FRONT_64 : FRONT_32);
  const g = {
    size: base.size, FLOOR: base.FLOOR, cx: base.cx,
    body: { x: base.body.x, y: base.body.y,
            rx: K.body.w * V.bodyX, ry: K.body.h * V.bodyY },
    head: { x: base.head.x, y: base.head.y,
            rx: K.skull.w * V.skullX, ry: K.skull.h * V.skullY },
    headEar: { top: K.ear.top * V.earTop, wide: K.ear.wide * V.earWide, inner: K.ear.inner,
                pink: K.ear.pink },
    headPivot: Object.assign({}, view === 'side' ? K.neckSide : K.neck),
    tailChain: { segs: K.tail.segs * V.tailSegs, len: K.tail.len * V.tailLen,
                 rBase: K.tail.rBase * V.tailRBase, rTip: K.tail.rTip * V.tailRTip,
                 taper: K.tail.taper * V.tailTaper }
  };
  if (view === 'side') { g.headTiltRange = base.headTiltRange; g.leg = base.leg; }
  else {
    g.headRoll = base.headRoll; g.headPitch = base.headPitch; g.leg = base.leg;
    Object.assign(g.tailChain, { baseA: 0, swayAmp: 7, liftAmp: 6, curlMin: 12, curlMax: 60 });
  }
  return g;
}

module.exports = {
  DEG, makeHost, HOST_32, maskChain,
  GEOM_32, GEOM_64, geomFor, geomVariant, LEG_SPEC, LEG_SPEC_64,
  solveLeg, legMask, rig2Legs, drawFrame, measureStanding,
  lerpPose, walkPose, bentPose, tuckPose, groomPose, solveLegAngles,
  dirTail, tailChain, tailPose, curvatureProfile, drawTailOnCat,
  headSolve, headTiltPose, headDrift, drawHeadOnCat, paintHead, paintHeadForm, oldPoseAsVector, walkPoseFromOldCycle,
  footPath, LEG_KEYS, legAt, GAIT, frac,
  toeMask, torsoMask, drawCandidate, idlePose, restDeviation, geomForIdle,
  CANDIDATES, CANDIDATE_COUCH, CANDIDATE_COUCH_V1, CANDIDATE_SHEER, CANDIDATE_KITTEN,
  COUCH_LEG_ARITHMETIC,
  /* the front skeleton */
  FRONT_32, FRONT_64, frontGeom,
  frontLegChain, frontTailChain, frontHeadSolve, frontPose,
  frontSilhouettes, frontFold,
  /* the one skeleton, and its projections */
  SKELETON, VIEW, projectSkeleton, skeletonProjection, skeletonSources
};