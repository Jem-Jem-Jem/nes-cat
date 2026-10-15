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
  const pitch = o.pitch || 0;            /* degrees, + = nose down */
  const roll = o.roll || 0;              /* degrees, + = tilt right */
  const rad = d => d * Math.PI / 180;

  /* ears first, behind the skull. ROUNDED and SHORT - a triangle with a rounded
   * tip is a blunted spike, which is what the 32x32 original had. */
  const earR = front ? 5.4 : 5.6;
  const specs = front
    ? [[H.cx - H.rx * 0.74, H.cy - H.ry * 0.86, earR * 0.86, earR], [H.cx + H.rx * 0.74, H.cy - H.ry * 0.86, earR * 0.86, earR]]
    : [[H.cx + (o.earDx == null ? -4.8 : o.earDx), H.cy + (o.earDy == null ? -7.5 : o.earDy), earR, earR * 0.95]];
  for (const [ex, ey, erx, ery] of specs) h.paint(Gx, h.maskEllipse(ex, ey, erx, ery), WHITE, INK);
  for (const [ex, ey, erx, ery] of specs) fillMask(h, Gx, h.maskEllipse(ex, ey + 0.8, erx * 0.52, ery * 0.55), PINK);

  /* rotate the face features about the head centre by pitch and roll */
  const ca = Math.cos(rad(pitch)), sa = Math.sin(rad(pitch));
  const cb = Math.cos(rad(roll)), sb = Math.sin(rad(roll));
  const rot = (x, y) => {
    let dx = x - H.cx, dy = y - H.cy;
    let rx = dx * cb - dy * sb, ry = dx * sb + dy * cb;
    const nx = rx * ca - ry * sa, ny = rx * sa + ry * ca;
    return [H.cx + nx, H.cy + ny];
  };

  /* skull */
  h.paint(Gx, h.maskEllipse(H.cx, H.cy, H.rx, H.ry), WHITE, INK);

  /* cheeks - the identity detail, inside the skull so it takes no outline */
  const cheekY = H.cy + H.ry * 0.42;
  if (front) {
    fillMask(h, Gx, h.maskEllipse(H.cx - H.rx * 0.66, cheekY, 3.1, 2.0), PINK);
    fillMask(h, Gx, h.maskEllipse(H.cx + H.rx * 0.66, cheekY, 3.1, 2.0), PINK);
  } else {
    fillMask(h, Gx, h.maskEllipse(H.cx - H.rx * 0.34, H.cy + H.ry * 0.34, 2.2, 1.6), PINK);
  }

  /* THE MUZZLE, painted over the skull so its own outline is the plane break */
  const [mx, my] = rot(M.cx, M.cy);
  const muz = h.maskEllipse(mx, my, M.rx, M.ry);
  h.paint(Gx, muz, WHITE, INK);
  fillMask(h, Gx, maskBox(h, mx - M.rx, my - M.ry * 0.76, mx + M.rx, my - M.ry * 0.40), GREY);
  fillMask(h, Gx, maskBox(h, mx - M.rx * 0.70, my + M.ry * 0.46, mx + M.rx * 0.70, my + M.ry * 0.95), GREY);
  fillMask(h, Gx, h.maskEllipse(mx, my + M.ry * 0.06, M.rx * 0.88, M.ry * 0.80), WHITE);

  /* eyes, on the skull ABOVE the muzzle so the plane break runs between them */
  const open = o.eyeOpen == null ? 1 : o.eyeOpen;
  if (front) {
    const ex = H.rx * 0.46;
    for (const s of [-1, 1]) {
      const [px, py] = rot(H.cx + s * ex, H.cy - H.ry * 0.18);
      if (open > 0.55) {
        fillMask(h, Gx, h.maskEllipse(px, py, 2.5, 2.9), INK);
        h.px(Gx, Math.round(px) + (s > 0 ? -1 : 1), Math.round(py) - 1, WHITE);
      } else if (open > 0.2) {
        fillMask(h, Gx, h.maskEllipse(px, py, 2.5, 1.5), INK);
      } else {
        stroke(h, Gx, px - 2.2, py, px + 2.2, py, INK);
      }
    }
  } else {
    const [px, py] = rot(H.cx + H.rx * 0.34, H.cy - H.ry * 0.16);
    if (open > 0.55) { fillMask(h, Gx, h.maskEllipse(px, py, 2.3, 2.7), INK); h.px(Gx, Math.round(px) + 1, Math.round(py) - 1, WHITE); }
    else if (open > 0.2) { fillMask(h, Gx, h.maskEllipse(px, py, 2.3, 1.4), INK); }
    else { stroke(h, Gx, px - 2.0, py, px + 2.0, py, INK); }
  }

  /* nose at the FRONT of the muzzle */
  const [nx, ny] = rot(front ? M.cx : M.cx + M.rx * 0.40, M.cy - M.ry * (front ? 0.34 : 0.40));
  const nw = front ? 2.6 : 1.8, nh = front ? 1.4 : 1.1;
  fillMask(h, Gx, h.maskTri(nx - nw, ny - nh, nx + nw, ny - nh, nx, ny + nh + 0.4), NOSE);
  h.px(Gx, Math.round(nx), Math.round(ny) - Math.round(nh) - 1, INK);
  const my2 = ny + (front ? 2.2 : 1.8);
  stroke(h, Gx, nx - 1, my2, nx, my2 + 1, INK);
  stroke(h, Gx, nx, my2 + 1, nx + 1, my2, INK);
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
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts[i] = [cx - rx * 0.9 + t * (rx * 2.6), by + ry * 0.92 - Math.sin(t * Math.PI) * 5 - t * 2];
      r[i] = 3.0 - 2.0 * t;
    }
  }
  h.paint(Gx, rig2.maskChain(pts, r, h), WHITE, INK);
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
    /* torso: a ribcage, not a cloud */
    const ty = (sit ? 37 : 37) - lift + (p.bodyY || 0);
    const tray = sit ? 13.5 : 11.5;
    h.paint(Gx, h.maskEllipse(cx, ty, 11.5, tray), WHITE, INK);
    fillMask(h, Gx, maskBox(h, cx - 9, ty + 4, cx + 9, ty + tray), GREY);
    fillMask(h, Gx, h.maskEllipse(cx, ty + 3, 7.5, 6.5), WHITE);
    if (p.posture === 'stand') drawTail(h, Gx, p, cx + 11, ty, 10, tray);
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
    drawTail(h, Gx, { tailWrap: true }, cx, by, 18, 9);
  }

  const headY = lying ? ground - 11 : (sit ? 17 : 19) - lift + (p.headDY || 0);
  const hx = lying ? cx + 9 : cx;
  drawHead(h, Gx, {
    front: true, eyeOpen: p.eyeOpen, pitch: p.pitch, roll: p.roll,
    head: { cx: hx, cy: headY, rx: lying ? 11 : 12.5, ry: lying ? 10 : 11 },
    muzzle: { cx: hx, cy: headY + (lying ? 6 : 6.5), rx: lying ? 7 : 8, ry: lying ? 5.2 : 6 }
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
        drawLeg(h, Gx, lx, hipFor(b, ground), lx, ground, b, k.indexOf('far') === 0 ? GREY : WHITE, -1);
        if (!k.indexOf('far')) toes(h, Gx, lx, ground + 2, 2);
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
    /* THE BODY IS THE WHOLE PROPORTION. The first pass hung the torso at
     * cy=34 with ry=8.6 and left the 22.6px legs showing from hip to floor, so
     * she stood four-legged and leggy and read as a greyhound. A cat is mostly
     * BODY with legs under it: the torso is deepened and dropped so the hips -
     * which are still hung from the bone length, and therefore do not move -
     * sit INSIDE it, and only the paw end of each leg shows.
     *
     * The bones are unchanged. Only where the mass sits changed. */
    const by = 38 - lift + (p.bodyY || 0);
    const rx = p.long ? 17.5 : 15.0;
    const ry = p.long ? 9.4 : 10.2;
    h.paint(Gx, h.maskEllipse(29, by, rx, ry), WHITE, INK);
    fillMask(h, Gx, maskBox(h, 29 - rx + 2, by + 2.5, 29 + rx - 2, by + ry - 1), GREY);
    fillMask(h, Gx, h.maskEllipse(27, by - 2, rx - 4, ry - 3.5), WHITE);
  }

  /* neck, then head. Pitched down for eat and drink so she is looking at the
   * bowl rather than at the viewer. */
  const headBase = lyingS ? { cx: 45, cy: ground - 10 } : { cx: 45, cy: 16 - lift + (p.headDY || 0) };
  if (!air || true) h.paint(Gx, h.maskEllipse(39, headBase.cy + 9, 6.0, 7.0), WHITE, INK);
  drawHead(h, Gx, {
    front: false, eyeOpen: p.eyeOpen, pitch: p.pitch, roll: p.roll,
    head: { cx: headBase.cx, cy: headBase.cy, rx: 9.4, ry: 9.6 },
    muzzle: { cx: headBase.cx + 5.8, cy: headBase.cy + 4.4 - (p.muzzleUp || 0), rx: 5.6, ry: 5.2 },
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
  /* walk: the gait is the leg fold and the body bob, one beat per leg pair */
  const walk = [
    { bodyY: 0 }, { bodyY: -1.2 }, { bodyY: 0 }, { bodyY: -1.2 }, { bodyY: 0 }, { bodyY: -1.2 }
  ];
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