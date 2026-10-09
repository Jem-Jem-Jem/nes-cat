/* ============================================================
 * NES-cat — tools/derive-frames.js
 *
 * Derives extra Shiro frames from the hand-authored base frames in
 * js/frames.js, and writes them to js/frames-extra.js.
 *
 * Why derive instead of hand-author? The idle poses differ only in small
 * localised regions (the tail, the mouth), so the new frames are literally
 * "the base frame with that region redrawn". Deriving keeps them pixel-exact
 * against the base art instead of drifting out of sync.
 *
 *   node tools/derive-frames.js           regenerate js/frames-extra.js
 *   node tools/derive-frames.js --preview print every derived frame as ASCII
 *
 * ============================================================ */
'use strict';

var fs = require('fs');
var path = require('path');

/* --- load the base frames ------------------------------------------------ */
require(path.join(__dirname, '..', 'js', 'frames.js'));
var BASE = globalThis.NESCAT.frames;

var SIZE = 32;
var ORDER = [];          /* [{ name, base }] — preserved in the output header */

/* --- small helpers ------------------------------------------------------- */

function toGrid(rows, label) {
  if (!rows || rows.length !== SIZE) {
    throw new Error(label + ': expected ' + SIZE + ' rows, got ' +
      (rows ? rows.length : 0));
  }
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].length !== SIZE) {
      throw new Error(label + ': row ' + i + ' is ' + rows[i].length +
        ' cols, expected ' + SIZE);
    }
  }
  return rows.map(function (r) {
    return typeof r === 'string' ? r.split('') : r.slice();
  });
}

function toRows(grid) {
  return grid.map(function (r) { return r.join(''); });
}

function clone(name) {
  return toGrid(BASE[name], name);
}

function blank() {
  var g = [];
  for (var r = 0; r < SIZE; r++) g.push(new Array(SIZE).fill('.'));
  return g;
}

/* The tail lives entirely inside this box on every idle pose: the body's
 * right outline stops at column 23, so columns 24+ below the head are tail. */
var TAIL_BOX = { c0: 24, c1: 31, r0: 19, r1: 31 };

function clearTailBox(grid) {
  for (var r = TAIL_BOX.r0; r <= TAIL_BOX.r1; r++) {
    for (var c = TAIL_BOX.c0; c <= TAIL_BOX.c1; c++) grid[r][c] = '.';
  }
}

function isBlank(ch) { return ch === '.' || ch === ' '; }

/**
 * Slide the tail pixels sideways by `dx`, leaving the base of the tail
 * (rows >= keepFrom) welded to her rump so the bend reads as a bend.
 * The cells the tail vacates become outline, so the tail stays drawn rather
 * than leaving a hole in the silhouette.
 */
function bendTail(grid, fromRow, toRow, dx) {
  var out = grid.map(function (r) { return r.slice(); });
  for (var r = fromRow; r <= toRow; r++) {
    var src = [];
    for (var c = TAIL_BOX.c0; c <= TAIL_BOX.c1; c++) src.push(grid[r][c]);
    var dst = new Array(src.length).fill('.');

    for (var i = 0; i < src.length; i++) {
      var from = i - dx;
      if (from >= 0 && from < src.length) dst[i] = src[from];
    }
    /* only weld the vacated cells if this row actually had a tail in it —
     * otherwise we would drop stray outline pixels into empty rows */
    var hasTail = src.some(function (ch) { return !isBlank(ch); });
    if (hasTail) {
      for (var j = 0; j < dx && j < src.length; j++) {
        if (dst[j] === '.') dst[j] = 'K';
      }
    }
    for (var k = 0; k < src.length; k++) out[r][TAIL_BOX.c0 + k] = dst[k];
  }
  return out;
}

/* --- raising the tail ---------------------------------------------------- */

function line(g, x0, y0, x1, y1, ch) {
  /* Bresenham, inclusive of both ends */
  var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  var err = dx + dy;
  for (;;) {
    if (g[y0] && g[y0][x0] !== undefined) g[y0][x0] = ch;
    if (x0 === x1 && y0 === y1) break;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/**
 * Replace the hanging tail with one swept up over her back — the classic
 * "happy cat" silhouette. `curl` swings the tip so two of these can be
 * alternated for a lazy sway while the tail is up.
 *
 * Returns a new grid; the base of the tail (column 24, rows 24-28) still
 * abuts the body outline at column 23, so it never looks detached.
 */
function raiseTail(grid, curl) {
  var out = grid.map(function (r) { return r.slice(); });
  clearTailBox(out);

  var path_ = [
    [24, 28],
    [24, 25],
    [25, 22],
    [26, 20],
    [27, 18],
    [28, 16],
    [29 - curl, 14 - curl],
    [30 - curl, 12 - curl]
  ];

  /* 2px-wide white stroke along the path */
  for (var i = 0; i < path_.length - 1; i++) {
    line(out, path_[i][0], path_[i][1], path_[i + 1][0], path_[i + 1][1], 'W');
    line(out, path_[i][0] + 1, path_[i][1], path_[i + 1][0] + 1, path_[i + 1][1], 'W');
  }
  var last = path_[path_.length - 1];
  out[last[1]][last[0]] = 'W';
  out[last[1]][last[0] + 1] = 'W';

  /* outline: every blank cell touching the stroke becomes K */
  var outline = blank();
  for (var r = 0; r < SIZE; r++) {
    for (var c = 0; c < SIZE; c++) {
      if (out[r][c] !== 'W') continue;
      var near = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (var n = 0; n < near.length; n++) {
        var nc = c + near[n][0], nr = r + near[n][1];
        if (out[nr] && out[nr][nc] !== undefined && isBlank(out[nr][nc])) {
          outline[nr][nc] = 'K';
        }
      }
    }
  }
  for (var r2 = 0; r2 < SIZE; r2++) {
    for (var c2 = 0; c2 < SIZE; c2++) {
      if (outline[r2][c2] === 'K' && isBlank(out[r2][c2])) out[r2][c2] = 'K';
    }
  }
  return out;
}

/** Open mouth: widen the M pixels at rows 15-17 into a proper yawn gape. */
function openMouth(grid) {
  var out = grid.map(function (r) { return r.slice(); });
  [15, 16].forEach(function (r) {
    for (var c = 14; c <= 17; c++) {
      if (isBlank(out[r][c])) continue;   /* never punch through empty space */
      out[r][c] = 'M';
    }
  });
  /* let the gape dip into the chin so it reads as open rather than painted */
  for (var c2 = 15; c2 <= 16; c2++) {
    if (!isBlank(out[17][c2])) out[17][c2] = 'M';
  }
  return out;
}

/* --- the derivation table ----------------------------------------------- */

var out = {};

function add(name, base, grid) {
  var rows = toRows(toGrid(grid, name));   /* validates 32x32 */
  out[name] = rows;
  ORDER.push({ name: name, base: base });
}

/* Tail flick — the tip kicks out while the base stays put. */
['idle_open', 'idle_breathe'].forEach(function (base) {
  add(base + '_tailFlick', base, bendTail(clone(base), 19, 23, 2));
});

/* Tail up — swept over her back, in two curl positions she sways between. */
['idle_open', 'idle_breathe'].forEach(function (base) {
  add(base + '_tailUp0', base, raiseTail(clone(base), 0));
  add(base + '_tailUp1', base, raiseTail(clone(base), 1));
});

/* A yawn, used when she is low on energy and about to nap. */
add('idle_yawn', 'idle_open', openMouth(clone('idle_open')));

/* --- write the file ------------------------------------------------------ */

function pad(s, n) {
  while (s.length < n) s += ' ';
  return s;
}

function serialize() {
  var lines = [];
  lines.push('/* ============================================================');
  lines.push(' * NES-cat — frames-extra.js');
  lines.push(' * Derived 32x32 frames for Shiro.');
  lines.push(' *');
  lines.push(' * GENERATED by tools/derive-frames.js — edit the tool, not this file.');
  lines.push(' *');
  lines.push(' * Every entry records the base pose it was derived from:');
  ORDER.forEach(function (d) {
    lines.push(' *   ' + pad(d.name, 28) + ' <- ' + d.base);
  });
  lines.push(' * ============================================================ */');
  lines.push('(function (root) {');
  lines.push("  'use strict';");
  lines.push('  var NESCAT = (root.NESCAT = root.NESCAT || {});');
  lines.push('  NESCAT.frames = Object.assign(NESCAT.frames || {}, {');
  var keys = Object.keys(out);
  keys.forEach(function (name, i) {
    lines.push('    ' + name + ': [');
    out[name].forEach(function (row) {
      lines.push("      '" + row + "',");
    });
    lines.push('    ]' + (i === keys.length - 1 ? '' : ','));
  });
  lines.push('  });');
  lines.push("})(typeof window !== 'undefined' ? window : globalThis);");
  return lines.join('\n') + '\n';
}

function preview(names) {
  (names || Object.keys(out)).forEach(function (name) {
    if (!out[name]) return;
    console.log('\n== ' + name + ' ==');
    console.log(out[name].map(function (r) {
      return r.replace(/\./g, ' ');
    }).join('\n'));
  });
}

if (process.argv.indexOf('--preview') !== -1) {
  var want = process.argv.slice(2).filter(function (a) {
    return a.charAt(0) !== '-';
  });
  preview(want.length ? want : null);
} else {
  var dest = path.join(__dirname, '..', 'js', 'frames-extra.js');
  fs.writeFileSync(dest, serialize(), 'utf8');
  console.log('wrote ' + dest + ' (' + Object.keys(out).length + ' frames)');
}
