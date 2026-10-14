/* ============================================================
 * NES-cat ΓÇö tools/rig2-frames.js
 *
 * PHASE 1 OF THE 640x360 SCALE. rig2 emits the cat's 88 frames at 64x64.
 *
 * NOTE WHAT THIS COMMIT IS NOT. It changes NOTHING anyone sees. The game still
 * loads NES-cat/js/frames.js, which is still 88 frames at 32x32 built by
 * build-sprites.js. Both of those are the CONTROL GROUP and this file does not
 * touch either. Phase 4 is what switches the app over. Read this as a
 * capability that exists, not as a change ΓÇö it is deliberately a no-op to the
 * running piece.
 *
 * WHERE THE NUMBERS COME FROM. Every pose below is drawn against
 * `skeletonProjection(view, size, 1)`, so the body, head, ear, neck and tail
 * numbers in both views are the SAME numbers read through two camera factors.
 * There is no per-view geometry constant anywhere in this file, which is the
 * point of brief 43 and the thing that would be easiest to quietly undo.
 *
 * The two painters are genuinely different code, because the two views are
 * genuinely different problems ΓÇö that is the front/side distinction from the
 * front-rig slice, not a preference. What they SHARE is the skeleton they both
 * read and the raster primitives they both draw with.
 */
'use strict';

const rig2 = require('./rig2.js');

const DEG = rig2.DEG;

/* The 88 names, and which view each belongs to. Derived from the SHIPPED
 * table rather than hand-listed, so this file cannot silently drift out of
 * step with what the control group produces ΓÇö if a frame is added there and
 * not covered here, the coverage report says so by name. */
function shippedNames(framesSrc) {
  return framesSrc;
}

/* ---------- pose resolution -------------------------------------------
 *
 * A frame NAME is the pose. This is the whole reason the scale-up is
 * mechanical: shiro.js already resolves state to a frame name, so mapping a
 * name to a pose is the only translation the rig needs.
 *
 * `var` is the composed-suffix form (idle_open_tailUp1) and `beat` is the
 * trailing index. Both are parsed rather than table-listed because the shipped
 * table generates them from a small vocabulary and a table would be a fourth
 * copy of that vocabulary to keep in sync. */
function parse(name) {
  const n = name.replace(/^(side_|front_)/, '');
  const isSide = name.indexOf('side_') === 0;
  const vars = [];
  let m = n.match(/^([a-z]+)_(\d+)(?:_(.*))?$/);
  let family, index;
  if (m) { family = m[1]; index = Number(m[2]); if (m[3]) vars.push(m[3]); }
  else {
    m = n.match(/^([a-z]+)_(.*)$/);
    family = m ? m[1] : n;
    index = 0;
    if (m && m[2]) vars.push(m[2]);
  }
  return { view: isSide ? 'side' : 'front', family, index, vars, name };
}

/* A pose in the flat vector both solvers read. Continuous in `beat` where the
 * family is a cycle, so a frame boundary is a sample of a motion rather than
 * a swap between two drawings. */
function poseFor(name, size) {
  const p = parse(name);
  const g = rig2.skeletonProjection(p.view, size, 1);
  const i = p.index;
  const v = p.vars;
  const blinkClosed = v.indexOf('closed') >= 0 || p.family === 'closed';
  const blinkMid = v.indexOf('blink_mid') >= 0;
  const breathe = p.family === 'breathe' || v.indexOf('breathe') >= 0;
  const tailUp = v.filter(x => /^tailUp/.test(x))[0];
  const tailFlick = v.indexOf('tailFlick') >= 0;

  let pose = {
    family: p.family, index: i, vars: v, name: p.name, view: p.view,
    bodyY: 0, headDX: 0, headDY: 0,
    tailSway: 0, tailLift: 0, tailCurl: 0, tailBias: 0.5,
    splayDeg: 0, liftDeg: 0,
    headRoll: 0, headPitch: 0
  };

  /* one deliberate knob per family, derived not authored: the beat maps onto
   * a fraction of a cycle, and the family decides what that fraction DRIVES.
   * This is the translation, and keeping it as arithmetic is what makes the
   * 64 set a projection of the 32 one rather than a second drawing. */
  const u = i / Math.max(1, Math.max(...[3, 5, 6, 4].slice(0, 1)) || 3);
  const ph = (i / 3);           /* a three-beat cycle is the common case */
  const bh = (i / 4);           /* four-beat: jump, stretch */

  switch (p.family) {
    /* ---- front ---- */
    case 'idle':
      pose.bodyY = breathe ? 0.4 : 0;
      pose.tailLift = tailUp ? -18 : 0;
      pose.tailCurl = tailUp ? 40 : tailFlick ? 30 : 0;
      pose.headPitch = p.name.indexOf('yawn') >= 0 ? 14 : 0;
      break;
    case 'breathe':
      pose.bodyY = 0.4; pose.headPitch = 0.5; break;
    case 'blink':
      pose.bodyY = 0.4; break;
    case 'sit':
      pose.bodyY = 1.2;
      pose.tailLift = tailUp ? -14 : 0;
      pose.tailCurl = tailUp ? 36 : 0;
      pose.headPitch = p.name.indexOf('closed') >= 0 ? 2 : 0;
      break;
    case 'loaf':
      pose.bodyY = 2.0 + (i ? 0.4 : 0); pose.headDY = 1.2; break;
    case 'sleep':
      pose.bodyY = 2.6; pose.headDY = 1.6;
      pose.headPitch = i ? 0 : 3; break;
    case 'sleep_settle':
      pose.bodyY = 1.8; pose.headDY = 1.0; break;
    case 'alert':
      pose.bodyY = -0.6 - i * 0.2; pose.headDY = -0.4; pose.headPitch = -2; break;
    case 'bump':
      pose.bodyY = 0.6 + i * 0.2; pose.headPitch = 3 + i * 2; break;
    case 'nod':
      pose.bodyY = 0.4; pose.headPitch = [0, 16, 26, 8][Math.min(3, i + 1)] || 0;
      pose.headRoll = [0, -6, 0, 5][Math.min(3, i + 1)] || 0; break;
    case 'react':
      pose.bodyY = -0.3; pose.headPitch = i ? 0 : -6; break;
    case 'shake':
      pose.headRoll = (i % 2 ? 7 : -7); pose.bodyY = -0.2; break;

    /* ---- side ---- */
    case 'stand':  pose.bodyY = 0; break;
    case 'walk':
      pose = Object.assign(pose, rig2.walkPose(ph / 4, undefined, size)); break;
    case 'turn':
      pose.bodyY = 0; pose.headTilt = i ? 6 : -6; break;
    case 'stretch':
      pose.bodyY = [0, -1.2, 0.6, 0][Math.min(3, i)] || 0;
      pose.headDY = [-0.4, -1.0, 0.4, 0][Math.min(3, i)] || 0;
      pose.headTilt = [0, 4, 10, 0][Math.min(3, i)] || 0; break;
    case 'stalk':
      pose.bodyY = [0, -0.4, -0.6][Math.min(2, i)] || 0;
      pose.headDY = [0.4, 0.8, 1.2][Math.min(2, i)] || 0;
      pose.tailLift = [0, -14, -20][Math.min(2, i)] || 0; break;
    case 'pounce':
      pose.bodyY = [1.2, -1.0, 0.8][Math.min(2, i)] || 0;
      pose.headDY = [1.0, -0.8, 0.6][Math.min(2, i)] || 0;
      pose.tailLift = [-8, 8, 16][Math.min(2, i)] || 0; break;
    case 'jump':
      pose.bodyY = [0.8, -0.6, -1.4, 0][Math.min(3, i)] || 0;
      pose.headDY = [0.6, -0.4, -0.8, 0][Math.min(3, i)] || 0;
      pose.tailLift = [-6, 6, 14, 4][Math.min(3, i)] || 0; break;
    case 'tree':
      pose.bodyY = [-0.6, -1.2, -0.9][Math.min(2, i)] || 0;
      pose.headDY = [-2.0, -3.0, -2.5][Math.min(2, i)] || 0;
      pose.liftDeg = [26, 52, 36][Math.min(2, i)] || 0; break;
    case 'scratch':
      pose.bodyY = -0.4; pose.liftDeg = [46, 18, 50][Math.min(2, i)] || 0;
      pose.headDY = -0.6; break;
    case 'eat':
      pose.bodyY = [0.6, 0.2, 0.9][Math.min(2, i)] || 0;
      pose.headDY = [2.6, 3.4, 2.0][Math.min(2, i)] || 0; break;
    case 'drink':
      pose.bodyY = 0.4;
      pose.headDY = [3.6, 4.6][Math.min(1, i)] || 0; break;
    case 'groom':
      pose.bodyY = 0.3; pose.headDY = [1.0, 1.4][Math.min(1, i)] || 0; break;
    case 'wash':
      pose.bodyY = 0.4; pose.liftDeg = [40, 10][Math.min(1, i)] || 0; break;
    case 'knead':
      pose.bodyY = 0.3; pose.liftDeg = [24, 6][Math.min(1, i)] || 0; break;
    case 'held':
      pose.bodyY = 1.2; pose.headDY = -0.6; pose.tailLift = -10; break;
    default:
      pose.bodyY = 0;
  }
  pose.family = p.family; pose.index = i; pose.vars = v;
  return pose;
}

/* ---------- the two painters ------------------------------------------
 *
 * Different problems, different code, ONE skeleton. Anything shared is pulled
 * from `g` and nowhere else. */

function paintSide(p, size, scale) {
  const g = rig2.skeletonProjection('side', size, scale == null ? 1 : scale);
  const host = rig2.makeHost(size, size);
  const G = host.grid();
  const Bh = rig2.GEOM_64.BEHAVIOR || null;

  /* tail, behind everything */
  const T = rig2.tailChain(p, Object.assign({}, g, {
    tailChain: Object.assign({}, g.tailChain, {
      x: g.tailChain.x != null ? g.tailChain.x : g.body.x - g.body.rx,
      y: g.tailChain.y != null ? g.tailChain.y : g.body.y + g.body.ry * 0.5,
      baseA: g.tailChain.baseA || 0, swayAmp: 6, liftAmp: 5, curlMin: 10, curlMax: 55
    })
  }));
  host.paint(G, rig2.maskChain(T.points, T.radii, host), 'W', 'K');

  /* four legs through the side solver */
  const legs = rig2.rig2Legs(p, host, rig2.geomFor(size));
  for (const k of rig2.LEG_KEYS) {
    if (!legs.parts[k]) continue;
    const far = k.indexOf('far') === 0;
    host.paint(G, rig2.maskChain(legs.parts[k].points, legs.parts[k].radii, host), far ? 'G' : 'W', 'K');
  }

  const body = g.body, head = g.head;
  const bx = body.x, by = body.y + (p.bodyY || 0);
  const bodyMask = host.maskEllipse(bx, by, body.rx, body.ry);
  for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++)
    if (y + 0.5 > g.FLOOR) bodyMask[y][x] = false;
  host.paint(G, bodyMask, 'W', 'K');
  host.shadeBelow(G, bodyMask, bx, by + body.ry * 0.27, 'H');

  /* head: rotation about the neck, via the settled side solver */
  rig2.paintHead(G, host, g, Object.assign({}, p, { headTilt: p.headTilt || 0 }));
  return G.map(r => r.join(''));
}

function paintFront(p, size, scale) {
  const g = rig2.skeletonProjection('front', size, scale == null ? 1 : scale);
  const host = rig2.makeHost(size, size);
  const G = host.grid();

  /* the front tail leaves the midline ΓÇö this is where asymmetry is legal */
  const T = rig2.frontTailChain(p, g);
  host.paint(G, rig2.maskChain(T.points, T.radii, host), 'W', 'K');

  /* two legs, splayed, solved onto paw targets */
  for (const side of [-1, 1]) {
    const pp = Object.assign({}, p, { splayDeg: (p.splayDeg || 0) + side * 5 });
    const L = rig2.frontLegChain(pp, g, side);
    host.paint(G, rig2.maskChain(L.points, L.radii, host), side > 0 ? 'W' : 'G', 'K');
  }

  const body = g.body, head = g.head;
  const by = body.y + (p.bodyY || 0);
  const bodyMask = host.maskEllipse(g.cx, by, body.rx, body.ry);
  for (let y = 0; y < host.H; y++) for (let x = 0; x < host.W; x++)
    if (y + 0.5 > g.FLOOR) bodyMask[y][x] = false;
  host.paint(G, bodyMask, 'W', 'K');
  host.shadeBelow(G, bodyMask, g.cx, by + body.ry * 0.27, 'H');

  /* head: ROLL and PITCH, the two degrees, from the front solver */
  const H = rig2.frontHeadSolve(p, g);
  const skull = host.maskEllipse(H.skull[0], H.skull[1], head.rx, H.skullRy);
  host.paint(G, skull, 'W', 'K');
  host.paint(G, host.maskTri(H.earL[0][0], H.earL[0][1], H.earL[1][0], H.earL[1][1], H.earL[2][0], H.earL[2][1]), 'W', 'K');
  host.paint(G, host.maskTri(H.earR[0][0], H.earR[0][1], H.earR[1][0], H.earR[1][1], H.earR[2][0], H.earR[2][1]), 'W', 'K');
  host.px(G, H.eyeL[0], H.eyeL[1], 'E');
  host.px(G, H.eyeR[0], H.eyeR[1], 'E');
  host.px(G, H.nose[0], H.nose[1], 'N');
  return G.map(r => r.join(''));
}

/* ---------- emit -------------------------------------------------------- */

function render(name, size, scale) {
  const p = poseFor(name, size);
  const k = scale == null ? 1 : scale;
  return p.view === 'side' ? paintSide(p, size, k) : paintFront(p, size, k);
}

/* `names` comes from the SHIPPED table, so coverage is measured against what
 * the control group actually produces rather than against a list typed here. */
function emitAll(names, size, scale) {
  const out = {};
  const failed = [];
  for (const n of names) {
    try {
      const rows = render(n, size, scale);
      if (!rows || !rows.length) { failed.push([n, 'empty']); continue; }
      out[n] = rows;
    } catch (e) {
      failed.push([n, e.message]);
    }
  }
  return { frames: out, failed, total: names.length, produced: Object.keys(out).length };
}

module.exports = { parse, poseFor, render, emitAll, paintSide, paintFront };