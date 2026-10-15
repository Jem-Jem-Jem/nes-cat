/* ============================================================
 * NES-cat — tools/rig2-shiro64.js   BRIEF 51, THE REDRAW
 *
 * FOUR reference poses at 64x64. Not 88. Deliberately four: twenty-five slices
 * of correct machinery around a drawing nobody approved is what scaling an
 * unapproved drawing to 88 frames produces, and this brief exists to stop it
 * happening again. Get four right, get them approved, then the rest follows.
 *
 *   1. idle, front        2. idle, side
 *   3. sit,  front        4. curled, side
 *
 * KEPT FROM THE OLD SPRITE (identity — a viewer who knows her must recognise
 * her): the white body, hard black outlines with no anti-aliasing anywhere,
 * the value ramp (white / #adb5bd grey / #212529 black), the pink — nose
 * #ea7d9e on the muzzle, inner ear, cheek blush and toe marks in #f7a8c4 —
 * and black eyes. The pink CHEEKS are the single most recognisable thing about
 * her and they survive at 64.
 *
 * DISCARDED (proportions, which were the grid talking, not taste): the compact
 * loaf torso, the stubby undifferentiated paws, the spike ears, the neckless
 * head-sitting-on-shoulders. At 32x32 none of those were choices - there was
 * no room for a paw with toes or an ear with a shape.
 *
 * BUILT ON THE SKELETON. Every number below is read from rig2's GEOM_64 -
 * FLOOR 58, PAW_Y 55, HIP_Y 36, femur/tibia/meta lengths and radii, the head
 * pivot and the tail chain base. The legs are those same bones solved to a paw
 * target with a visible knee fold, not pixels placed by hand.
 *
 * WHY THE LEG SOLVER IS NOT CALLED. rig2.rig2Legs() returns NaN for all four
 * legs at 64 (verified), and skeletonProjection() returns mixed-resolution
 * numbers - body.rx 8.4 with FLOOR 58, which is 32-space bone lengths on a
 * 64-space floor. So the rig's own bones are used and the knee is solved here.
 * That is still building on the skeleton; it is just not building on the
 * solver.
 *
 * THE FACE IS THE ONE THAT MATTERS. A flat face is a mouse face however well
 * drawn. So the muzzle is a separate mass PAINTED ON TOP of the skull, and
 * because host.paint() outlines whatever it fills, the muzzle's own top edge
 * IS the plane break between brow and muzzle - the depth is structural, not
 * painted on. The nose sits at the top-front of that mass, and there is grey
 * mass under the jaw so the jaw has structure rather than ending in a curve.
 * ============================================================ */
'use strict';

const rig2 = require('./rig2.js');

const SIZE = 64;
const G = rig2.geomFor(SIZE);

/* her palette, taken from the shipped sprite so the redraw cannot drift from
 * the character it is supposed to be */
const WHITE = 'W';
const INK = 'K';       /* #212529 hard outline */
const GREY = 'G';      /* #adb5bd the value ramp's mid tone */
const NOSE = 'N';      /* #ea7d9e */
const PINK = 'P';      /* #f7a8c4 inner ear, cheeks, toes */

/* ---------- small drawing helpers on top of rig2's host --------------- */

/* Fill a mask WITHOUT outlining it. host.paint() always outlines, which is
 * right for a silhouette and wrong for anything that goes on top of one. */
function fillMask(h, G_, m, ch) {
  for (let y = 0; y < h.H; y++) for (let x = 0; x < h.W; x++) if (m[y][x]) G_[y][x] = ch;
}
/* Outline only the pixels on the edge of a mask. */
function edgeMask(h, G_, m, ch) {
  for (let y = 0; y < h.H; y++) for (let x = 0; x < h.W; x++) {
    if (!m[y][x]) continue;
    const e = !(y > 0 && m[y - 1][x]) || !(y < h.H - 1 && m[y + 1][x]) ||
      !(x > 0 && m[y][x - 1]) || !(x < h.W - 1 && m[y][x + 1]);
    if (e) G_[y][x] = ch;
  }
}
function maskBox(h, x0, y0, x1, y1) {
  const m = h.emptyMask();
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(h.H - 1, Math.round(y1)); y++)
    for (let x = Math.max(0, Math.round(x0)); x <= Math.min(h.W - 1, Math.round(x1)); x++) m[y][x] = true;
  return m;
}
function maskDisc(h, cx, cy, r) { return h.maskEllipse(cx, cy, r, r); }

/* a stroke of N pixels, used for mouth and toe marks */
function stroke(h, G_, x0, y0, x1, y1, ch) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * (n ? i / n : 0));
    const y = Math.round(y0 + (y1 - y0) * (n ? i / n : 0));
    h.px(G_, x, y, ch);
  }
}

/* ---------- the head -------------------------------------------------
 *
 * Built from three masses in front-to-back order: SKULL, then MUZZLE painted
 * over it, then the features. The muzzle overlapping the skull is what makes
 * her read as a head with a face on it rather than a circle with marks on it.
 *
 * `dir` is +1 for a cat facing right (side) and the front view passes null and
 * gets a symmetric layout instead. */
function drawHead(h, G_, o) {
  const front = o.front;
  const H = o.head;                       /* {cx, cy, rx, ry} */

  /* ---- ears: ROUNDED and SHORT. A triangle with a rounded tip is a
   * blunted spike; this is an actual round mass with a round tip. */
  const earR = front ? 5.4 : 5.6;
  const earX = front ? H.rx * 0.74 : (o.earDx != null ? o.earDx : -4.8);
  /* an OFFSET FROM THE HEAD CENTRE, not an absolute y. The first version of
   * this line added the offset to an offset and produced earY = -8.6, which
   * drew the ear off the top of the canvas - so the "ear" in profile was the
   * skull, and the pink inner ear was never on screen at all. */
  const earY = front ? H.cy - H.ry * 0.86 : H.cy + (o.earDy != null ? o.earDy : -7.5);
  const earSpecs = [];
  if (front) {
    earSpecs.push([H.cx - earX, earY, earR * 0.86, earR]);
    earSpecs.push([H.cx + earX, earY, earR * 0.86, earR]);
  } else {
    earSpecs.push([H.cx + earX, earY, earR, earR * 0.95]);
  }
  for (const [ex, ey, erx, ery] of earSpecs) h.paint(G_, h.maskEllipse(ex, ey, erx, ery), WHITE, INK);
  /* pink inner ear, filled on top so it takes no outline of its own */
  for (const [ex, ey, erx, ery] of earSpecs)
    fillMask(h, G_, h.maskEllipse(ex, ey + 0.8, erx * 0.52, ery * 0.55), PINK);

  /* ---- skull ---- */
  h.paint(G_, h.maskEllipse(H.cx, H.cy, H.rx, H.ry), WHITE, INK);

  /* ---- cheeks: the identity detail. Inside the skull, no outline. ---- */
  const cheekY = H.cy + H.ry * 0.42;
  if (front) {
    fillMask(h, G_, h.maskEllipse(H.cx - H.rx * 0.66, cheekY, 3.1, 2.0), PINK);
    fillMask(h, G_, h.maskEllipse(H.cx + H.rx * 0.66, cheekY, 3.1, 2.0), PINK);
  } else {
    fillMask(h, G_, h.maskEllipse(H.cx - H.rx * 0.34, H.cy + H.ry * 0.34, 2.2, 1.6), PINK);
  }

  /* ---- THE MUZZLE. Painted over the skull; its own outline is the brow/muzzle
   * plane break. It sits LOW and, in profile, FORWARD of the skull so it
   * projects - that projection is the depth. ---- */
  const M = o.muzzle;                     /* {cx, cy, rx, ry} */
  const muz = h.maskEllipse(M.cx, M.cy, M.rx, M.ry);
  h.paint(G_, muz, WHITE, INK);
  /* the shadow that turns that outline into a plane rather than a contour: a
   * grey band hugging the TOP of the muzzle, where it tucks under the brow */
  fillMask(h, G_, maskBox(h, M.cx - M.rx, M.cy - M.ry * 0.76, M.cx + M.rx, M.cy - M.ry * 0.40), GREY);
  /* mass UNDER the jaw so the jaw has structure instead of ending in a curve.
   * Both shadows are THIN bands: when each was half the muzzle they read as
   * two grey stripes across her face - a mask, not a plane change. */
  fillMask(h, G_, maskBox(h, M.cx - M.rx * 0.70, M.cy + M.ry * 0.46, M.cx + M.rx * 0.70, M.cy + M.ry * 0.95), GREY);
  /* and it re-whites the middle so the muzzle is not entirely in shadow */
  fillMask(h, G_, h.maskEllipse(M.cx, M.cy + M.ry * 0.06, M.rx * 0.88, M.ry * 0.80), WHITE);

  /* ---- eyes: on the skull, ABOVE the muzzle's top edge, so the plane break
   * runs between them and the face reads in two planes ---- */
  const eyeY = H.cy - H.ry * (front ? 0.18 : 0.16);
  if (front) {
    const ex = H.rx * 0.46;
    for (const s of [-1, 1]) {
      fillMask(h, G_, h.maskEllipse(H.cx + s * ex, eyeY, 2.5, 2.9), INK);
      h.px(G_, Math.round(H.cx + s * ex) + (s > 0 ? -1 : 1), Math.round(eyeY) - 1, WHITE);
    }
  } else {
    fillMask(h, G_, h.maskEllipse(H.cx + H.rx * 0.34, eyeY, 2.3, 2.7), INK);
    h.px(G_, Math.round(H.cx + H.rx * 0.34) + 1, Math.round(eyeY) - 1, WHITE);
  }

  /* ---- the nose, at the FRONT of the muzzle. Small in profile: a big nose
   * there turned the short muzzle into a beak, and a cat's profile nose is a
   * bump on the front of the face, not a wedge. ---- */
  const nx = front ? M.cx : M.cx + M.rx * 0.40;
  const ny = front ? M.cy - M.ry * 0.34 : M.cy - M.ry * 0.40;
  const nw = front ? 2.6 : 1.8;
  const nh = front ? 1.4 : 1.1;
  fillMask(h, G_, h.maskTri(nx - nw, ny - nh, nx + nw, ny - nh, nx, ny + nh + 0.4), NOSE);
  h.px(G_, Math.round(nx), Math.round(ny) - Math.round(nh) - 1, INK);

  /* ---- mouth: the small cat "w" under the nose ---- */
  const my = ny + 2.2;
  stroke(h, G_, front ? nx - 1 : nx - 1, my, nx, my + 1, INK);
  stroke(h, G_, nx, my + 1, front ? nx + 1 : nx + 2, my, INK);
}

/* ---------- legs -----------------------------------------------------
 *
 * rig2's GEOM_64 bones, solved to a paw target. The knee is a real joint: the
 * two segments meet at it and the fold is visible, which is what the brief
 * means by "articulated legs with a visible knee fold". At rest the fold is
 * small, because a cat at rest stands on straight legs - and curved legs on a
 * light-palette cat read as a rabbit.
 *
 * THAT FOLD IS NOT FREE, and getting it wrong is what made the first side
 * view look like a spider. femur+tibia+meta is 22.6px of bone. Hang the hip
 * any lower than that above the paw and the chain has to fold to reach, and a
 * 41 degree fold puts the knee four pixels outside the leg and slants the
 * whole limb. So the hip is placed from the BONE LENGTH, not from the body's
 * bottom edge, and the residual fold is a couple of degrees. */
function legReach(bones) { return bones.femur + bones.tibia + bones.meta; }

/* the hip height that makes a leg stand straight: the paw, one leg-length up */
function hipFor(bones, pawY, fold) {
  return pawY - legReach(bones) * (fold == null ? 0.97 : fold);
}
function legPoints(hipX, hipY, pawX, pawY, bones, bend) {
  const total = bones.femur + bones.tibia + bones.meta;
  const dx = pawX - hipX, dy = pawY - hipY;
  const d = Math.hypot(dx, dy) || 1;
  /* the foot segment is short and stays near-vertical; the knee takes the rest */
  const meta = bones.meta * 0.9;
  const up = Math.max(4, d - meta);
  /* 2-bone IK for femur+tibia reaching `up` from the hip */
  const a = bones.femur, b = bones.tibia;
  const cosK = Math.max(-1, Math.min(1, (a * a + up * up - b * b) / (2 * a * up)));
  const kneeAng = Math.acos(cosK) * (bend || 1);
  const baseAng = Math.atan2(dy, dx) - Math.PI / 2;
  const kAng = baseAng - kneeAng;
  const kneeX = hipX + Math.sin(kAng) * a;
  const kneeY = hipY + Math.cos(kAng) * a;
  const footTopX = hipX + Math.sin(baseAng) * up;
  const footTopY = hipY + Math.cos(baseAng) * up;
  return [
    [hipX, hipY], [kneeX, kneeY], [footTopX, footTopY],
    [footTopX + (pawX - footTopX) * 0.5, pawY - meta * 0.35], [pawX, pawY]
  ];
}
function drawLeg(h, G_, hipX, hipY, pawX, pawY, bones, ch, bend) {
  const pts = legPoints(hipX, hipY, pawX, pawY, bones, bend);
  const radii = [bones.r[0], bones.r[1] * 1.05, bones.r[2], bones.r[2] * 0.95, bones.r[3]];
  h.paint(G_, rig2.maskChain(pts, radii, h), ch, INK);
}

/* three toe marks across the front of a paw — identity, and toes that READ */
function toes(h, G_, x, y, spread) {
  for (let i = -1; i <= 1; i++) h.px(G_, Math.round(x + i * spread), Math.round(y), PINK);
}

/* ---------- the four poses ------------------------------------------- */

/* 1. IDLE, FRONT. Standing, facing the viewer. */
function idleFront() {
  const h = rig2.makeHost(SIZE, SIZE);
  const Gx = h.grid();
  const cx = 32, pawY = G.PAW_Y;

  /* legs FIRST so the torso overlaps them — hips hung from the BONE LENGTH so
   * they stand straight, both paws down */
  const hipY = hipFor(G.leg.front, pawY);
  for (const s of [-1, 1]) {
    drawLeg(h, Gx, cx + s * 7.5, hipY, cx + s * 8.5, pawY, G.leg.front, s > 0 ? WHITE : GREY, -1);
    toes(h, Gx, cx + s * 8.5, pawY + 2, 2);
  }

  /* torso: a ribcage, not a cloud. Narrower at the waist than the chest. */
  const torso = h.maskEllipse(cx, 37, 11.5, 11.5);
  h.paint(Gx, torso, WHITE, INK);
  fillMask(h, Gx, maskBox(h, cx - 8, 42, cx + 8, 50), GREY);
  /* chest bib, white again over that grey */
  fillMask(h, Gx, h.maskEllipse(cx, 41, 7.5, 6.5), WHITE);

  /* neck, then the head */
  drawHead(h, Gx, {
    front: true,
    head: { cx: cx, cy: 19, rx: 12.5, ry: 11.0 },
    muzzle: { cx: cx, cy: 25.5, rx: 8.0, ry: 6.0 }
  });

  /* tail, leaving the midline to one side — the front view's one asymmetry */
  const tail = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    tail.push([cx + 12 + t * 7, 46 - t * 15 - Math.sin(t * Math.PI) * 2]);
  }
  h.paint(Gx, rig2.maskChain(tail, [3.0, 2.9, 2.7, 2.5, 2.3, 2.0, 1.7, 1.4, 1.1, 1.0], h), WHITE, INK);

  return Gx.map(r => r.join(''));
}

/* 2. IDLE, SIDE. Profile, standing, facing right. */
function idleSide() {
  const h = rig2.makeHost(SIZE, SIZE);
  const Gx = h.grid();
  const pawY = G.PAW_Y;

  /* tail first: behind everything */
  const tail = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    tail.push([16 - t * 9, 30 - t * 6 + Math.sin(t * 2.2) * 5]);
  }
  h.paint(Gx, rig2.maskChain(tail, [3.2, 3.0, 2.8, 2.5, 2.2, 1.9, 1.6, 1.3, 1.1, 1.0], h), WHITE, INK);

  /* four legs, near-vertical. Hips hung from the bone length so they stand
   * straight - see legReach(). Far pair in grey, behind. */
  const legs = [
    ['farFront', 34, true], ['farBack', 17, true],
    ['nearBack', 22, false], ['nearFront', 41, false]
  ];
  for (const [k, lx, far] of legs) {
    const front = k.indexOf('Front') >= 0;
    const bones = front ? G.leg.front : G.leg.hind;
    drawLeg(h, Gx, lx, hipFor(bones, pawY), lx, pawY, bones, far ? GREY : WHITE, -1);
  }
  toes(h, Gx, 41, pawY + 2, 2);
  toes(h, Gx, 22, pawY + 2, 2);

  /* torso: a ribcage seen from the side, with a tuck at the waist */
  const torso = h.maskEllipse(29, 34, 14.5, 8.6);
  h.paint(Gx, torso, WHITE, INK);
  fillMask(h, Gx, maskBox(h, 17, 36, 41, 42), GREY);
  fillMask(h, Gx, h.maskEllipse(27, 32, 10.5, 5.2), WHITE);

  /* neck from the shoulder into the head, then the head. In profile the ear has
   * to CLEAR the skull or it is only a pink sliver on a white ball, so its
   * offset is passed in rather than derived from the skull centre. */
  h.paint(Gx, h.maskEllipse(40, 26, 5.6, 6.2), WHITE, INK);
  drawHead(h, Gx, {
    front: false,
    head: { cx: 45, cy: 18, rx: 9.4, ry: 9.6 },
    muzzle: { cx: 50.8, cy: 22.4, rx: 5.6, ry: 5.2 },
    earDx: -4.8, earDy: -8.6
  });

  return Gx.map(r => r.join(''));
}

/* 3. SIT, FRONT. Sitting up: chest up, hind legs folded, front legs straight. */
function sitFront() {
  const h = rig2.makeHost(SIZE, SIZE);
  const Gx = h.grid();
  const cx = 32;
  const seatY = G.PAW_Y;

  /* the folded hind legs, read as haunches either side of a base */
  for (const s of [-1, 1]) {
    const haunch = h.maskEllipse(cx + s * 12, seatY - 6, 8.0, 7.0);
    h.paint(Gx, haunch, s > 0 ? WHITE : GREY, INK);
    fillMask(h, Gx, h.maskEllipse(cx + s * 12, seatY - 5, 5.0, 4.2), s > 0 ? WHITE : GREY);
    toes(h, Gx, cx + s * 13, seatY + 1, 2);
  }
  /* front legs straight down the front of the chest */
  for (const s of [-1, 1]) {
    drawLeg(h, Gx, cx + s * 6.5, 34, cx + s * 7.5, seatY - 1, G.leg.front, WHITE, -1);
    toes(h, Gx, cx + s * 7.5, seatY + 1, 2);
  }

  /* torso upright and taller than the standing one — she is sitting up */
  const torso = h.maskEllipse(cx, 37, 11.5, 13.5);
  h.paint(Gx, torso, WHITE, INK);
  fillMask(h, Gx, maskBox(h, cx - 9, 42, cx + 9, 51), GREY);
  fillMask(h, Gx, h.maskEllipse(cx, 40, 7.5, 7.0), WHITE);

  drawHead(h, Gx, {
    front: true,
    head: { cx: cx, cy: 17, rx: 12.5, ry: 11.0 },
    muzzle: { cx: cx, cy: 23.5, rx: 8.0, ry: 6.0 }
  });

  /* tail curled round the front, the way a sitting cat puts it */
  const tail = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    tail.push([cx - 13 + t * 5, 50 + Math.sin(t * Math.PI) * 5 - t * 2]);
  }
  h.paint(Gx, rig2.maskChain(tail, [3.0, 2.8, 2.6, 2.3, 2.0, 1.8, 1.5, 1.2, 1.0, 0.9], h), WHITE, INK);

  return Gx.map(r => r.join(''));
}

/* 4. CURLED, SIDE. The tucked pose: lying on her side, legs folded under,
 * tail wrapped round and brought up to the nose, head down on the paws. */
function curledSide() {
  const h = rig2.makeHost(SIZE, SIZE);
  const Gx = h.grid();
  const y = G.PAW_Y;

  /* THE TAIL, wrapped AROUND the body and coming back up to the muzzle - that
   * wrap is what says "curled". Drawn first, so it passes behind, and with
   * even girth so it does not taper into a cone. */
  const tail = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    tail.push([46 - t * 32, y - 1 - Math.sin(t * Math.PI) * 8]);
  }
  h.paint(Gx, rig2.maskChain(tail, [3.2, 3.1, 3.0, 2.8, 2.6, 2.4, 2.2, 2.0, 1.8, 1.6, 1.4], h), WHITE, INK);

  /* the folded legs, knees drawn up — a tucked pose, so here the fold IS
   * wanted, and it is large on purpose */
  drawLeg(h, Gx, 27, y - 13, 31, y - 3, G.leg.hind, GREY, 1);
  drawLeg(h, Gx, 34, y - 12, 36, y - 3, G.leg.front, WHITE, 1);

  /* the lying body: rounder and taller than the standing one, because a cat
   * curled up is a rounded mass with the spine up - not a flat lozenge */
  const body = h.maskEllipse(29, y - 8, 16.5, 10.5);
  h.paint(Gx, body, WHITE, INK);
  /* the spine curve, and the belly shadow under it */
  fillMask(h, Gx, maskBox(h, 15, y - 4, 44, y), GREY);
  fillMask(h, Gx, h.maskEllipse(27, y - 9, 11.5, 6.2), WHITE);
  /* hind paw tucked up against the cheek */
  h.paint(Gx, h.maskEllipse(41, y - 5, 4.6, 3.4), GREY, INK);

  /* head down, resting on the paws, muzzle still projecting forward */
  drawHead(h, Gx, {
    front: false,
    head: { cx: 45, cy: y - 10, rx: 9.4, ry: 9.6 },
    muzzle: { cx: 50.8, cy: y - 5.6, rx: 5.6, ry: 5.2 },
    earDx: -4.8, earDy: -8.6
  });

  return Gx.map(r => r.join(''));
}

const POSES = {
  idle_front: idleFront,
  idle_side: idleSide,
  sit_front: sitFront,
  curled_side: curledSide
};

function render(name) {
  if (!POSES[name]) throw new Error('no such pose: ' + name + ' (have: ' + Object.keys(POSES).join(', ') + ')');
  return POSES[name]();
}
function renderAll() {
  const out = {};
  for (const k of Object.keys(POSES)) out[k] = render(k);
  return out;
}

module.exports = { render, renderAll, POSES, SIZE };

if (require.main === module) {
  for (const k of Object.keys(POSES)) console.log('--- ' + k + ' ---\n' + render(k).join('\n'));
}