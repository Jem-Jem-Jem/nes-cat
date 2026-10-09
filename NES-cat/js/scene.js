/* ============================================================
 * NES-cat — scene.js
 *
 * The cozy room Shiro lives in. Owns the room geometry, the real-time
 * day/night cycle (mapped to the device clock) and the small ambient
 * animations: swaying curtain, plant, clock, and motes in the light.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});
  var U = NESCAT.util;
  var CFG = NESCAT.config;

  var W = CFG.LOGICAL_W;
  var H = CFG.LOGICAL_H;

  var Scene = {
    /* geometry other modules read */
    FLOOR_TOP: 116,      /* where the wall meets the floor */
    FEET_Y: 142,         /* the y Shiro's feet rest on */
    WALK_MIN_X: 18,
    WALK_MAX_X: 268,

    light: null,
    hour: 12,
    time: 0,
    isNight: false,

    _motes: [],

    init: function () {
      this.hour = this.clockHour();
      this.light = NESCAT.palette.at(this.hour);
      this.isNight = this.light.isNight;

      this._motes = [];
      for (var i = 0; i < 26; i++) {
        this._motes.push({
          x: U.rand(0, W), y: U.rand(0, H),
          vx: U.rand(-3, 3), vy: U.rand(-2, 4),
          s: U.chance(0.25) ? 2 : 1,
          p: U.rand(0, Math.PI * 2)
        });
      }
    },

    clockHour: function () {
      var d = new Date();
      return d.getHours() + d.getMinutes() / 60;
    },

    update: function (dt) {
      this.time += dt;

      this.hour = this.clockHour();
      this.light = NESCAT.palette.at(this.hour);
      this.isNight = this.light.isNight;

      for (var i = 0; i < this._motes.length; i++) {
        var m = this._motes[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt + Math.sin(this.time * 0.7 + m.p) * 2 * dt;
        if (m.x < -2) m.x = W + 2; else if (m.x > W + 2) m.x = -2;
        if (m.y < -2) m.y = H + 2; else if (m.y > H + 2) m.y = -2;
      }
    },

    /* ---------- drawing --------------------------------------------------- */

    draw: function (g) {
      var L = this.light;

      /* wall + floor */
      g.noStroke();
      g.fill(g.color(L.wall));
      g.rect(0, 0, W, this.FLOOR_TOP);
      g.fill(g.color(L.floor));
      g.rect(0, this.FLOOR_TOP, W, H - this.FLOOR_TOP);

      /* wall/floor seam */
      g.fill(g.color('#0f0f18'));
      g.rect(0, this.FLOOR_TOP - 1, W, 1);

      /* subtle wall stripes (pixel wallpaper, symmetric) */
      var stripe = U.mixHex(L.wall, '#000000', 0.07);
      g.fill(g.color(stripe));
      for (var sx = 16; sx < W; sx += 32) {
        if (sx > 100 && sx < 220) continue;   /* leave room for the window */
        g.rect(sx, 0, 2, this.FLOOR_TOP - 1);
      }

      this.drawWindow(g);
      this.drawRug(g);
      this.drawPlant(g);
      this.drawShelf(g);

      /* light pool on the floor under the window */
      var beam = U.mixHex(L.floor, L.window, 0.18 + 0.25 * L.glow);
      g.fill(g.color(beam));
      g.beginShape();
      g.vertex(30, this.FLOOR_TOP + 2);
      g.vertex(96, this.FLOOR_TOP + 2);
      g.vertex(126, H);
      g.vertex(6, H);
      g.endShape(g.CLOSE);

      this.drawMotes(g, L);
    },

    drawWindow: function (g) {
      var L = this.light;
      var x = 30, y = 22, w = 66, h = 58;

      /* frame */
      g.noStroke();
      g.fill(g.color(U.mixHex(L.wall, '#000000', 0.45)));
      g.rect(x - 3, y - 3, w + 6, h + 6);
      /* sky */
      g.fill(g.color(L.window));
      g.rect(x, y, w, h);

      /* sun or moon */
      g.fill(g.color(L.isNight ? '#f4f4e8' : '#fff6c8'));
      var sy = y + 14;
      g.rect(x + 14, sy, 8, 8);
      g.rect(x + 15, sy - 1, 6, 10);
      g.rect(x + 13, sy + 1, 10, 6);
      if (L.isNight) {
        /* crescent bite */
        g.fill(g.color(L.window));
        g.rect(x + 18, sy + 1, 5, 5);
      }

      /* distant hills */
      g.fill(g.color(U.mixHex(L.window, '#000000', 0.28)));
      g.rect(x, y + h - 16, w, 16);
      g.rect(x + 8, y + h - 22, 18, 8);
      g.rect(x + 40, y + h - 26, 16, 12);

      /* mullions */
      g.fill(g.color(U.mixHex(L.wall, '#000000', 0.45)));
      g.rect(x + w / 2 - 1, y, 2, h);
      g.rect(x, y + h / 2 - 1, w, 2);

      /* curtain, swaying gently */
      var sway = Math.sin(this.time * 0.55) * 1.6;
      var cw = U.mixHex(L.wall, '#ffffff', 0.14);
      g.fill(g.color(cw));
      for (var i = 0; i < 10; i++) {
        var off = Math.sin(this.time * 0.55 + i * 0.5) * 1.2;
        g.rect(x - 9 + i + off * (i / 10), y - 6, 1, h + 14);
      }
      g.rect(x + w + 2, y - 6, 8, h + 14);
      for (var j = 0; j < 8; j++) {
        var off2 = Math.sin(this.time * 0.5 + j * 0.6) * 1.2;
        g.rect(x + w + 2 + j + off2 * (1 - j / 8), y - 6, 1, h + 14);
      }
    },

    drawRug: function (g) {
      var cx = 160, cy = this.FEET_Y + 6;
      g.noStroke();
      g.fill(g.color(U.mixHex(this.light.floor, '#000000', 0.22)));
      g.ellipse(cx, cy, 150, 22);
      g.fill(g.color(U.mixHex(this.light.floor, NESCAT.palette.C.error, 0.22)));
      g.ellipse(cx, cy, 130, 18);
      g.fill(g.color(U.mixHex(this.light.floor, NESCAT.palette.C.warning, 0.14)));
      g.ellipse(cx, cy, 96, 12);
    },

    drawPlant: function (g) {
      var L = this.light;
      var px = 268, base = this.FLOOR_TOP + 26;

      /* pot */
      g.noStroke();
      g.fill(g.color(U.mixHex(L.floor, '#000000', 0.4)));
      g.rect(px - 8, base - 12, 20, 14);
      g.fill(g.color(U.mixHex('#b5763f', L.ambient, L.ambientAmt * 0.6)));
      g.rect(px - 7, base - 11, 18, 12);

      /* leaves, gently bobbing */
      var sway = Math.sin(this.time * 0.9) * 1.5;
      var green = U.mixHex('#4f8f3a', L.ambient, L.ambientAmt * 0.7);
      g.fill(g.color(green));
      g.rect(px + 1 + sway, base - 26, 3, 16);
      g.rect(px - 6 + sway * 0.7, base - 22, 3, 12);
      g.rect(px + 7 + sway * 1.2, base - 21, 3, 11);
      g.rect(px - 3 + sway, base - 30, 8, 5);
      g.rect(px - 9 + sway * 0.6, base - 27, 7, 4);
      g.rect(px + 6 + sway * 1.1, base - 26, 7, 4);
    },

    drawShelf: function (g) {
      var L = this.light;
      var y = 40, x = 238;
      g.noStroke();
      g.fill(g.color(U.mixHex(L.wall, '#000000', 0.5)));
      g.rect(x - 26, y, 60, 3);
      /* little books */
      var cols = [NESCAT.palette.C.primary, NESCAT.palette.C.success, NESCAT.palette.C.warning, NESCAT.palette.C.error];
      for (var i = 0; i < 5; i++) {
        var c = cols[i % cols.length];
        g.fill(g.color(U.mixHex(c, L.ambient, L.ambientAmt * 0.7)));
        g.rect(x - 22 + i * 6, y - 12 - (i % 2) * 2, 5, 12 + (i % 2) * 2);
      }
    },

    drawMotes: function (g, L) {
      var col = g.color(U.mixHex('#ffffff', L.window, 0.4));
      for (var i = 0; i < this._motes.length; i++) {
        var m = this._motes[i];
        var a = 0.10 + 0.16 * L.glow * (0.6 + 0.4 * Math.sin(this.time * 1.3 + m.p));
        col.setAlpha(U.clamp(a, 0, 1) * 255);
        g.fill(col);
        g.noStroke();
        g.rect(Math.round(m.x), Math.round(m.y), m.s, m.s);
      }
    },

    /* ---------- helpers --------------------------------------------------- */

    /* How far Shiro is currently "in the light" — used for a subtle tint. */
    ambientFor: function () {
      return this.light ? { color: this.light.ambient, amount: this.light.ambientAmt } : null;
    }
  };

  NESCAT.Scene = Scene;
})(typeof window !== 'undefined' ? window : globalThis);
