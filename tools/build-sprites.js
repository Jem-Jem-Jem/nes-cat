/* ============================================================
 * NES-cat — tools/build-sprites.js   (authoring tool, Node)
 *
 * Builds the literal 32x32 pixel-frame rows for Shiro and writes
 * them to NES-cat/js/frames.js as plain data (rows of chars).
 *
 * Why a tool: hand-typing 32x32 grids is error-prone. This keeps
 * the shapes parametric and reproducible, while the *shipped*
 * frames stay literal, diffable data (see spec §8).
 *
 *   node tools/build-sprites.js --preview   # print frames as ASCII
 *   node tools/build-sprites.js --build     # write frames.js
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
function maskOr(a, b) {
  const m = emptyMask();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y][x] = a[y][x] || b[y][x];
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
  /* Symmetric: shade every interior W cell below `from`. */
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
  // open: 2x3 oval with a highlight
  [[11, 12], [19, 20]].forEach(([a, b]) => {
    for (let yy = y - 1; yy <= y + 1; yy++) { px(G, a + look, yy, 'E'); px(G, b + look, yy, 'E'); }
  });
  px(G, 11 + look, y - 1, 'W');
  px(G, 20 + look, y - 1, 'W');
}

function face(G, dy) {
  const y = 11 + dy;
  // nose (2px, centred on the mirror line at x=15.5)
  px(G, 15, y + 3, 'N'); px(G, 16, y + 3, 'N');
  // mouth  w
  px(G, 14, y + 4, 'M'); px(G, 15, y + 5, 'M');
  px(G, 17, y + 4, 'M'); px(G, 16, y + 5, 'M');
  // blush
  px(G, 9, y + 2, 'B'); px(G, 10, y + 2, 'B');
  px(G, 21, y + 2, 'B'); px(G, 22, y + 2, 'B');
}

/* ---------- the cat ------------------------------------------------- */

function buildCat(o) {
  o = Object.assign({
    bodyDY: 0, headDY: 0, squash: 0, tailSway: 0, earPerk: 0,
    eyes: 'open', legPhase: 0, sleep: false, look: 0
  }, o);

  const G = grid();
  /* The pixel grid spans continuum [0,32), so its mirror line is x = 16 and
   * pixel i mirrors to pixel 31-i. Keep every shape centred on 16. */
  const cx = 16;

  /* Layout note: the silhouette is sized so body/paws/tail bottom out at
   * row 29-30, leaving row 31 free. Never let art touch the last row or it
   * reads as clipped (there is no room for the bottom outline). */

  /* tail (behind body) */
  stampCurve(G,
    [21, 21 + o.bodyDY * 0.4],
    [27.5 + o.tailSway, 22],
    [24.5 + o.tailSway, 27],
    2.0, 'W', 'K');

  /* body + front paws as ONE silhouette so the outline stays clean
   * (separate outlined paws leave stray lines inside the body). */
  const pA = o.legPhase === 1 ? -1 : 0;
  const pB = o.legPhase === 3 ? -1 : 0;
  /* paws bottom out exactly with the body (y=29.0) so nothing pokes through
   * as a stray single pixel on the row below. */
  const pawL = maskEllipse(11.5, 27.0 + o.bodyDY + pA, 2.6, 2.0);
  const pawR = maskEllipse(20.5, 27.0 + o.bodyDY + pB, 2.6, 2.0);
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

  /* ears (drawn on top so their outline reads) */
  const perk = o.earPerk;
  const earL = maskTri(10.5, 2.0 - perk, 5.2, 9.0, 14.2, 8.0);
  const earR = maskTri(21.5, 2.0 - perk, 26.8, 9.0, 17.8, 8.0);
  paint(G, earL, 'W', 'K');
  paint(G, earR, 'W', 'K');
  const inL = maskTri(10.5, 4.3 - perk, 7.4, 8.2, 13.0, 7.6);
  const inR = maskTri(21.5, 4.3 - perk, 24.6, 8.2, 19.0, 7.6);
  paint(G, inL, 'P', 'P');
  paint(G, inR, 'P', 'P');

  /* features */
  eyes(G, o.eyes, o.headDY, o.look);
  face(G, o.headDY);

  /* shading: bottom half of head + body */
  shadeBelow(G, headMask, cx, 12 + o.headDY, 'H');
  shadeBelow(G, bodyAll, cx, 23 + o.bodyDY, 'H');

  /* leg seam: a deeper shade line between the two front paws */
  [26, 27, 28].forEach(y => {
    if (G[y]) { if (G[y][15] === 'H') G[y][15] = 'G'; if (G[y][16] === 'H') G[y][16] = 'G'; }
  });

  /* paw pads */
  if (!o.sleep) {
    const py = Math.round(27.0 + o.bodyDY);
    px(G, 11, py + pA, 'P'); px(G, 12, py + pA, 'P');
    px(G, 19, py + pB, 'P'); px(G, 20, py + pB, 'P');
  }
  return G.map(r => r.join(''));
}

/* ---------- frame set ----------------------------------------------- */

function frames() {
  const out = {};
  out.idle_open = buildCat({ eyes: 'open' });
  out.idle_closed = buildCat({ eyes: 'closed' });
  out.idle_blink_mid = buildCat({ eyes: 'happy' });
  out.idle_look_left = buildCat({ eyes: 'open', look: -1 });
  out.idle_look_right = buildCat({ eyes: 'open', look: 1 });
  out.idle_breathe = buildCat({ eyes: 'open', headDY: 0.6 });
  out.idle_breathe_closed = buildCat({ eyes: 'closed', headDY: 0.6 });

  out.walk_0 = buildCat({ legPhase: 0, bodyDY: -1, tailSway: 1.0 });
  out.walk_1 = buildCat({ legPhase: 1, bodyDY: 0, tailSway: 1.5 });
  out.walk_2 = buildCat({ legPhase: 2, bodyDY: -1, tailSway: 1.0 });
  out.walk_3 = buildCat({ legPhase: 3, bodyDY: 0, tailSway: 0.5 });

  out.sit_open = buildCat({ eyes: 'open', squash: 0.8 });
  out.sit_closed = buildCat({ eyes: 'closed', squash: 0.8 });

  out.sleep_0 = buildCat({ eyes: 'closed', sleep: true, bodyDY: 1, headDY: 2, squash: 1.0, earPerk: -0.5 });
  out.sleep_1 = buildCat({ eyes: 'closed', sleep: true, bodyDY: 1, headDY: 1.5, squash: 1.4, earPerk: -0.5 });

  out.react_0 = buildCat({ eyes: 'happy', earPerk: 1, bodyDY: -1, squash: -0.4 });
  out.react_1 = buildCat({ eyes: 'open', earPerk: 1, squash: 0 });
  return out;
}

/* ---------- output --------------------------------------------------- */

function toAscii(rows) {
  return rows.map((r, i) => String(i).padStart(2, '0') + ' ' + r).join('\n');
}

const mode = process.argv[2] || '--preview';
const F = frames();

/* Mechanical symmetry check.
 * Exempt: the tail (lower-right, deliberate) and the legs in walk frames
 * (the two front paws alternate, so they are asymmetric on purpose). */
function checkSymmetry() {
  let bad = 0;
  Object.keys(F).forEach(k => {
    const walking = k.indexOf('walk') === 0;
    F[k].forEach((row, y) => {
      for (let x = 0; x < W; x++) {
        if (y >= 19 && Math.max(x, W - 1 - x) >= 21) continue;   /* tail zone (either side) */
        if (walking && y >= 26) continue;                        /* alternating legs */
        if (k.indexOf('look') >= 0) continue;                     /* deliberate eye glance */
        if (row[x] !== row[W - 1 - x]) {
          bad++;
          if (bad <= 12) console.log('ASYM ' + k + ' row ' + y + ' col ' + x + ': ' + row[x] + ' vs ' + row[W - 1 - x]);
        }
      }
    });
  });
  console.log(bad === 0
    ? 'SYMMETRY OK — all ' + Object.keys(F).length + ' frames mirror correctly outside the tail zone'
    : 'SYMMETRY FAIL — ' + bad + ' mismatched cells');
  return bad;
}

if (mode === '--check') {
  process.exit(checkSymmetry() === 0 ? 0 : 1);
} else if (mode === '--build') {
  const lines = [];
  lines.push('/* ============================================================');
  lines.push(' * NES-cat — frames.js');
  lines.push(' * Literal 32x32 pixel frames for Shiro.');
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
  Object.keys(F).forEach(k => {
    console.log('\n=== ' + k + ' ' + '='.repeat(40 - k.length));
    console.log(toAscii(F[k]));
  });
}
