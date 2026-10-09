/* ============================================================
 * NES-cat — sprite.js
 *
 * The small reusable sprite API the future sprite system will share:
 *   NESCAT.Sprite.makeSprite(def)            — validate + wrap frame data
 *   NESCAT.Sprite.draw(g, sprite, frame, x, y, opts)
 *   NESCAT.Sprite.makeStateMachine(spec, initial)
 *
 * Frames are rows of characters (see frames.js). '.' is transparent,
 * every other character maps to a colour via NESCAT.palette.CHAR.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});
  var U = NESCAT.util;

  function validate(name, rows) {
    if (!rows || !rows.length) throw new Error('sprite "' + name + '": no rows');
    var w = rows[0].length;
    for (var y = 0; y < rows.length; y++) {
      if (rows[y].length !== w) {
        throw new Error('sprite "' + name + '": row ' + y + ' has ' +
          rows[y].length + ' cols, expected ' + w);
      }
    }
    return { w: w, h: rows.length };
  }

  NESCAT.Sprite = {
    validate: validate,

    makeSprite: function (def) {
      var frames = {};
      for (var f in def.frames) {
        if (!Object.prototype.hasOwnProperty.call(def.frames, f)) continue;
        var rows = def.frames[f];
        frames[f] = { rows: rows, size: validate(def.name + '/' + f, rows) };
      }
      return {
        name: def.name,
        charColors: def.charColors || null,
        frames: frames
      };
    },

    /* Draw one frame as crisp 1x1 rects, merging horizontal runs of the same
     * colour so a 32x32 frame costs a handful of calls instead of 1024.
     * opts: { flip, ambient, ambientAmt, alpha }                       */
    draw: function (g, sprite, frameName, x, y, opts) {
      opts = opts || {};
      var frame = sprite.frames[frameName];
      if (!frame) return;

      var rows = frame.rows, w = frame.size.w, h = frame.size.h;
      var flip = !!opts.flip;
      var ambient = opts.ambient || null;
      var amt = opts.ambientAmt || 0;
      var alpha = opts.alpha == null ? 1 : opts.alpha;
      var cache = {};

      g.noStroke();
      for (var ry = 0; ry < h; ry++) {
        var row = rows[ry];
        var cx = 0;
        while (cx < w) {
          var ch = row.charAt(cx);
          if (ch === '.' || ch === ' ') { cx++; continue; }

          var run = 1;
          while (cx + run < w && row.charAt(cx + run) === ch) run++;

          var col = (sprite.charColors && sprite.charColors[ch]) ||
                    NESCAT.palette.charColor(ch) || '#ff00ff';
          if (ambient && amt > 0) col = U.mixHex(col, ambient, amt);

          var key = col + '|' + alpha;
          if (!cache[key]) {
            var c = g.color(col);
            c.setAlpha(alpha * 255);
            cache[key] = c;
          }
          g.fill(cache[key]);

          var px = flip ? (w - cx - run) : cx;
          g.rect(Math.round(x + px), Math.round(y + ry), run, 1);
          cx += run;
        }
      }
    },

    /* Minimal finite state machine for Shiro's behaviour.
     * spec: { state: { enter(sm, from, payload), update(dt, sm), exit(sm, to) } } */
    makeStateMachine: function (spec, initial) {
      var sm = {
        state: initial,
        previous: null,
        time: 0,
        states: spec,

        set: function (name, payload) {
          if (name === sm.state) return;
          var cur = spec[sm.state];
          if (cur && cur.exit) cur.exit(sm, name);
          sm.previous = sm.state;
          sm.state = name;
          sm.time = 0;
          var nxt = spec[name];
          /* enter(sm, from, payload) — three arguments, in that order. A
             state that only needs the payload must declare all three, or it
             silently receives the state machine instead and anything it
             reads off the payload comes back undefined. */
          if (nxt && nxt.enter) nxt.enter(sm, sm.previous, payload || {});
        },

        is: function (name) { return sm.state === name; },

        update: function (dt) {
          sm.time += dt;
          var cur = spec[sm.state];
          if (cur && cur.update) cur.update(dt, sm);
        }
      };

      var init = spec[initial];
      if (init && init.enter) init.enter(sm, null, {});
      return sm;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
