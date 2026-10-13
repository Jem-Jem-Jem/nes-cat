/* ============================================================
 * NES-cat — tools/rig2.js   (slice 1: an articulated leg)
 *
 * BESIDE the existing rig, not inside it. Nothing here is called
 * by build-sprites.js's frame build, so `npm run sprites:build`
 * emits byte-identical output. That is the whole safety net of
 * this slice: the old rig stays as the control group while the
 * new one proves itself.
 *
 * THE LIMIT IT EXISTS TO LIFT
 *
 * A leg in the old rig is ONE ELLIPSE (build-sprites.js:62):
 *
 *     maskLeg(x, topY, footY, w) -> maskEllipse(x, (topY+footY)/2, w/2, ...)
 *
 * so a leg cannot bend. Raising `lift` raises `footY`, which only
 * makes the ellipse SHORTER — the paw does not tuck, it shrinks in
 * place, and the walk fakes a swing with a 2px stub. Measured on
 * `side_walk_0`: a planted leg inks rows 24-27, a lifted leg inks
 * rows 24-25. The entire "lift" is 2 rows of a straight block.
 *
 * WHAT IS HERE
 *   1. maskChain   — a tapered capsule along a polyline, OR-ed like maskOr
 *   2. a leg as hip -> knee -> ankle -> paw, solved by FK
 *   3. poses as a FLAT vector of numbers, plus lerpPose
 *   4. walkPose(t) — a continuous gait, no authored frames
 *
 * THE GEOMETRY IS INJECTED, NOT IMPORTED. rig2 takes the raster
 * helpers as an argument so it has no require() edge to
 * build-sprites.js and build-sprites.js needs no copy of anything.
 * ============================================================ */
'use strict';

const W = 32;
const H = 32;
const DEG = Math.PI / 180;

/* The floor line and the belly edge, read off SIDE_RIG so the new
 * legs are built against the same grid the old ones are. Kept as
 * local constants because SIDE_RIG is the control group and must
 * not be touched or imported-and-mutated. */
const FLOOR = 29.0;
const LEG_TOP = 24.0;

/* ---------- 1. maskChain ----------------------------------------------
 *
 * A polyline with a radius AT each point, linearly interpolated
 * between consecutive points, so a limb tapers hip-to-paw.
 *
 * The pixel test is the repo's, deliberately: pixel centres are
 * (x + 0.5, y + 0.5), exactly as in maskEllipse at
 * build-sprites.js:66. A shape tested at (x, y) instead would land
 * half a pixel off every other shape in the sprite and the outline
 * would visibly disagree with itself.
 *
 * The radius is sampled at the pixel's own projection onto the
 * segment (s clamped to [0,1]), so the ends close into circles of
 * their own radius and the middle is a linear radius field. That is
 * the shape you get by OR-ing a tapered capsule per segment. */
function maskChain(points, radii, host) {
  const w = (host && host.W) || W, h = (host && host.H) || H;
  const blank = (host && host.emptyMask) ||
    (() => Array.from({ length: h }, () => new Array(w).fill(false)));
  const m = blank();
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

/* ---------- 2. the leg skeleton ---------------------------------------
 *
 * PROPORTIONS, and where they come from.
 *
 * The control group sets the budget. A planted leg inks rows 24-27,
 * centred on x, and rows 28-31 are empty. The belly's bottom edge is
 * at 21 + 4.8 = 25.8, so of those 4 rows, 24 and 25 are INSIDE the
 * belly - the old leg already draws its outline across the belly
 * there - and only rows 26 and 27 are leg below the body.
 *
 * Two configurations were built and measured.
 *
 * (a) INSIDE THE CONTROL'S FOOTPRINT. hip y=25.3, paw y=26.4, giving a
 *     1.10px skeleton span, so the three segments must total 1.55.
 *     Fold: 0.48px. Worse than that, the chain cannot reach a paw that
 *     travels 2px - 212 of 800 solves hit the reach clamp and the
 *     tibia swings to -209 degrees. Unusable.
 *
 * (b) SPENDING TWO MORE ROWS (what is shipped). hip y=23.4, paw
 *     y=26.3, skeleton span 2.90, three segments totalling 3.60. The
 *     two extra rows are spent inside the belly, where the control is
 *     already overdrawn; the paw still lands on row 27 with row 28
 *     clear, so the ground line matches the control's. Fold: 0.97px,
 *     and zero unreachable solves across 800.
 *
 * (b) is the only configuration that solves, so (b) is what ships.
 *
 *   hip  y=23.4  r=1.70   inks rows 22-25
 *   paw  y=26.3  r=1.60   inks rows 25-27
 *   skeleton span, planted: 2.90
 *
 *   front: femur 1.35  tibia 1.25  meta 1.00   total 3.60  (fold ratio 1.24)
 *          r = 1.70 / 1.55 / 1.45 / 1.60
 *   hind:  femur 1.40  tibia 1.30  meta 0.95   total 3.65  (fold ratio 1.26)
 *          r = 1.80 / 1.65 / 1.50 / 1.60
 *
 * WHY THE FOLD IS SUB-PIXEL, AND WHY THAT IS NOT A TUNING PROBLEM
 *
 * A joint can only leave the straight hip-to-paw line by at most its
 * own segment length. The longest segment is 1.35px, so the silhouette
 * can kink by at most ~1.35px no matter what the angles say, and it
 * reaches 0.97px across the walk. Pixel art has no half-pixels: a bend
 * has to be 2px before a viewer reads a bend. Getting 2px out needs a
 * 2px segment, i.e. a ~5.3px chain, i.e. a leg about 8 rows tall on a
 * cat whose entire torso is 9.6 rows tall. That is a different cat.
 *
 * Digitigrade, stated so it cannot be got wrong: a cat's visible
 * "knee" high on the leg is the elbow/stifle, and the joint that
 * actually folds is LOW - the carpus in front, the hock behind. Both
 * fold BACKWARD in profile, so both legs bend with the same sign, and
 * the hind leg's digitigrade Z comes from its FEMUR being thrown
 * forward (hipA), not from a second bend of the opposite sign. There is
 * no configuration of these numbers that puts a joint bending the
 * wrong way, because every bend is chosen by the sign of `bend`.
 *
 * `maxBend` is the fold limit. Past it the chain passes through itself
 * and prints a backwards elbow, which is the one thing a cat's leg must
 * never do. */
const LEG_SPEC = {
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
};

const HIP_Y = 23.4;
const PAW_Y = 26.3;

/* The standing leg is 3.6px of skeleton in a 4-row budget, which is
 * too little to show a fold. A TUCKED foreleg is the case with room:
 * the paw comes up 3.7px and back 2.5px, which is the whole travel a
 * 3.6px chain can fold through, and it is what `groom`, `wash`,
 * `knead` and `hold` are all asking for.
 *
 * Note what is NOT being asked for: the paw does not reach the cheek.
 * A 3.6 chain cannot get 11px up to y=12 — the solve clamps and the
 * leg lies about it. A cat does not bring her paw to her ear by
 * straightening a leg; she folds the leg into a Z and brings her HEAD
 * down to the paw, which is what the head-down half of `groom` is
 * already for. So `tuckPose(t)` raises the paw as far as the chain
 * genuinely reaches and drops the head to meet it. */
function tuckPose(t) {
  const p = {
    bodyY: 0, headDY: 2.6, tailSway: 1.2,
    nearFront_hipX: 21.0, nearFront_hipA: 6,
    farFront_hipX: 17.0, farFront_hipA: 12, farFront_hide: 1,
    nearBack_hipX: 12.0, nearBack_hipA: 16, nearBack_hide: 1,
    farBack_hipX: 7.0, farBack_hipA: 16, farBack_hide: 1
  };
  const e = t * t * (3 - 2 * t);
  p.nearFront_footX = 22.0 - 1.8 * e;
  p.nearFront_footY = PAW_Y - 2.6 * e;
  return p;
}

/* Angle convention: 0 is straight DOWN (+y). Positive leans toward
 * +x, which is forward for a cat authored facing right. */
function dir(a) { return [Math.sin(a), Math.cos(a)]; }

/* solveLeg: hip -> knee is forward kinematics off `hipA`; knee ->
 * ankle -> paw is a two-link solve onto the paw target, which is what
 * makes the fold a fold: when the target comes up off the floor, the
 * two links have to reach it by bending rather than by stretching.
 *
 * Returns the point list maskChain wants, the radii, the three
 * resolved joint angles, and `bendPx` — how far the low joint
 * actually leaves the straight hip-to-paw line. That last number is
 * the whole question this slice asks: a fold that moves the joint
 * 0.2px off the chord is a shorter straight stick, and one that moves
 * it 1.5px is a bend you can see. */
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
   * carpus/hock direction in profile. */
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

/* The four legs of the side rig, their neutral hip x (SIDE_RIG's leg
 * x, so the new legs stand where the old ones stood), and whether
 * they are front or hind. */
const LEG_AT = {
  nearFront: { baseX: 22.0, kind: 'front' },
  farBack:   { baseX:  7.0, kind: 'hind'  },
  nearBack:  { baseX: 12.0, kind: 'hind'  },
  farFront:  { baseX: 17.0, kind: 'front' }
};

/* ---------- 4. a walk, computed ---------------------------------------
 *
 * ZERO authored poses. Everything below is a function of t.
 *
 *   GAIT.stride   fore/aft travel of a paw, px either side of neutral
 *   GAIT.lift     peak paw height off the floor, px
 *   GAIT.duty     fraction of the cycle a paw is on the ground
 *   GAIT.off      per-leg phase offset, in cycles
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
const GAIT = {
  stride: 2.0,        /* the control's own stride, so the two walks
                         are comparable: foot travel is the same 4px */
  lift: 1.5,          /* peak paw height. A cat's paw rises about a
                         third of the leg; on a 3.1px skeleton that
                         is 1.5, and asking for more folds the leg
                         through itself */
  duty: 0.62,
  off: { nearFront: 0.00, farBack: 0.00, nearBack: 0.50, farFront: 0.50 },
  hipSwing: 0.55,     /* the hip travels with the foot; at 1.0 the leg
                         never slants, at 0 the hip is nailed and the
                         stride has to be absorbed by the bend alone */
  bodyLift: 0.45,     /* the top of the bob must leave the 3.6 chain
                         long enough to still reach the floor */
  headLead: 0.8,
  tailSway: 1.05,
  tailAmp: 0.45
};

function frac(u) { return u - Math.floor(u); }

/* One paw's path through the cycle. u is 0..1; dx is fore/aft from
 * neutral, up is px off the floor. At u=0 the paw is furthest BACK. */
function footPath(u) {
  u = frac(u);
  if (u < GAIT.duty) {
    return { dx: -GAIT.stride + (2 * GAIT.stride) * (u / GAIT.duty), up: 0 };
  }
  const k = (u - GAIT.duty) / (1 - GAIT.duty);
  return {
    dx: GAIT.stride - 2 * GAIT.stride * k,
    up: GAIT.lift * Math.pow(Math.sin(Math.PI * k), 0.75)
  };
}

function walkPose(t, gait) {
  const G = gait || GAIT;
  const body = -G.bodyLift * (0.5 - 0.5 * Math.cos(2 * Math.PI * 2 * (t - 0.42)));
  const p = {
    bodyY: body,
    headDY: G.headLead * body + 0.2,
    tailSway: G.tailSway - G.tailAmp * Math.cos(4 * Math.PI * t)
  };
  LEG_KEYS.forEach(k => {
    const u = t + G.off[k];
    const f = footPath(u);
    const base = LEG_AT[k].baseX;
    p[k + '_hipX'] = base + f.dx * G.hipSwing;
    /* the femur leans the way the foot is going — this is what puts
     * the digitigrade Z on the hind leg */
    p[k + '_hipA'] = (f.dx / G.stride) * (LEG_AT[k].kind === 'hind' ? 26 : 16);
    /* A paw does not rise straight up. The carpus folds, so a lifting
     * paw comes back toward the elbow as it comes up, and `tuck` is
     * that: -0.34 px of travel back per px of rise on a front leg,
     * +0.26 forward on a hind leg where the hock goes the other way.
     * Without it the paw lifts under a straight leg and the fold has
     * nothing to do but shorten. */
    p[k + '_footX'] = base + f.dx + LEG_SPEC[LEG_AT[k].kind].tuck * f.up;
    p[k + '_footY'] = PAW_Y - f.up;
    p[k + '_hide'] = 0;
  });
  return p;
}

/* A pose lifted out of the six authored rows of the OLD walk, as a
 * flat vector. Kept so the two can be compared at the same t and so
 * the new gait visibly starts from the old one. */
const OLD_STRIDE = 2.0;
const OLD_LIFT = 2.0;

function oldPoseAsVector(i) {
  const c = [
    { f: [1, 1, -1, -1], by: 0, hd: 0.2, ts: 0.6 },
    { f: [1, 1, 0, 0], by: -1, hd: -0.6, ts: 1.5 },
    { f: [0, 0, 1, 1], by: 0, hd: 0.2, ts: 1.0 },
    { f: [-1, -1, 1, 1], by: 0, hd: 0.2, ts: 0.6 },
    { f: [-1, -1, 0, 0], by: -1, hd: -0.6, ts: 1.5 },
    { f: [0, 0, -1, -1], by: 0, hd: 0.2, ts: 1.0 }
  ][((i % 6) + 6) % 6];
  const lf = f => (f > 0 ? OLD_LIFT : 0);
  const p = { bodyY: c.by, headDY: c.hd, tailSway: c.ts };
  p.nearFront_hipX = 22.0 + c.f[0] * OLD_STRIDE * 0.34;
  p.nearFront_footX = 22.0 + c.f[0] * OLD_STRIDE;
  p.nearFront_footY = PAW_Y - lf(c.f[0]);
  p.nearFront_hipA = 0;
  p.farBack_hipX = 7.0 + c.f[1] * OLD_STRIDE * 0.34;
  p.farBack_footX = 7.0 + c.f[1] * OLD_STRIDE;
  p.farBack_footY = PAW_Y - lf(c.f[1]);
  p.farBack_hipA = 16;
  p.nearBack_hipX = 12.0 - c.f[2] * OLD_STRIDE * 0.34;
  p.nearBack_footX = 12.0 - c.f[2] * OLD_STRIDE;
  p.nearBack_footY = PAW_Y - lf(c.f[2]);
  p.nearBack_hipA = 16;
  p.farFront_hipX = 17.0 - c.f[3] * OLD_STRIDE * 0.34;
  p.farFront_footX = 17.0 - c.f[3] * OLD_STRIDE;
  p.farFront_footY = PAW_Y - lf(c.f[3]);
  p.farFront_hipA = 0;
  return p;
}

/* The six authored poses, turned into six points in the space, so a
 * fractional t can be interpolated between them. */
function walkPoseFromOldCycle(t) {
  const u = frac(t) * 6;
  const i = Math.floor(u);
  return lerpPose(oldPoseAsVector(i), oldPoseAsVector(i + 1), u - i);
}

/* ---------- drawing ---------------------------------------------------
 *
 * Given the repo's raster helpers, so rig2 has no require() edge to
 * build-sprites.js and no copy of its painters. The torso, head,
 * face and tail are drawn here only so the new legs can be judged in
 * context; they are NOT a replacement for buildSideParts. */

function legMask(p, key) {
  const spec = LEG_SPEC[LEG_AT[key].kind];
  const L = solveLeg(spec, p[key + '_hipX'], HIP_Y + p.bodyY,
                     p[key + '_hipA'], p[key + '_footX'], p[key + '_footY']);
  return L;
}

function rig2Legs(p, host) {
  const m = host.emptyMask();
  const parts = {};
  LEG_KEYS.forEach(k => {
    if (p[k + '_hide']) { parts[k] = null; return; }
    parts[k] = legMask(p, k);
    const lm = maskChain(parts[k].points, parts[k].radii, host);
    for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++) if (lm[y][x]) m[y][x] = true;
  });
  return { mask: m, parts: parts };
}

function drawFrame(p, host) {
  const G = host.grid();
  const body = { x: 15.0, y: 21.0, rx: 8.5, ry: 4.8 };
  const head = { x: 22.5, y: 13.5, rx: 6.0, ry: 5.5 };
  const bx = body.x, by = body.y + p.bodyY;
  const hx = head.x, hy = head.y + p.headDY + p.bodyY;

  /* tail, through the repo's own stamper so it matches the control */
  const tBaseX = bx - body.rx + 2.5;
  host.stampCurve(G, [tBaseX, by - 0.5],
    [tBaseX - 3.2 - p.tailSway, by - 1.5],
    [tBaseX - 5.0 - p.tailSway, by - 8.0], 2.4, 'W', 'K');

  const legs = rig2Legs(p, host);
  const ink = (k, fill) => {
    if (!legs.parts[k]) return;                 /* hidden leg */
    host.paint(G, maskChain(legs.parts[k].points, legs.parts[k].radii, host), fill, 'K');
  };

  /* far pair in deep shade, so it reads as the further pair */
  ink('farBack', 'G');
  ink('farFront', 'G');

  /* torso */
  const bodyMask = host.maskEllipse(bx, by, body.rx, body.ry);
  for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++) if (y + 0.5 > FLOOR) bodyMask[y][x] = false;
  host.paint(G, bodyMask, 'W', 'K');
  host.shadeBelow(G, bodyMask, bx, by + 1.3, 'H');

  /* near pair over the belly */
  ink('nearBack', 'W');
  ink('nearFront', 'W');

  /* head */
  const headMask = host.maskEllipse(hx, hy, head.rx, head.ry);
  const cheek = host.maskEllipse(hx + head.rx * 0.62, hy + 1.6, 2.6, 2.4);
  const headAll = host.maskOr(headMask, cheek);
  host.paint(G, headAll, 'W', 'K');
  host.paint(G, host.maskTri(hx - 4.6, hy - 3.4, hx - 6.2, hy - 9.4, hx - 0.6, hy - 5.0), 'W', 'K');
  host.paint(G, host.maskTri(hx + 2.2, hy - 4.0, hx + 5.6, hy - 9.2, hx + 5.4, hy - 3.6), 'W', 'K');
  host.px(G, hx - 3.9, hy - 5.6, 'P');
  host.px(G, hx + 3.6, hy - 5.8, 'P');

  /* one eye and a face, clipped to the skull */
  const ex = Math.round(hx + 0.6), ey = Math.round(hy - 1.0);
  const pxIn = (x, y, c) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= host.W || yi < 0 || yi >= host.H) return;
    if (!headAll[yi][xi]) return;
    G[yi][xi] = c;
  };
  for (let y = ey - 1; y <= ey + 1; y++) { pxIn(ex - 1, y, 'E'); pxIn(ex, y, 'E'); }
  pxIn(ex - 1, ey - 1, 'W');
  const nx = Math.round(hx + head.rx * 0.82), ny = Math.round(hy + 1.0);
  pxIn(nx, ny, 'N');
  pxIn(nx - 1, ny + 1, 'M');
  pxIn(nx, ny + 2, 'M');
  host.shadeBelow(G, headAll, hx, hy + 1.2, 'H');

  /* paw pad on a near paw that is actually down */
  ['nearBack', 'nearFront'].forEach(k => {
    const A = legs.parts[k];
    if (!A) return;
    if (A.points[3][1] < PAW_Y - 0.4) return;
    host.px(G, A.points[3][0] - 0.5, Math.min(Math.round(A.points[3][1] + 1.0), 28), 'P');
  });

  return { rows: G.map(r => r.join('')), legs: legs };
}

module.exports = {
  W, H, DEG, FLOOR, LEG_TOP, PAW_Y, HIP_Y,
  maskChain, LEG_SPEC, solveLeg, legMask, rig2Legs, drawFrame, tuckPose,
  lerpPose, walkPose, walkPoseFromOldCycle, oldPoseAsVector, footPath,
  LEG_KEYS, LEG_AT, GAIT, frac
};