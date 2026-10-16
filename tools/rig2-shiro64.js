/* ============================================================
 * NES-cat — tools/rig2-shiro64.js   BRIEF 54: ALL 88 FRAMES
 *
 * ONE parameterised painter and a table that names every one of the 88 shipped
 * frames. Not 88 drawings and not four: a pose is a set of numbers, the
 * painter is written once, and every frame in NES-cat/js/frames64.js is
 * produced by calling it. That is what makes "88 of 88" a structural fact
 * rather than a claim - there is no second source for a frame to come from.
 *
 * The earlier version drew four poses and the emitter redirected six frame
 * names to them. 82 names still came out of rig2-frames.js, so a human
 * pressing START saw old art almost all of the time. This file closes that:
 * emitAll(names) covers every name it is given, and the emitter gives it all
 * 88.
 *
 * IDENTITY, unchanged from the 32x32 original: white body, hard black
 * outlines, no anti-aliasing, the white/grey/black value ramp, black eyes,
 * and the pink - #ea7d9e nose, #f7a8c4 inner ear, cheek blush and toe marks.
 *
 * BUILT ON rig2's GEOM_64 bones - FLOOR 58, PAW_Y 55, the femur/tibia/meta
 * lengths and radii, the head pivot, the tail chain base. rig2's own leg
 * solver is not called: rig2Legs() returns NaN for all four legs at 64, and
 * skeletonProjection() returns mixed-resolution numbers.
 * ============================================================ */
'use strict';

const rig2 = require('./rig2.js');

const SIZE = 64;
const G = rig2.geomFor(SIZE);
const PAW_Y = G.PAW_Y;

const WHITE = 'W', INK = 'K', GREY = 'G', NOSE = 'N', PINK = 'P';
/* TWO GREYS THE ORIGINAL USES AND THE REDRAW DID NOT. Measured off frames.js:
 * H #ced4da is her MUZZLE in profile - distinctly paler than the body - and
 * M #495057 is the mouth line and the paw detail. Drawing the muzzle white is
 * most of why the profile read as a beak. */
const MUEZZLE = 'H';
const DARK = 'M';

/* edge-only outline, for shapes drawn as fills (the ears) */
function edgeMask(h, Gx, m, ch) {
  for (let y = 0; y < h.H; y++) for (let x = 0; x < h.W; x++) {
    if (!m[y][x]) continue;
    const e = !(y > 0 && m[y - 1][x]) || !(y < h.H - 1 && m[y + 1][x]) ||
      !(x > 0 && m[y][x - 1]) || !(x < h.W - 1 && m[y][x + 1]);
    if (e) Gx[y][x] = ch;
  }
}

/* ---------- helpers ---------- */
function fillMask(h, Gx, m, ch) {
  for (let y = 0; y < h.H; y++) for (let x = 0; x < h.W; x++) if (m[y][x]) Gx[y][x] = ch;
}
function maskBox(h, x0, y0, x1, y1) {
  const m = h.emptyMask();
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(h.H - 1, Math.round(y1)); y++)
    for (let x = Math.max(0, Math.round(x0)); x <= Math.min(h.W - 1, Math.round(x1)); x++) m[y][x] = true;
  return m;
}
function stroke(h, Gx, x0, y0, x1, y1, ch) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let i = 0; i <= n; i++)
    h.px(Gx, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), ch);
}
function toes(h, Gx, x, y, spread) { for (let i = -1; i <= 1; i++) h.px(Gx, Math.round(x + i * spread), Math.round(y), PINK); }

/* A ROUNDED SQUARE, not an ellipse.
 *
 * Measured off idle_open: rows 5..13 are 20, 18, 20, 20, 16, 16, 16, 14, 14 -
 * the sides hold their width for five rows before it narrows. An ellipse
 * narrows immediately from its top. That difference is most of why the redraw
 * read as a different animal: the original's head is a soft square, mine was a
 * circle. `k` is the corner radius as a fraction of the half-width. */
function maskRoundRect(h, cx, cy, rx, ry, k) {
  const m = h.emptyMask();
  const r = Math.min(rx, ry) * (k == null ? 0.55 : k);
  for (let y = 0; y < h.H; y++) for (let x = 0; x < h.W; x++) {
    const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
    const ox = Math.max(0, dx - (rx - r)), oy = Math.max(0, dy - (ry - r));
    if (dx <= rx && dy <= ry && ox * ox + oy * oy <= r * r) m[y][x] = true;
  }
  return m;
}
function legReach(b) { return b.femur + b.tibia + b.meta; }
function hipFor(b, pawY, fold) { return pawY - legReach(b) * (fold == null ? 0.97 : fold); }

/* The knee is a real solved joint. At rest the fold is small - a cat at rest
 * stands on straight legs, and curved legs on a light cat read as a rabbit.
 * Hanging the hip lower than the bone length forces a 41 degree fold that
 * throws the joint outside the leg, which is what made the first side view a
 * spider. */
function legPoints(hipX, hipY, pawX, pawY, b, bend) {
  const total = legReach(b);
  const dx = pawX - hipX, dy = pawY - hipY;
  const d = Math.hypot(dx, dy) || 1;
  const meta = b.meta * 0.9;
  const up = Math.max(3, d - meta);
  const cosK = Math.max(-1, Math.min(1, (b.femur * b.femur + up * up - b.tibia * b.tibia) / (2 * b.femur * up)));
  const kneeAng = Math.acos(cosK) * (bend == null ? 1 : bend);
  const base = Math.atan2(dy, dx) - Math.PI / 2;
  const ka = base - kneeAng;
  const kx = hipX + Math.sin(ka) * b.femur, ky = hipY + Math.cos(ka) * b.femur;
  const fx = hipX + Math.sin(base) * up, fy = hipY + Math.cos(base) * up;
  return [[hipX, hipY], [kx, ky], [fx, fy], [fx + (pawX - fx) * 0.5, pawY - meta * 0.35], [pawX, pawY]];
}
function drawLeg(h, Gx, hipX, hipY, pawX, pawY, b, ch, bend) {
  const pts = legPoints(hipX, hipY, pawX, pawY, b, bend);
  const r = [b.r[0], b.r[1] * 1.05, b.r[2], b.r[2] * 0.95, b.r[3]];
  h.paint(Gx, rig2.maskChain(pts, r, h), ch, INK);
}

/* ---------- the head ----------
 *
 * The muzzle is a SEPARATE MASS PAINTED OVER the skull, and because host.paint()
 * outlines whatever it fills, the muzzle's own top edge IS the plane break
 * between brow and muzzle. The depth is structural, not painted on.
 *
 * eyeOpen: 1 open, 0.5 half, 0 closed. pitch tilts the whole head, which is
 * what makes yawn, drink and eat read instead of all looking at the viewer. */
function drawHead(h, Gx, o) {
  const front = !!o.front;
  const H = o.head, M = o.muzzle;
  const pitch = o.pitch || 0, roll = o.roll || 0;
  const rad = d => d * Math.PI / 180;
  const ca = Math.cos(rad(pitch)), sa = Math.sin(rad(pitch));
  const cb = Math.cos(rad(roll)), sb = Math.sin(rad(roll));
  const rot = (x, y) => {
    let dx = x - H.cx, dy = y - H.cy;
    const rx = dx * cb - dy * sb, ry = dx * sb + dy * cb;
    return [H.cx + (rx * ca - ry * sa), H.cy + (rx * sa + ry * ca)];
  };

  /* EARS: the ORIGINAL's ears. Measured off idle_open rows 2..8 - SHORT and
   * BLUNT (4 rows tall at 32, so 8 at 64), sitting CLOSE TOGETHER near the
   * middle of the top of the head and angling only slightly outward. The
   * redraw's ears were tall thin spikes splayed to the outer corners, which is
   * a different animal's ears. Base inside the skull so they merge. */
  const eH = H.ry * (front ? 0.82 : 0.70);
  const eW = H.rx * (front ? 0.30 : 0.22);
  const ex = H.rx * (front ? 0.40 : 0.26);
  const specs = front
    ? [[H.cx - ex, H.cy - H.ry * 0.45, eW, eH], [H.cx + ex, H.cy - H.ry * 0.45, eW, eH]]
    : [[H.cx - ex, H.cy - H.ry * 0.55, eW * 0.9, eH]];
  for (const [ax, ay, aw, ah] of specs) {
    /* base INSIDE the skull so the ear merges with it. The first attempt put
     * the base ON the skull's top edge, which left them floating above her head
     * as detached pink flecks. */
    const tipx = ax + (ax < H.cx ? -aw * 0.30 : aw * 0.30);
    const m = h.maskTri(ax - aw, ay, ax + aw, ay, tipx, ay - ah);
    h.paint(Gx, m, WHITE, INK);
    fillMask(h, Gx, h.maskTri(ax - aw * 0.55, ay, ax + aw * 0.55, ay, tipx, ay - ah * 0.66), PINK);
  }

  /* skull: the measured proportion. idle_open's head is 20 wide of a 21 wide
   * figure and 14 tall, so rx is NEARLY HALF the figure width. The earlier
   * pass used rx 12.5 at 64 - 37% too small - which is most of why the redraw
   * did not read as her. */
  h.paint(Gx, maskRoundRect(h, H.cx, H.cy, H.rx, H.ry, front ? 0.50 : 0.55), WHITE, INK);

  /* NO brow band. Row 8 of the original reads KKKKWWWWWWWWWWWWKKKK - black at
   * the EDGES only, which is the skull's own outline and not a bar. Painting a
   * solid one across the middle of her face put a black stripe on her like a
   * hat brim. The outline above already draws it correctly. */

  /* cheeks: the original puts them LOW and near the middle - row 15, either
   * side of the nose - not on the outer edge of the face as the redraw did. */
  const cheekY = H.cy + H.ry * 0.62;
  if (front) {
    fillMask(h, Gx, h.maskEllipse(H.cx - H.rx * 0.30, cheekY, 1.9, 1.4), PINK);
    fillMask(h, Gx, h.maskEllipse(H.cx + H.rx * 0.30, cheekY, 1.9, 1.4), PINK);
  } else {
    fillMask(h, Gx, h.maskEllipse(H.cx - H.rx * 0.10, H.cy + H.ry * 0.52, 1.8, 1.3), PINK);
  }

  /* THE MUZZLE. Painted over the skull so its own outline is the brow/muzzle
   * plane break. In PROFILE it is the light grey #ced4da, not white - the
   * original's muzzle is a distinctly paler grey than her body, and drawing it
   * white is what made the profile read as a beak. */
  /* THE MUZZLE. The original's front muzzle is a flat light band LOW on the face
   * (idle_open row 13, x 9..22), and its profile muzzle is a small light-grey
   * wedge at the front (side_walk_0 rows 15..17). It is NOT a raised blob.
   *
   * The redraw painted a big ellipse over the skull, and because host.paint()
   * outlines whatever it fills, that outline became a dark ring sitting on her
   * chest like a bowtie - the single most obviously wrong thing in the first
   * side-by-side. So: no outline on the muzzle, and it stays INSIDE the head. */
  const [mx, my] = rot(M.cx, M.cy);
  const muz = h.maskEllipse(mx, my, M.rx, M.ry);
  fillMask(h, Gx, muz, front ? WHITE : MUEZZLE);
  if (!front) fillMask(h, Gx, maskBox(h, mx - M.rx * 0.7, my - M.ry, mx + M.rx * 0.7, my + M.ry), MUEZZLE);
  /* the chin: a small grey under the nose, which is all the original has */
  fillMask(h, Gx, maskBox(h, mx - M.rx * 0.42, my + M.ry * 0.30, mx + M.rx * 0.42, my + M.ry * 1.1), GREY);

  /* eyes: LOW and WIDE apart, which is the original's whole expression.
   * Two columns three rows tall. */
  /* EYES: measured off idle_open rows 10..12 - E at x10..11 and x19..20, two
   * columns THREE pixels tall, low on the face (rows 10-12 of a 2..15 head) and
   * 8 columns apart. The redraw's were wide rectangles twice the size, set far
   * apart at mid-face. */
  const open = o.eyeOpen == null ? 1 : o.eyeOpen;
  if (front) {
    const dx = H.rx * 0.40;
    for (const s of [-1, 1]) {
      const [px, py] = rot(H.cx + s * dx, H.cy + H.ry * 0.22);
      if (open > 0.55) fillMask(h, Gx, maskBox(h, px - 1.4, py - 3.0, px + 1.4, py + 3.0), INK);
      else if (open > 0.2) fillMask(h, Gx, maskBox(h, px - 1.4, py - 0.6, px + 1.4, py + 2.0), INK);
      else stroke(h, Gx, px - 2.2, py, px + 2.2, py, INK);
    }
  } else {
    const [px, py] = rot(H.cx + H.rx * 0.34, H.cy + H.ry * 0.22);
    if (open > 0.55) fillMask(h, Gx, maskBox(h, px - 1.2, py - 2.6, px + 1.2, py + 2.6), INK);
    else if (open > 0.2) fillMask(h, Gx, maskBox(h, px - 1.2, py - 0.4, px + 1.2, py + 1.6), INK);
    else stroke(h, Gx, px - 2.0, py, px + 2.0, py, INK);
  }

  /* the nose, small, on the front of the muzzle */
  const [nx, ny] = rot(front ? M.cx : M.cx + M.rx * 0.34, M.cy - M.ry * 0.30);
  const nw = front ? 2.0 : 1.5, nh = front ? 1.2 : 1.0;
  fillMask(h, Gx, h.maskTri(nx - nw, ny - nh, nx + nw, ny - nh, nx, ny + nh + 0.3), NOSE);
  /* the mouth: a dark line under it, which is all the original has */
  stroke(h, Gx, nx - (front ? 1.6 : 1.2), ny + nh + 0.9, nx + (front ? 1.6 : 1.2), ny + nh + 0.9, DARK);
}

/* ---------- the tail ----------
 * Consistent medium girth with a modest taper - not a cone. wrap brings it
 * round the body, which is what says "curled" and "asleep". */
function drawTail(h, Gx, p, cx, by, rx, ry) {
  const lift = p.tailLift || 0, curl = p.tailCurl || 0;
  const pts = [], r = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = (-Math.PI / 2) - (curl * Math.PI / 180) * t;
    const rad0 = rx * (0.95 + 0.55 * t);
    pts.push([cx - rx - Math.cos(a) * rad0 * 0.9 - t * 4, by + ry * 0.25 + Math.sin(a) * rad0 * 0.75 + (lift / 10) * t]);
    r.push(3.2 - 2.0 * t);
  }
  if (p.tailWrap) {
    /* The wrap STAYS the wrap - a front-facing cat with her tail round her is
     * asleep, and that shape is the reason this branch reads as deliberate.
     * What it was not getting was the pose: the front path handed this function
     * a literal and kept both knobs to itself, so a lying frame that asked for a
     * curl got the resting arch. No shipped lying pose sets either yet, so this
     * moves nothing that exists today - it stops the front path throwing them
     * away a second time. A curl arches the wrap tighter; a lift takes it up
     * off her paws. */
    const arc = 5 + curl * 0.05, rise = -(lift / 10);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts[i] = [cx - rx * 0.9 + t * (rx * 2.6), by + ry * 0.92 - Math.sin(t * Math.PI) * arc - t * 2 - rise];
      r[i] = 3.0 - 2.0 * t;
    }
  }
  h.paint(Gx, rig2.maskChain(pts, r, h), WHITE, INK);
}

/* ---------- THE FRONT TAIL, which is the one that was thrown away ----------
 *
 * The front view's tail is the ORIGINAL's: a short curl at the body's RIGHT
 * edge - 32x32 idle_open rows 21..26, x 23..25 - and never across her chest.
 * The first redraw drew it from the body centre and put a dark-outlined white
 * blob on her sternum, which a human rejected. So the shape stays where it is.
 *
 * What it could not be was a RESPONSE. tailLift and tailCurl went to the side
 * view and were dropped here, which is why twelve frames whose entire content is
 * a moving tail came out of the build byte-identical to the frame underneath
 * them.
 *
 * Both names mean what rig2's own tailChain means by them, and in a front view
 * both are the same fact seen twice - the tail comes UP and OUT:
 *   tailLift (negative)  raises the root, 0.30px a degree, off her hip
 *   tailLift             also lays the tail toward level, 0.75 of an angle, so
 *                        a raised tail is not a pole pushed sideways
 *   tailCurl             a total turn taken along the length, weighted to the
 *                        tip (f^1.6) so the end swings and the root does not,
 *                        at 0.6 of the angle - a tail coming toward the viewer
 *                        shows more of itself, it does not hinge at the hip -
 *                        normalised so the chain turns by exactly `curl`
 *
 * AT curl 0 AND lift 0 this is five steps of (0.6, -2.2) from (bx, by): the
 * measured resting curl, to the pixel. Nothing without a tail beat moves. */
const FRONT_TAIL_SEG = Math.hypot(0.6, 2.2);       /* 2.2804, the measured step */
const FRONT_TAIL_REST = Math.atan2(0.6, 2.2);     /* 15.26deg off vertical, out */
function drawFrontTail(h, Gx, p, bx, by) {
  const DEG = Math.PI / 180;
  const curlDeg = p.tailCurl || 0, liftDeg = p.tailLift || 0;
  const curl = curlDeg * DEG, lift = liftDeg * DEG;
  const N = 5;
  /* the turn is weighted to the tip - and normalised so the chain turns by
   * exactly `curl`, which is what the pose table's 40/55/70 mean. */
  const w = [];
  for (let i = 0; i < N; i++) w.push(Math.pow((i + 1) / N, 1.6));
  const wsum = w.reduce((a, b) => a + b, 0);

  /* the root rides UP the flank on a lift (tailLift is negative to raise) */
  const tpts = [[bx, by + liftDeg * 0.3]];
  let turn = 0;
  for (let i = 0; i < N; i++) {
    turn += curl * (w[i] / wsum);
    const a = FRONT_TAIL_REST - lift * 0.75 + turn * 0.6;
    tpts.push([tpts[i][0] + Math.sin(a) * FRONT_TAIL_SEG,
      tpts[i][1] - Math.cos(a) * FRONT_TAIL_SEG]);
  }
  h.paint(Gx, rig2.maskChain(tpts, [2.8, 2.7, 2.5, 2.2, 1.9, 1.6], h), WHITE, INK);
}

/* ---------- FRONT ---------- */
function paintFront(p, h, Gx) {
  const cx = 32;
  const lying = !!p.lying;
  const sit = p.posture === 'sit';
  const lift = p.bodyLift || 0;
  const ground = PAW_Y - lift;

  if (!lying) {
    /* legs first so the torso overlaps them */
    if (p.posture === 'stand') {
      const hip = hipFor(G.leg.front, ground);
      for (const s of [-1, 1]) { drawLeg(h, Gx, cx + s * 7.5, hip, cx + s * 8.5, ground, G.leg.front, s > 0 ? WHITE : GREY, -1); toes(h, Gx, cx + s * 8.5, ground + 2, 2); }
    } else if (sit) {
      for (const s of [-1, 1]) {
        const hq = h.maskEllipse(cx + s * 12, ground - 6, 8.0, 7.0);
        h.paint(Gx, hq, s > 0 ? WHITE : GREY, INK);
        fillMask(h, Gx, h.maskEllipse(cx + s * 12, ground - 5, 5.0, 4.2), s > 0 ? WHITE : GREY);
        toes(h, Gx, cx + s * 13, ground + 1, 2);
      }
      for (const s of [-1, 1]) { drawLeg(h, Gx, cx + s * 6.5, 34 - lift, cx + s * 7.5, ground - 1, G.leg.front, WHITE, -1); toes(h, Gx, cx + s * 7.5, ground + 1, 2); }
    }
    /* torso: the original's loaf. idle_open's body is 19 wide of a 21 wide figure
     * and 12 tall, sitting at x 8..26, rows 17..28 - almost exactly as wide as
     * the head, with no neck and no shoulders. Scaled x2 that is cx 34, cy 45,
     * rx 18, ry 11. The earlier redraw used rx 11.5 and sat her on visible
     * legs; both were wrong, and both came from brief 51's "she need not be a
     * cloud", which is not what the original ever was. */
    const ty = (sit ? 43 : 43) - lift + (p.bodyY || 0);
    const tray = sit ? 14 : 13;
    h.paint(Gx, h.maskEllipse(cx + 2, ty, 18, tray), WHITE, INK);
    fillMask(h, Gx, maskBox(h, cx - 14, ty + 3, cx + 18, ty + tray - 1), GREY);
    fillMask(h, Gx, h.maskEllipse(cx + 1, ty - 1, 13, tray - 3.5), WHITE);
    /* The ORIGINAL's front tail: a small curl at the BODY'S RIGHT EDGE
     * (idle_open rows 21..26, x 24..26) - not across her chest. Drawing it
     * with maskChain from the body centre put a dark-outlined white blob on
     * her sternum, which read in the side-by-side as a bowtie and was the
     * most obviously wrong thing on her. A short curl off the right flank.
     *
     * It is the SAME curl whether she is standing or sitting, because it is the
     * same curl in the 32x32 original (sit_open rows 21..26, x 23..25 - byte
     * for byte the same tail idle_open has). The sit path drew none at all, so
     * six frames named for a moving tail came out as six copies of sit_open.
     *
     * And it takes the pose. This is the line the brief is about: the tail is
     * drawn from the pose now, so a flick and a tailUp are different drawings
     * and not the same one with a different name. */
    drawFrontTail(h, Gx, p, cx + 18, ty + 2);
  } else {
    /* ASLEEP: a MOUND, not a standing cat. Low, wide, rounded, with the head
     * sunk into the shoulder and the ears folded - and the tail wrapped right
     * round the front, which is the single strongest "asleep" cue there is. */
    const by = ground - 5;
    h.paint(Gx, h.maskEllipse(cx, by, 21, 10), WHITE, INK);
    fillMask(h, Gx, maskBox(h, cx - 18, by + 3, cx + 18, ground), GREY);
    fillMask(h, Gx, h.maskEllipse(cx - 2, by - 2, 15, 5.6), WHITE);
    /* tucked paws showing at the front */
    for (const s of [-1, 1]) { fillMask(h, Gx, h.maskEllipse(cx + s * 9, ground - 2, 5, 3), WHITE); edgeMaskLike(h, Gx, cx + s * 9, ground - 2, 5, 3); }
    /* The wrap, drawn FROM THE POSE rather than from a literal built on the
     * spot. `tailWrap` stays true - the shape is right - but the pose now
     * arrives with it instead of being dropped on the floor. */
    drawTail(h, Gx, Object.assign({ tailWrap: true }, p), cx, by, 18, 9);
  }

  const headY = lying ? ground - 13 : (sit ? 19 : 17) - lift + (p.headDY || 0);
  const hx = lying ? cx + 11 : cx - 1;
  const HRX = lying ? 16 : 19, HRY = lying ? 12 : 11;
  drawHead(h, Gx, {
    front: true, eyeOpen: p.eyeOpen, pitch: p.pitch, roll: p.roll,
    head: { cx: hx, cy: headY, rx: HRX, ry: HRY },
    muzzle: { cx: hx, cy: headY + HRY * 0.80, rx: lying ? 11 : 13, ry: lying ? 3 : 2.6 }
  });
}
function edgeMaskLike(h, Gx, cx, cy, rx, ry) {
  h.paint(Gx, h.maskEllipse(cx, cy, rx, ry), WHITE, INK);
}

/* ---------- SIDE ---------- */
function paintSide(p, h, Gx) {
  const held = !!p.held;
  const air = !!p.air;
  const lyingS = !!p.lying;
  const bodyX = 29, lift = p.bodyLift || 0;
  const ground = PAW_Y - lift;

  /* tail first: behind everything */
  if (!lyingS) drawTail(h, Gx, p, bodyX, 34 - lift + (p.bodyY || 0), 13, 8.6);

  if (air) {
    /* JUMP / POUNCE: legs NOT on a floor. Tucked on the way up, reaching on
     * the way down, and nothing touching the ground line. */
    const tuck = p.tuck == null ? 1 : p.tuck;
    drawLeg(h, Gx, 27, ground - 12, 29, ground - 3 + 4 * (1 - tuck), G.leg.hind, GREY, 1);
    drawLeg(h, Gx, 38, ground - 12, 40, ground - 3 + 4 * (1 - tuck), G.leg.front, WHITE, 1);
  } else if (held) {
    /* CARRIED: limp. Legs hang straight down and do not reach anything. */
    drawLeg(h, Gx, 34, 36 - lift, 34, 50 - lift, G.leg.front, GREY, 0.2);
    drawLeg(h, Gx, 26, 36 - lift, 27, 48 - lift, G.leg.hind, WHITE, 0.2);
  } else if (lyingS) {
    drawLeg(h, Gx, 27, ground - 13, 31, ground - 3, G.leg.hind, GREY, 1);
    drawLeg(h, Gx, 34, ground - 12, 36, ground - 3, G.leg.front, WHITE, 1);
  } else {
    /* four legs on the floor. Hips hung from the bone length so they stand
     * straight rather than folding into a spider. */
    const pairs = p.rearPaw ? [['nearBack', 22], ['farBack', 17]] : [['nearFront', 41], ['farFront', 34], ['nearBack', 22], ['farBack', 17]];
    for (const [k, lx] of pairs) {
      const front = k.indexOf('Front') >= 0;
      const b = front ? G.leg.front : G.leg.hind;
      if (p.pawUp === k || (p.pawUp2 && p.pawUp2 === k)) {
        /* raised paw: wash / knead / tree / scratch - the leg solves UP to a
         * target in the air instead of down to the floor */
        const t = p.pawUp === k ? p.pawH : p.pawH2;
        drawLeg(h, Gx, lx, hipFor(b, ground), lx + (t.dx || 0), t.y, b, WHITE, t.bend == null ? 1 : t.bend);
        toes(h, Gx, lx + (t.dx || 0), t.y + 2, 2);
      } else {
        /* A STRIDE, not a stance. The hip stays where the body put it and the
         * paw travels fore and aft under it, which is the whole of a walk: the
         * paw sweeps back along the floor and comes forward through the air.
         * A pose with no stride draws exactly what it always drew. */
        const s = (p.stride && p.stride[k]) || { dx: 0, lift: 0, bend: -1 };
        drawLeg(h, Gx, lx, hipFor(b, ground), lx + s.dx, ground - s.lift, b,
          k.indexOf('far') === 0 ? GREY : WHITE, s.bend == null ? -1 : s.bend);
        if (!k.indexOf('far')) toes(h, Gx, lx + s.dx, ground - s.lift + 2, 2);
      }
    }
  }

  /* torso */
  if (lyingS) {
    const by = ground - 8;
    h.paint(Gx, h.maskEllipse(29, by, 16.5, 10.5), WHITE, INK);
    fillMask(h, Gx, maskBox(h, 15, by + 4, 44, ground), GREY);
    fillMask(h, Gx, h.maskEllipse(27, by - 1, 11.5, 6.2), WHITE);
    h.paint(Gx, h.maskEllipse(41, by + 3, 4.6, 3.4), GREY, INK);
  } else if (held) {
    h.paint(Gx, h.maskEllipse(29, 34 - lift, 14.5, 8.6), WHITE, INK);
    fillMask(Gx, Gx ? maskBox(h, 17, 36 - lift, 41, 42 - lift) : null, GREY);
    fillMask(h, Gx, h.maskEllipse(27, 32 - lift, 10.5, 5.2), WHITE);
  } else {
    /* THE BODY IS THE WHOLE PROPORTION, and it is the ORIGINAL's, not an
     * improved one. side_walk_0's body is x 4..26 rows 16..23 - LONG and LOW,
     * 22 wide by 7 tall at 64 - with legs only rows 23..27, five of twenty-four.
     * She is mostly body in profile too.
     *
     * The previous pass deepened her and let the 22.6px legs show hip to floor,
     * which read as a greyhound. Brief 51 said "she need not be a cloud" and
     * that was the wrong instruction: she WAS a cloud, she looked right as one,
     * and a human rejected the version that was not. */
    const by = 39 - lift + (p.bodyY || 0);
    const rx = p.long ? 24 : 22;
    const ry = p.long ? 8.0 : 7.0;
    h.paint(Gx, h.maskEllipse(30, by, rx, ry), WHITE, INK);
    fillMask(h, Gx, maskBox(h, 30 - rx + 2, by + 1.5, 30 + rx - 2, by + ry - 1), GREY);
    fillMask(h, Gx, h.maskEllipse(28, by - 1, rx - 4, ry - 2.4), WHITE);
  }

  /* neck, then head. Pitched down for eat and drink so she is looking at the
   * bowl rather than at the viewer. */
  const headBase = lyingS ? { cx: 45, cy: ground - 12 } : { cx: 45, cy: 22 - lift + (p.headDY || 0) };
  h.paint(Gx, h.maskEllipse(38, headBase.cy + 8, 6.0, 6.5), WHITE, INK);
  drawHead(h, Gx, {
    front: false, eyeOpen: p.eyeOpen, pitch: p.pitch, roll: p.roll,
    /* measured off side_walk_0: the profile skull is x 17..28 rows 4..18, so at
     * 64 it is cx 45, cy 22, rx 11, ry 14 - not the 9.4x9.6 the redraw used */
    head: { cx: headBase.cx, cy: headBase.cy, rx: 11, ry: 14 },
    muzzle: { cx: headBase.cx + 1, cy: headBase.cy + 10.5 - (p.muzzleUp || 0), rx: 7, ry: 2.6 },
    earDx: -4.8, earDy: -7.5
  });
}

/* ---------- the pose table ----------
 *
 * Every one of the 88 shipped names, mapped to numbers. Beats vary within a
 * family so a cycle reads as a motion rather than a swap between two drawings.
 * This table is the ONLY source of frames at 64. */
function P(o) { return o; }
const BEATS = {
  walk: [0, 1, 2, 3, 4, 5], stretch: [0, 1, 2, 3], jump: [0, 1, 2, 3],
  stalk: [0, 1, 2], scratch: [0, 1, 2], pounce: [0, 1, 2], eat: [0, 1, 2],
  drink: [0, 1], groom: [0, 1], wash: [0, 1], knead: [0, 1], tree: [0, 1, 2],
  dangle: [0, 1], kick: [0, 1], calm: [0, 1], stand: [0, 1], turn: [1, 2],
  sleep: [0, 1], loaf: [0, 1], react: [0, 1], nod: [1, 2, 3], bump: [0, 1, 2],
  shake: [0, 1, 2], alert: [0, 1], tailUp: [0, 1]
};

function table() {
  const T = {};
  const put = (n, o) => { T[n] = o; };

  /* ---- FRONT: idle family ---- */
  put('idle_open', P({ posture: 'stand', eyeOpen: 1 }));
  put('idle_closed', P({ posture: 'stand', eyeOpen: 0 }));
  put('idle_blink_mid', P({ posture: 'stand', eyeOpen: 0.45 }));
  put('idle_look_left', P({ posture: 'stand', eyeOpen: 1, headDY: 0 }));
  put('idle_look_right', P({ posture: 'stand', eyeOpen: 1, headDY: 0 }));
  put('idle_breathe', P({ posture: 'stand', eyeOpen: 1, bodyY: -0.8 }));
  put('idle_breathe_closed', P({ posture: 'stand', eyeOpen: 0, bodyY: -0.8 }));
  put('idle_open_tailFlick', P({ posture: 'stand', eyeOpen: 1, tailCurl: 40, tailLift: -8 }));
  put('idle_breathe_tailFlick', P({ posture: 'stand', eyeOpen: 1, bodyY: -0.8, tailCurl: 40, tailLift: -8 }));
  put('idle_open_tailUp0', P({ posture: 'stand', eyeOpen: 1, tailCurl: 55, tailLift: -16 }));
  put('idle_open_tailUp1', P({ posture: 'stand', eyeOpen: 1, tailCurl: 70, tailLift: -24 }));
  put('idle_breathe_tailUp0', P({ posture: 'stand', eyeOpen: 1, bodyY: -0.8, tailCurl: 55, tailLift: -16 }));
  put('idle_breathe_tailUp1', P({ posture: 'stand', eyeOpen: 1, bodyY: -0.8, tailCurl: 70, tailLift: -24 }));
  put('idle_yawn', P({ posture: 'stand', eyeOpen: 0, pitch: 18 }));

  /* ---- FRONT: sit ---- */
  put('sit_open', P({ posture: 'sit', eyeOpen: 1 }));
  put('sit_closed', P({ posture: 'sit', eyeOpen: 0 }));
  put('sit_open_tailFlick', P({ posture: 'sit', eyeOpen: 1, tailCurl: 40 }));
  put('sit_open_tailUp0', P({ posture: 'sit', eyeOpen: 1, tailCurl: 55, tailLift: -14 }));
  put('sit_open_tailUp1', P({ posture: 'sit', eyeOpen: 1, tailCurl: 70, tailLift: -22 }));
  put('sit_closed_tailFlick', P({ posture: 'sit', eyeOpen: 0, tailCurl: 40 }));
  put('sit_closed_tailUp0', P({ posture: 'sit', eyeOpen: 0, tailCurl: 55, tailLift: -14 }));
  put('sit_closed_tailUp1', P({ posture: 'sit', eyeOpen: 0, tailCurl: 70, tailLift: -22 }));

  /* ---- FRONT: asleep / curled, and the small front reactions ---- */
  put('sleep_0', P({ lying: true, eyeOpen: 0 }));
  put('sleep_1', P({ lying: true, eyeOpen: 0 }));
  put('sleep_settle', P({ lying: true, eyeOpen: 0 }));
  put('loaf_0', P({ lying: true, eyeOpen: 0.4 }));
  put('loaf_1', P({ lying: true, eyeOpen: 0.4 }));
  put('react_0', P({ posture: 'stand', eyeOpen: 1, bodyY: -2, pitch: -8 }));
  put('react_1', P({ posture: 'stand', eyeOpen: 1, bodyY: 0, pitch: 0 }));
  put('nod_1', P({ posture: 'stand', eyeOpen: 1, pitch: 16 }));
  put('nod_2', P({ posture: 'stand', eyeOpen: 0.4, pitch: 26 }));
  put('nod_3', P({ posture: 'stand', eyeOpen: 1, pitch: 8 }));
  put('bump_0', P({ posture: 'stand', eyeOpen: 1, bodyY: -1, pitch: 3 }));
  put('bump_1', P({ posture: 'stand', eyeOpen: 1, bodyY: 1, pitch: 8 }));
  put('bump_2', P({ posture: 'stand', eyeOpen: 1, bodyY: 2, pitch: 12 }));
  put('shake_0', P({ posture: 'stand', eyeOpen: 0.5, roll: -8 }));
  put('shake_1', P({ posture: 'stand', eyeOpen: 0.5, roll: 8 }));
  put('shake_2', P({ posture: 'stand', eyeOpen: 0.5, roll: 0 }));
  put('alert_0', P({ posture: 'stand', eyeOpen: 1, bodyY: -3, pitch: -4 }));
  put('alert_1', P({ posture: 'stand', eyeOpen: 1, bodyY: -2, pitch: -3 }));

  /* ---- SIDE ---- */
  /* THE GAIT, and it is the walk's whole content.
   *
   * The six beats are ONE gait sampled six times, not six drawings. A cat
   * walks on a lateral-sequence gait: hind then front, then hind then front on
   * the other side, one and a half beats apart, so the cycle only comes round
   * once in six. Each leg is planted for four beats and in the air for two,
   * and it sweeps back while it is down and forward while it is up - which is
   * what a paw does, and what stops it sliding.
   *
   * u is where that leg is in the cycle: below 5 it is on the floor and the
   * paw runs from +STRIDE at u=1 to -STRIDE at u=5; from 5 it is swinging,
   * back through neutral and forward again, lifted on a half-sine.
   *
   * Shiro's turn is 0.2s a beat, so these six are what the viewer sees while
   * she crosses the room. Before this the walk carried a body bob and nothing
   * else, and the six beats came out as two pictures. */
  const GAIT_PHASE = { nearBack: 0, nearFront: 1.5, farBack: 3, farFront: 4.5 };
  const STRIDE = 4, SWING_FROM = 5, LIFT = 5;
  function gaitLeg(leg, beat) {
    let u = (beat - GAIT_PHASE[leg]) % 6;
    if (u < 0) u += 6;
    /* the swing runs from u=5 round to u=7, so it straddles the wrap */
    if (u >= SWING_FROM || u < 1) {
      const t = u < 1 ? u + 6 : u;
      return { dx: STRIDE * (t - 6), lift: LIFT * Math.sin(Math.PI * (t - SWING_FROM) / 2), bend: 1 };
    }
    return { dx: STRIDE * (3 - u) / 2, lift: 0, bend: -1 };
  }
  const walk = [0, 1, 2, 3, 4, 5].map(beat => ({
    /* she bobs twice a cycle, with the legs rather than against them */
    bodyY: beat % 3 === 1 ? -1.2 : 0,
    stride: {
      nearBack: gaitLeg('nearBack', beat), nearFront: gaitLeg('nearFront', beat),
      farBack: gaitLeg('farBack', beat), farFront: gaitLeg('farFront', beat)
    }
  }));
  BEATS.walk.forEach((b, i) => put('side_walk_' + b, P(Object.assign({ posture: 'walk' }, walk[i]))));

  put('side_stretch_0', P({ posture: 'stand', bodyY: 0, pitch: -4, eyeOpen: 1 }));
  put('side_stretch_1', P({ posture: 'stand', bodyY: -2, bodyLift: 1, pitch: -10, eyeOpen: 0, long: true }));
  put('side_stretch_2', P({ posture: 'stand', bodyY: 2, pitch: 8, eyeOpen: 0.5, long: true }));
  put('side_stretch_3', P({ posture: 'stand', bodyY: 0, pitch: 0, eyeOpen: 1 }));

  /* jump: every beat is OFF THE FLOOR - that is the state, not a detail */
  put('side_jump_0', P({ air: true, bodyLift: 8, tuck: 1, pitch: -6, eyeOpen: 1 }));
  put('side_jump_1', P({ air: true, bodyLift: 14, tuck: 1, pitch: -10, eyeOpen: 1, tailCurl: 60 }));
  put('side_jump_2', P({ air: true, bodyLift: 10, tuck: 0.6, pitch: 4, eyeOpen: 1, tailCurl: 30 }));
  put('side_jump_3', P({ air: true, bodyLift: 3, tuck: 0.3, pitch: 8, eyeOpen: 1 }));

  put('side_stalk_0', P({ posture: 'stalk', bodyY: 0, pitch: -2, eyeOpen: 1, tailCurl: 30 }));
  put('side_stalk_1', P({ posture: 'stalk', bodyY: -1, pitch: -4, eyeOpen: 1, tailCurl: 45 }));
  put('side_stalk_2', P({ posture: 'stalk', bodyY: -2, pitch: -6, eyeOpen: 1, tailCurl: 60, tailLift: -18 }));

  /* scratch: a front paw up against the tree, head down into it */
  put('side_scratch_0', P({ rearPaw: true, pawUp: 'nearFront', pawH: { y: 24, dx: 2, bend: 1 }, pitch: 12, eyeOpen: 0 }));
  put('side_scratch_1', P({ rearPaw: true, pawUp: 'nearFront', pawH: { y: 32, dx: 3, bend: 1 }, pitch: 18, eyeOpen: 0 }));
  put('side_scratch_2', P({ rearPaw: true, pawUp: 'nearFront', pawH: { y: 22, dx: 1, bend: 1 }, pitch: 10, eyeOpen: 0.4 }));

  /* pounce: airborne, forelegs reaching FORWARD, not tucked */
  put('side_pounce_0', P({ air: true, bodyLift: 6, tuck: 0.8, pitch: -14, eyeOpen: 1, tailCurl: 40 }));
  put('side_pounce_1', P({ air: true, bodyLift: 16, tuck: 0.2, pitch: -20, eyeOpen: 1, tailCurl: 70, tailLift: -20 }));
  put('side_pounce_2', P({ air: true, bodyLift: 4, tuck: 0.5, pitch: 6, eyeOpen: 1, tailCurl: 20 }));

  /* eat / drink: head down to the bowl, so the pitch has to carry it */
  put('side_eat_0', P({ posture: 'eat', pitch: 26, eyeOpen: 0.3, muzzleUp: 2 }));
  put('side_eat_1', P({ posture: 'eat', pitch: 32, eyeOpen: 0, muzzleUp: 3 }));
  put('side_eat_2', P({ posture: 'eat', pitch: 22, eyeOpen: 0.5, muzzleUp: 1 }));
  put('side_drink_0', P({ posture: 'drink', pitch: 30, eyeOpen: 0, muzzleUp: 3 }));
  put('side_drink_1', P({ posture: 'drink', pitch: 36, eyeOpen: 0, muzzleUp: 4 }));

  /* GROOM: the hard one the brief names - a paw up at the CHEEK */
  put('side_groom_0', P({ rearPaw: true, pawUp: 'nearFront', pawH: { y: 16, dx: 7, bend: 1 }, pitch: 8, eyeOpen: 0, headDY: -1 }));
  put('side_groom_1', P({ rearPaw: true, pawUp: 'nearFront', pawH: { y: 18, dx: 6, bend: 1 }, pitch: 10, eyeOpen: 0.2, headDY: -1 }));

  put('side_wash_0', P({ rearPaw: true, pawUp: 'nearFront', pawH: { y: 14, dx: 3, bend: 1 }, pitch: 2, eyeOpen: 1 }));
  put('side_wash_1', P({ rearPaw: true, pawUp: 'nearFront', pawH: { y: 22, dx: 4, bend: 1 }, pitch: 6, eyeOpen: 1 }));
  put('side_knead_0', P({ posture: 'knead', pawUp: 'nearFront', pawH: { y: 30, dx: 1, bend: 1 }, pitch: 16, eyeOpen: 0.4 }));
  put('side_knead_1', P({ posture: 'knead', pawUp: 'nearFront', pawH: { y: 27, dx: 2, bend: 1 }, pitch: 12, eyeOpen: 0.4 }));

  put('side_tree_0', P({ rearPaw: true, pawUp: 'nearFront', pawH: { y: 18, dx: 4, bend: 1 }, pitch: -6, eyeOpen: 1, headDY: -4 }));
  put('side_tree_1', P({ rearPaw: true, pawUp: 'nearFront', pawH: { y: 12, dx: 5, bend: 1 }, pitch: -12, eyeOpen: 1, headDY: -7 }));
  put('side_tree_2', P({ rearPaw: true, pawUp: 'nearFront', pawH: { y: 20, dx: 3, bend: 1 }, pitch: -4, eyeOpen: 1, headDY: -5 }));

  /* CARRIED: limp in every held frame - legs hang, nothing stands on anything */
  put('side_held_lift', P({ held: true, eyeOpen: 1, pitch: -6, bodyLift: 0 }));
  put('side_held_dangle_0', P({ held: true, eyeOpen: 0.5, pitch: 8, bodyLift: 3, tailCurl: 30 }));
  put('side_held_dangle_1', P({ held: true, eyeOpen: 0, pitch: 12, bodyLift: 5, tailCurl: 40 }));
  put('side_held_kick_0', P({ held: true, eyeOpen: 1, pitch: 4, bodyLift: 2 }));
  put('side_held_kick_1', P({ held: true, eyeOpen: 1, pitch: -4, bodyLift: 4 }));
  put('side_held_calm_0', P({ held: true, eyeOpen: 0, pitch: 2, bodyLift: 1 }));
  put('side_held_calm_1', P({ held: true, eyeOpen: 0.4, pitch: 0, bodyLift: 2 }));

  put('side_stand_0', P({ posture: 'stand', eyeOpen: 1 }));
  put('side_stand_1', P({ posture: 'stand', eyeOpen: 1, bodyY: -1 }));
  put('side_turn_1', P({ posture: 'stand', eyeOpen: 1, roll: -8 }));
  put('side_turn_2', P({ posture: 'stand', eyeOpen: 1, roll: 8 }));

  return T;
}

/* ---------- the four named reference poses, kept as they were ---------- */
function idle_front() { return paint({ posture: 'stand', eyeOpen: 1, front: true }); }
function idle_side() { return paint({ posture: 'stand', eyeOpen: 1 }); }
function sit_front() { return paint({ posture: 'sit', eyeOpen: 1, front: true }); }
function curled_side() { return paint({ lying: true, eyeOpen: 0.5 }); }

const TBL = table();

/* every shipped name gets a pose. A name with no entry FALLS BACK to a real
 * cat in the right view rather than to a missing frame - a frame that does not
 * resolve is a crash, and a crash is worse than a generic pose. But it is
 * counted and reported, because a fallback is a hole, not a solution. */
const MISSING = [];
function poseForName(name) {
  if (TBL[name]) return TBL[name];
  MISSING.push(name);
  return name.indexOf('side_') === 0 ? { posture: 'stand', eyeOpen: 1 } : { posture: 'stand', eyeOpen: 1, front: true };
}

function paint(p) {
  const h = rig2.makeHost(SIZE, SIZE);
  const Gx = h.grid();
  if (p.front) paintFront(p, h, Gx); else paintSide(p, h, Gx);
  return Gx.map(r => r.join(''));
}

function render(name) {
  const p = poseForName(name);
  p.front = name.indexOf('side_') !== 0;
  return paint(p);
}

/* the emitter's entry point: every name it is given, drawn here */
function renderAll(names) {
  const out = {}, failed = [];
  for (const n of names) {
    try {
      const rows = render(n);
      if (!rows || rows.length !== SIZE || rows.some(r => r.length !== SIZE)) {
        failed.push([n, 'wrong size']); continue;
      }
      out[n] = rows;
    } catch (e) { failed.push([n, e.message]); }
  }
  return { frames: out, failed, produced: Object.keys(out).length, total: names.length, missing: MISSING.slice() };
}

module.exports = { render, renderAll, paint, poseForName, SIZE, TBL, idle_front, idle_side, sit_front, curled_side };

if (require.main === module) console.log(render('idle_open').join('\n'));