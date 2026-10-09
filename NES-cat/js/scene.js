/* ============================================================
 * NES-cat — scene.js
 *
 * The cozy room Shiro lives in. Owns the room geometry, the real-time
 * day/night cycle (mapped to the device clock) and every ambient animation
 * in the room:
 *
 *   window  — curtain panels that billow, sun/moon, twinkling stars,
 *             birds drifting past during the day
 *   wall    — a framed goldfish picture, a pendulum clock whose second
 *             hand ticks on the real clock, a pendant lamp that swings and
 *             lights up after dark
 *   shelf   — books, a photo frame and a trailing plant that stirs
 *   floor   — plank texture, a rug, food + water bowls, a cat tree with a
 *             toy swinging from it, a yarn ball that rolls around, and
 *             dust motes in the light
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});
  var U = NESCAT.util;
  var CFG = NESCAT.config;
  var C = NESCAT.palette.C;

  var W = CFG.LOGICAL_W;
  var H = CFG.LOGICAL_H;

  /* ---------- drawing helpers ------------------------------------------- */

  function fillC(g, hex) { g.fill(g.color(hex)); }

  /* Mix a flat colour into the room's current light so props belong to the
   * time of day instead of sitting on top of it. */
  function amb(L, hex, k) {
    return U.mixHex(hex, L.ambient, L.ambientAmt * (k == null ? 0.6 : k));
  }

  /* A crisp pixel ellipse: one rect per scanline, never a smoothed p5 arc. */
  function disc(g, cx, cy, rx, ry, col) {
    g.fill(col);
    var x = Math.round(cx), y = Math.round(cy);
    for (var dy = -ry; dy <= ry; dy++) {
      var t = 1 - (dy * dy) / (ry * ry);
      var w = Math.round(rx * Math.sqrt(Math.max(0, t)));
      if (w <= 0) continue;
      g.rect(x - w, y + dy, w * 2, 1);
    }
  }

  /* 1px Bresenham line — a stroked p5 line would soften the pixels. */
  function pxLine(g, x0, y0, x1, y1) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    var err = dx + dy;
    for (;;) {
      g.rect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /* ---------- window geometry (shared by several draw methods) ----------- */
  var WIN = { x: 30, y: 22, w: 66, h: 58 };
  var ROD = { y: 14, x0: 18, x1: 108 };
  var SILL_Y = WIN.y + WIN.h + 3;          /* 83 */
  var SILL_H = 4;

  function inWindowBand(x) { return x >= 14 && x <= 118; }

  var Scene = {
    /* geometry other modules read */
    FLOOR_TOP: 116,      /* where the wall meets the floor */
    FEET_Y: 142,         /* the y Shiro's feet rest on */
    WALK_MIN_X: 18,
    WALK_MAX_X: 268,

    light: null,
    hour: 12,
    second: 0,
    time: 0,
    isNight: false,

    _motes: [],
    _stars: [],
    _birds: [],
    _birdGap: 6,
    _yarnX: 104,
    _yarnPhase: 0,
    _yarnGap: 4,
    _yarnAnim: 0,
    _yarnDur: 1,
    _yarnFrom: 104,
    _yarnTo: 118,

    init: function () {
      var d = new Date();
      this.hour = d.getHours() + d.getMinutes() / 60;
      this.second = d.getSeconds();
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

      /* stars live in window-local coordinates, clear of the hills below */
      this._stars = [];
      for (var s = 0; s < 14; s++) {
        this._stars.push({
          x: U.randInt(2, WIN.w - 4),
          y: U.randInt(2, WIN.h - 26),
          s: U.chance(0.3) ? 2 : 1,
          p: U.rand(0, Math.PI * 2)
        });
      }

      this._birds = [];
      this._birdGap = U.rand(3, 9);
      this._yarnGap = U.rand(3, 8);
    },

    clockHour: function () {
      var d = new Date();
      return d.getHours() + d.getMinutes() / 60;
    },

    /* ---------- per-frame update ----------------------------------------- */

    update: function (dt) {
      this.time += dt;

      var d = new Date();
      this.hour = d.getHours() + d.getMinutes() / 60;
      this.second = d.getSeconds();
      this.light = NESCAT.palette.at(this.hour);
      this.isNight = this.light.isNight;

      this.updateMotes(dt);
      this.updateBirds(dt);
      this.updateYarn(dt);
    },

    updateMotes: function (dt) {
      for (var i = 0; i < this._motes.length; i++) {
        var m = this._motes[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt + Math.sin(this.time * 0.7 + m.p) * 2 * dt;
        if (m.x < -2) m.x = W + 2; else if (m.x > W + 2) m.x = -2;
        if (m.y < -2) m.y = H + 2; else if (m.y > H + 2) m.y = -2;
      }
    },

    /* A bird crosses the window every so often while the sun is up. */
    updateBirds: function (dt) {
      if (!this.isNight) {
        this._birdGap -= dt;
        if (this._birdGap <= 0) {
          this._birdGap = U.rand(9, 22);
          this._birds.push({
            p: 0,
            dur: U.rand(3.5, 6),
            y: U.rand(6, WIN.h - 30),
            dir: U.chance(0.5) ? 1 : -1,
            flap: U.rand(0, Math.PI * 2),
            size: U.chance(0.35) ? 2 : 1
          });
        }
      }
      for (var i = this._birds.length - 1; i >= 0; i--) {
        var b = this._birds[i];
        b.p += dt / b.dur;
        if (b.p >= 1) this._birds.splice(i, 1);
      }
    },

    /* The yarn ball sits still, then rolls somewhere else and unravels a bit. */
    updateYarn: function (dt) {
      if (this._yarnAnim > 0) {
        this._yarnAnim -= dt;
        var p = U.clamp(1 - this._yarnAnim / this._yarnDur, 0, 1);
        this._yarnX = U.lerp(this._yarnFrom, this._yarnTo, U.smooth(p));
        this._yarnPhase += dt * 3.4;
        if (this._yarnAnim <= 0) this._yarnX = this._yarnTo;
        return;
      }
      this._yarnGap -= dt;
      if (this._yarnGap <= 0) {
        this._yarnDur = U.rand(1.6, 2.8);
        this._yarnAnim = this._yarnDur;
        this._yarnFrom = this._yarnX;
        this._yarnTo = U.clamp(this._yarnX + U.rand(-20, 20), 92, 138);
        this._yarnGap = U.rand(6, 15);
      }
    },

    /* ---------- drawing --------------------------------------------------- */

    draw: function (g) {
      var L = this.light;

      g.noStroke();
      this.drawWall(g, L);
      this.drawWindow(g, L);
      this.drawPicture(g, L);
      this.drawClock(g, L);
      this.drawLamp(g, L);
      this.drawShelf(g, L);

      this.drawFloor(g, L);
      this.drawBeam(g, L);
      this.drawRug(g, L);
      this.drawLampPool(g, L);
      this.drawBowls(g, L);
      this.drawCatTree(g, L);
      this.drawPlant(g, L);
      this.drawYarn(g, L);

      this.drawMotes(g, L);
    },

    /* ---------- wall ------------------------------------------------------ */

    drawWall: function (g, L) {
      fillC(g, L.wall);
      g.rect(0, 0, W, this.FLOOR_TOP);

      /* wallpaper: soft vertical stripes, spaced to miss the window bay */
      var stripe = U.mixHex(L.wall, '#000000', 0.07);
      fillC(g, stripe);
      for (var sx = 16; sx < W; sx += 32) {
        if (inWindowBand(sx)) continue;
        g.rect(sx, 0, 2, this.FLOOR_TOP);
      }

      /* wallpaper: a small dot motif so the wall is never a flat field */
      var dot = U.mixHex(L.wall, '#ffffff', 0.05);
      fillC(g, dot);
      for (var mx = 24; mx < W; mx += 32) {
        if (inWindowBand(mx)) continue;
        for (var my = 13; my < 102; my += 14) g.rect(mx, my, 2, 2);
      }

      /* picture rail just under the ceiling */
      fillC(g, U.mixHex(L.wall, '#ffffff', 0.11));
      g.rect(0, 5, W, 1);
      fillC(g, U.mixHex(L.wall, '#000000', 0.26));
      g.rect(0, 6, W, 3);

      /* baseboard */
      fillC(g, U.mixHex(L.wall, '#ffffff', 0.09));
      g.rect(0, 109, W, 1);
      fillC(g, U.mixHex(L.wall, '#000000', 0.32));
      g.rect(0, 110, W, 5);

      /* seam between wall and floor */
      fillC(g, '#0f0f18');
      g.rect(0, this.FLOOR_TOP - 1, W, 1);
    },

    /* ---------- window ---------------------------------------------------- */

    drawWindow: function (g, L) {
      var x = WIN.x, y = WIN.y, w = WIN.w, h = WIN.h;
      var t = this.time;

      /* frame */
      fillC(g, U.mixHex(L.wall, '#000000', 0.45));
      g.rect(x - 3, y - 3, w + 6, h + 6);
      /* sky */
      fillC(g, L.window);
      g.rect(x, y, w, h);

      /* stars, twinkling, only after dark */
      if (L.isNight) {
        for (var i = 0; i < this._stars.length; i++) {
          var st = this._stars[i];
          var a = 0.30 + 0.70 * (0.5 + 0.5 * Math.sin(t * 1.8 + st.p));
          var sc = g.color('#f4f4e8');
          sc.setAlpha(a * 255);
          g.fill(sc);
          g.rect(x + st.x, y + st.y, st.s, st.s);
        }
      }

      /* sun or moon */
      fillC(g, L.isNight ? '#f4f4e8' : '#fff6c8');
      var sy = y + 14;
      g.rect(x + 14, sy, 8, 8);
      g.rect(x + 15, sy - 1, 6, 10);
      g.rect(x + 13, sy + 1, 10, 6);
      if (L.isNight) {
        fillC(g, L.window);            /* crescent bite */
        g.rect(x + 18, sy + 1, 5, 5);
      }

      /* distant hills */
      fillC(g, U.mixHex(L.window, '#000000', 0.28));
      g.rect(x, y + h - 16, w, 16);
      g.rect(x + 8, y + h - 22, 18, 8);
      g.rect(x + 40, y + h - 26, 16, 12);

      this.drawBirds(g, L);

      /* mullions */
      fillC(g, U.mixHex(L.wall, '#000000', 0.45));
      g.rect(x + w / 2 - 1, y, 2, h);
      g.rect(x, y + h / 2 - 1, w, 2);

      /* sill */
      var wood = U.mixHex('#7a4f28', L.ambient, L.ambientAmt * 0.6);
      fillC(g, U.mixHex(L.wall, '#000000', 0.35));
      g.rect(x - 6, SILL_Y + SILL_H, w + 12, 2);
      fillC(g, U.mixHex(wood, '#000000', 0.35));
      g.rect(x - 6, SILL_Y, w + 12, SILL_H);
      fillC(g, U.mixHex(wood, '#ffffff', 0.16));
      g.rect(x - 6, SILL_Y, w + 12, 1);

      this.drawCurtainRod(g, L);
      this.drawCurtain(g, L, 24, 14, 1);
      this.drawCurtain(g, L, 91, 14, -1);
    },

    drawBirds: function (g, L) {
      if (!this._birds.length) return;
      var col = U.mixHex(this.light.window, '#000000', 0.55);
      fillC(g, col);
      for (var i = 0; i < this._birds.length; i++) {
        var b = this._birds[i];
        var bx = b.dir > 0
          ? WIN.x - 4 + b.p * (WIN.w + 8)
          : WIN.x + WIN.w + 4 - b.p * (WIN.w + 8);
        var by = WIN.y + b.y + Math.sin(b.p * 7) * 3;
        bx = Math.round(bx); by = Math.round(by);
        if (bx < WIN.x - 3 || bx > WIN.x + WIN.w + 3) continue;

        /* wings flap between two poses */
        var up = Math.sin(this.time * 7 + b.flap) > 0;
        var s = b.size;
        if (up) {
          g.rect(bx - 2 * s, by - s, s, s);
          g.rect(bx - s, by, s, s);
          g.rect(bx, by, s, s);
          g.rect(bx + s, by, s, s);
          g.rect(bx + 2 * s, by - s, s, s);
        } else {
          g.rect(bx - 2 * s, by + s, s, s);
          g.rect(bx - s, by, s, s);
          g.rect(bx, by, s, s);
          g.rect(bx + s, by, s, s);
          g.rect(bx + 2 * s, by + s, s, s);
        }
      }
    },

    drawCurtainRod: function (g, L) {
      var rod = U.mixHex(L.wall, '#000000', 0.5);
      fillC(g, rod);
      g.rect(ROD.x0, ROD.y, ROD.x1 - ROD.x0, 2);
      g.rect(ROD.x0 - 2, ROD.y - 1, 3, 4);
      g.rect(ROD.x1 - 1, ROD.y - 1, 3, 4);
      fillC(g, U.mixHex(rod, '#ffffff', 0.2));
      g.rect(ROD.x0, ROD.y, ROD.x1 - ROD.x0, 1);
    },

    /* A curtain panel hanging from the rod. It is drawn as stacked solid
     * bands that each drift a little sideways, so the panel always reads as
     * one piece of cloth with pleats in it — never as separated strips.
     * Drawn last so it overlaps the window frame. */
    drawCurtain: function (g, L, x0, wid, dir) {
      var t = this.time;
      var top = ROD.y + 2;
      var bot = SILL_Y + SILL_H + 4;
      var body = U.mixHex(L.wall, '#ffffff', 0.22);
      var pleat = U.mixHex(L.wall, '#000000', 0.13);
      var edge = U.mixHex(L.wall, '#ffffff', 0.36);
      var hemCol = U.mixHex(L.wall, '#000000', 0.22);
      var SEG = 5;
      var len = bot - top;
      var hseg = Math.ceil(len / SEG);

      for (var s = 0; s < SEG; s++) {
        var f = (s + 1) / SEG;
        var raw = Math.sin(t * 0.6 + f * 1.5 + (dir > 0 ? 0 : 2.1)) * 2.6 * f;
        var sway = Math.round(dir > 0 ? raw : -raw);
        var yy = top + s * hseg;
        var last = (s === SEG - 1);
        var hem = bot + Math.round(Math.sin(t * 0.75 + s * 0.6) * 2);
        var hh = last ? Math.max(0, hem - yy) : hseg;
        if (hh <= 0) continue;
        var xx = Math.round(x0 + sway);

        fillC(g, body);
        g.rect(xx, yy, wid, hh);

        fillC(g, pleat);
        for (var p = 2; p < wid - 1; p += 4) g.rect(xx + p, yy, 1, hh);

        fillC(g, edge);
        g.rect(xx, yy, 1, hh);

        fillC(g, hemCol);
        g.rect(xx, yy + hh - 1, wid, 1);
      }
    },

    /* ---------- wall art -------------------------------------------------- */

    /* A little framed picture of a fish — her favourite.
     * Deliberately static: this used to translate +/-1px on a sine, but at
     * this size that reads as a glitch rather than motion. */
    drawPicture: function (g, L) {
      var x = 110, y = 30, w = 32, h = 30;

      /* nail it hangs from */
      fillC(g, U.mixHex(L.wall, '#000000', 0.5));
      g.rect(x + w / 2 - 1, y - 4, 2, 2);

      /* frame */
      fillC(g, amb(L, '#4a3018'));
      g.rect(x, y, w, h);
      fillC(g, amb(L, '#8a6138'));
      g.rect(x + 1, y + 1, w - 2, h - 2);
      fillC(g, amb(L, '#2f1f12'));
      g.rect(x + 3, y + 3, w - 6, h - 6);

      /* the artwork: a goldfish in a blue field */
      var ax = x + 4, ay = y + 4, aw = w - 8, ah = h - 8;
      fillC(g, amb(L, '#2f7fb8', 0.6));
      g.rect(ax, ay, aw, ah);
      fillC(g, amb(L, '#4fa3d8', 0.6));
      g.rect(ax, ay, aw, 3);

      var fx = ax + Math.round(aw * 0.55), fy = ay + Math.round(ah * 0.55);
      /* tail */
      fillC(g, amb(L, '#e79a3a', 0.6));
      g.rect(fx - 7, fy - 3, 3, 2);
      g.rect(fx - 8, fy - 4, 2, 2);
      g.rect(fx - 8, fy + 2, 2, 2);
      g.rect(fx - 7, fy + 1, 3, 2);
      /* body */
      disc(g, fx, fy, 5, 3, g.color(amb(L, '#f7d51d', 0.6)));
      fillC(g, amb(L, '#fff3a8', 0.6));
      g.rect(fx - 1, fy - 2, 3, 1);
      /* eye + bubbles */
      fillC(g, '#212529');
      g.rect(fx + 2, fy - 1, 1, 1);
      fillC(g, U.mixHex('#ffffff', L.ambient, L.ambientAmt * 0.5));
      g.rect(ax + 3, ay + 3, 2, 2);
      g.rect(ax + 7, ay + 6, 1, 1);
    },

    /* ---------- pendulum clock -------------------------------------------- */

    drawClock: function (g, L) {
      var t = this.time;
      var x = 152, y = 24, w = 32, h = 74;
      var cx = Math.round(x + w / 2);
      var fy = y + 22;

      /* case */
      fillC(g, amb(L, '#3f2a1a'));
      g.rect(x, y, w, h);
      fillC(g, amb(L, '#7a5130'));
      g.rect(x + 1, y + 1, w - 2, h - 2);
      fillC(g, amb(L, '#5a3a22'));
      g.rect(x + 3, y + 3, w - 6, h - 6);

      /* face */
      disc(g, cx, fy, 13, 13, g.color(amb(L, '#efe7d2')));
      disc(g, cx, fy, 11, 11, g.color(amb(L, '#fbf6e6')));

      /* ticks */
      fillC(g, amb(L, '#3a2a1c'));
      g.rect(cx - 1, fy - 10, 2, 3);
      g.rect(cx + 8, fy - 1, 3, 2);
      g.rect(cx - 1, fy + 8, 2, 3);
      g.rect(cx - 11, fy - 1, 3, 2);

      /* hands, driven by the real clock */
      var hh = Math.floor(this.hour) % 24;
      var mm = Math.floor((this.hour - Math.floor(this.hour)) * 60);
      var minA = ((mm + this.second / 60) / 60) * Math.PI * 2 - Math.PI / 2;
      var hrA = (((hh % 12) + mm / 60) / 12) * Math.PI * 2 - Math.PI / 2;
      var secA = (this.second / 60) * Math.PI * 2 - Math.PI / 2;

      fillC(g, amb(L, '#3a2a1c'));
      pxLine(g, cx, fy, cx + Math.cos(hrA) * 6, fy + Math.sin(hrA) * 6);
      pxLine(g, cx, fy, cx + Math.cos(minA) * 9, fy + Math.sin(minA) * 9);
      fillC(g, C.error);
      pxLine(g,
        cx - Math.cos(secA) * 3, fy - Math.sin(secA) * 3,
        cx + Math.cos(secA) * 10, fy + Math.sin(secA) * 10);
      fillC(g, amb(L, '#3a2a1c'));
      g.rect(cx - 1, fy - 1, 2, 2);

      /* pendulum, swinging below the dial */
      var well = amb(L, '#2b1d12');
      fillC(g, well);
      g.rect(x + 5, y + 38, w - 10, h - 44);
      fillC(g, U.mixHex(well, '#ffffff', 0.07));
      g.rect(x + 5, y + 38, w - 10, 1);

      var swing = Math.sin(t * 2.1) * 7;
      var px1 = cx + swing, py1 = y + h - 11;
      fillC(g, amb(L, '#c9a227'));
      pxLine(g, cx, y + 38, px1, py1);
      disc(g, px1, py1, 4, 5, g.color(amb(L, '#f7d51d')));
      fillC(g, amb(L, '#fff3a8'));
      g.rect(Math.round(px1) - 2, Math.round(py1) - 2, 2, 2);
    },

    /* ---------- pendant lamp ---------------------------------------------- */

    drawLamp: function (g, L) {
      var t = this.time;
      var on = L.glow < 0.5;
      var anchor = 206;
      var sway = Math.round(Math.sin(t * 0.55) * 1.6);
      var bobX = anchor + sway;
      var shadeY = 30;
      var rows = 11;

      /* cord, pivoting from the ceiling */
      fillC(g, U.mixHex(L.wall, '#000000', 0.5));
      pxLine(g, anchor, 9, bobX, shadeY);

      /* shade, widest at the rim */
      for (var i = 0; i < rows; i++) {
        var half = Math.round(4 + (i / (rows - 1)) * 9);
        fillC(g, i % 2 ? amb(L, '#c9553f', 0.5) : amb(L, '#e76e55', 0.5));
        g.rect(Math.round(bobX - half), shadeY + i, half * 2, 1);
      }
      fillC(g, amb(L, '#f3a08c', 0.5));
      g.rect(Math.round(bobX - 13), shadeY + rows, 26, 1);

      /* bulb */
      var flick = 0.9 + 0.1 * Math.sin(t * 11) * Math.sin(t * 3.7);
      if (on) {
        for (var r = 0; r < 3; r++) {
          var c = g.color('#ffce7a');
          c.setAlpha([26, 18, 12][r]);
          disc(g, bobX, shadeY + rows + 4, 8 + r * 9, 5 + r * 6, c);
        }
        fillC(g, U.mixHex('#fff6d0', '#000000', 1 - flick));
      } else {
        fillC(g, U.mixHex(L.wall, '#000000', 0.3));
      }
      g.rect(Math.round(bobX) - 3, shadeY + rows + 1, 6, 4);
      fillC(g, on ? '#ffffff' : U.mixHex(L.wall, '#ffffff', 0.15));
      g.rect(Math.round(bobX) - 1, shadeY + rows + 1, 2, 1);
    },

    /* ---------- shelf ------------------------------------------------------ */

    drawShelf: function (g, L) {
      var t = this.time;
      var x = 230, y = 46, w = 66;

      /* brackets */
      fillC(g, U.mixHex(L.wall, '#000000', 0.45));
      g.rect(x + 6, y + 3, 3, 9);
      g.rect(x + w - 4, y + 3, 3, 9);

      /* board */
      fillC(g, U.mixHex(L.wall, '#000000', 0.28));
      g.rect(x + 2, y + 3, w - 4, 2);
      fillC(g, amb(L, '#4a3018'));
      g.rect(x, y, w, 3);
      fillC(g, amb(L, '#7a4f28'));
      g.rect(x, y, w, 1);

      /* books */
      var cols = [C.primary, C.success, C.warning, C.error];
      var bx = x + 4;
      for (var i = 0; i < cols.length; i++) {
        var bh = 15 + (i % 3) * 3;
        fillC(g, amb(L, cols[i], 0.7));
        g.rect(bx, y - bh, 5, bh);
        fillC(g, U.mixHex(cols[i], '#000000', 0.35));
        g.rect(bx, y - bh, 5, 1);
        g.rect(bx + 2, y - bh + 4, 1, bh - 8);
        bx += 6;
      }
      /* a slim volume leaning against the stack */
      fillC(g, amb(L, '#7a5ec9', 0.7));
      g.rect(bx + 1, y - 12, 4, 12);
      g.rect(bx, y - 11, 1, 4);

      /* photo frame, leaning */
      var px = x + 35;
      fillC(g, amb(L, '#4a3018'));
      g.rect(px, y - 13, 14, 13);
      fillC(g, amb(L, '#8a6138'));
      g.rect(px + 1, y - 12, 12, 11);
      fillC(g, amb(L, '#cfe6f2', 0.6));
      g.rect(px + 2, y - 11, 10, 9);
      /* two tiny figures */
      fillC(g, amb(L, '#f7a8c4', 0.5));
      g.rect(px + 4, y - 7, 3, 5);
      fillC(g, amb(L, '#ffffff', 0.4));
      g.rect(px + 8, y - 8, 3, 6);

      /* potted plant trailing over the edge */
      var potX = x + 51;
      fillC(g, amb(L, '#a35a2c'));
      g.rect(potX, y - 9, 11, 9);
      fillC(g, amb(L, '#c47a3f'));
      g.rect(potX, y - 9, 11, 2);
      fillC(g, amb(L, '#3c2a1a'));
      g.rect(potX + 1, y - 8, 9, 2);
      fillC(g, amb(L, '#4f8f3a', 0.7));
      for (var v = 0; v < 3; v++) {
        var vx = potX + 2 + v * 4;
        var vd = Math.sin(t * 0.8 + v * 1.4) * 1.6;
        pxLine(g, vx, y - 8, vx + vd, y - 14);
        g.rect(Math.round(vx + vd) - 1, y - 16, 3, 2);
      }
      /* two vines hanging below the shelf */
      fillC(g, amb(L, '#3f7a30', 0.7));
      for (var hn = 0; hn < 2; hn++) {
        var hx = potX + 2 + hn * 6;
        for (var s = 0; s < 5; s++) {
          var yo = y + 3 + s * 3;
          var xo = Math.sin(t * 0.8 + hn * 1.4 + s * 0.5) * 1.6;
          g.rect(Math.round(hx + xo), yo, 2, 3);
        }
      }
    },

    /* ---------- floor ------------------------------------------------------ */

    drawFloor: function (g, L) {
      g.fill(g.color(L.floor));
      g.rect(0, this.FLOOR_TOP, W, H - this.FLOOR_TOP);

      /* boards: alternating tint, a dark seam, and staggered plank ends */
      var i = 0;
      for (var y = this.FLOOR_TOP; y < H; y += 9, i++) {
        if (i % 2 === 1) {
          fillC(g, U.mixHex(L.floor, '#000000', 0.05));
          g.rect(0, y, W, 9);
        }
        fillC(g, U.mixHex(L.floor, '#000000', 0.15));
        g.rect(0, y, W, 1);
        var jx = (i * 53 + 24) % W;
        g.rect(jx, y + 1, 1, 8);
        g.rect((jx + 148) % W, y + 1, 1, 8);
      }
    },

    /* The patch of daylight the window throws onto the boards. Its angle
     * tracks the real clock, so morning light lands left and evening light
     * lands right. Drawn before the rug, which sits on top of it. */
    drawBeam: function (g, L) {
      if (this.isNight) return;
      var sunT = U.clamp((this.hour - 6) / 12, 0, 1);
      var shift = Math.round((sunT - 0.5) * 52);
      var beam = U.mixHex(L.floor, L.window, 0.14 + 0.26 * L.glow);
      g.fill(g.color(beam));
      g.beginShape();
      g.vertex(36, this.FLOOR_TOP + 1);
      g.vertex(94, this.FLOOR_TOP + 1);
      g.vertex(126 + shift, H);
      g.vertex(6 + shift, H);
      g.endShape(g.CLOSE);
    },

    /* The pendant lamp's warm pool, only after dark. Alpha, so it washes
     * over the rug instead of erasing it. */
    drawLampPool: function (g, L) {
      if (L.glow >= 0.5) return;
      var cx = 206 + Math.round(Math.sin(this.time * 0.55) * 1.6);
      for (var i = 0; i < 3; i++) {
        var c = g.color('#ffce7a');
        c.setAlpha([34, 24, 16][i]);
        disc(g, cx, 152, 46 - i * 13, 20 - i * 6, c);
      }
    },

    drawRug: function (g, L) {
      var cx = 160, cy = 150;
      disc(g, cx, cy, 76, 16, g.color(U.mixHex(L.floor, '#000000', 0.32)));
      disc(g, cx, cy, 72, 14, g.color(U.mixHex(L.floor, C.error, 0.34)));
      disc(g, cx, cy, 56, 10, g.color(U.mixHex(L.floor, C.warning, 0.22)));
      disc(g, cx, cy, 40, 6, g.color(U.mixHex(L.floor, C.error, 0.20)));

      /* a ring of woven dashes */
      fillC(g, U.mixHex(L.floor, '#ffffff', 0.16));
      for (var a = 0; a < 28; a++) {
        var ang = (a / 28) * Math.PI * 2;
        g.rect(Math.round(cx + Math.cos(ang) * 64),
               Math.round(cy + Math.sin(ang) * 12), 2, 2);
      }
    },

    drawBowls: function (g, L) {
      /* water bowl */
      var wx = 46, wy = 134;
      disc(g, wx, wy, 8, 4, g.color(U.mixHex(L.floor, '#000000', 0.35)));
      disc(g, wx, wy - 1, 7, 3, g.color(amb(L, '#3aa0d8', 0.5)));
      fillC(g, Math.sin(this.time * 3) > 0 ? '#bfe8ff' : '#7fc8f5');
      g.rect(wx - 3 + (Math.sin(this.time * 3) > 0 ? 1 : 0), wy - 2, 3, 1);

      /* food bowl */
      var fx = 66, fy = 137;
      disc(g, fx, fy, 8, 4, g.color(U.mixHex(L.floor, '#000000', 0.35)));
      disc(g, fx, fy - 1, 7, 3, g.color(amb(L, '#e76e55', 0.5)));
      fillC(g, amb(L, '#a9743f', 0.6));
      g.rect(fx - 4, fy - 2, 2, 2);
      g.rect(fx, fy - 3, 2, 2);
      g.rect(fx + 3, fy - 1, 2, 2);
    },

    /* ---------- cat tree ---------------------------------------------------- */

    drawCatTree: function (g, L) {
      var t = this.time;
      var woodD = amb(L, '#4a3018');
      var woodL = amb(L, '#7a4f28');
      var rope = amb(L, '#c9a86b');
      var ropeD = amb(L, '#a3854f');

      /* base + its shadow on the boards */
      fillC(g, U.mixHex(L.floor, '#000000', 0.32));
      g.rect(198, 142, 34, 2);
      fillC(g, woodD); g.rect(196, 136, 38, 6);
      fillC(g, woodL); g.rect(196, 136, 38, 1);

      /* lower post, wrapped in rope */
      fillC(g, rope); g.rect(210, 84, 6, 52);
      fillC(g, ropeD);
      for (var y = 84; y < 136; y += 3) g.rect(210, y, 6, 1);

      /* lower platform */
      fillC(g, woodD); g.rect(200, 78, 28, 6);
      fillC(g, woodL); g.rect(200, 78, 28, 1);

      /* short upper post */
      fillC(g, rope); g.rect(212, 66, 6, 12);
      fillC(g, ropeD);
      for (var y2 = 66; y2 < 78; y2 += 3) g.rect(212, y2, 6, 1);

      /* top bed with a cushion */
      fillC(g, woodD); g.rect(204, 58, 30, 8);
      fillC(g, woodL); g.rect(204, 58, 30, 1);
      fillC(g, amb(L, '#8a5c31'));
      g.rect(204, 58, 3, 8);
      g.rect(231, 58, 3, 8);
      fillC(g, amb(L, '#e76e55', 0.6));
      g.rect(207, 60, 24, 5);
      fillC(g, amb(L, '#f3a08c', 0.6));
      g.rect(207, 60, 24, 1);

      /* a toy swinging from the bed */
      var swing = Math.sin(t * 1.7) * 5;
      var sx0 = 233, sy0 = 66;
      var sx1 = sx0 + swing, sy1 = 86;
      fillC(g, U.mixHex(L.wall, '#000000', 0.45));
      pxLine(g, sx0, sy0, sx1, sy1);
      disc(g, sx1, sy1 + 3, 3, 3, g.color(amb(L, C.warning)));
      fillC(g, amb(L, '#fff3a8'));
      g.rect(Math.round(sx1) - 1, Math.round(sy1) + 2, 2, 1);
      fillC(g, U.mixHex(L.wall, '#000000', 0.35));
      g.rect(Math.round(sx1) - 3, Math.round(sy1) + 3, 6, 1);
    },

    /* ---------- plant ------------------------------------------------------- */

    drawPlant: function (g, L) {
      var t = this.time;
      var px = 271;
      var base = this.FLOOR_TOP + 26;    /* 142 — the floor line */

      /* shadow */
      var sh = g.color('#000000');
      sh.setAlpha(70);
      disc(g, px, base + 1, 15, 4, sh);

      /* pot */
      fillC(g, amb(L, '#7a4423'));
      g.rect(px - 11, base - 16, 22, 16);
      fillC(g, amb(L, '#b5763f'));
      g.rect(px - 10, base - 15, 20, 14);
      fillC(g, amb(L, '#6d3c1f'));
      g.rect(px - 11, base - 16, 22, 2);
      fillC(g, amb(L, '#3c2a1a'));
      g.rect(px - 8, base - 14, 16, 2);

      /* fronds, each on its own phase so they never move in lockstep */
      var fronds = [
        { a: -1.05, len: 17, r: 4 },
        { a: -0.55, len: 21, r: 5 },
        { a: 0.00, len: 24, r: 5 },
        { a: 0.55, len: 21, r: 5 },
        { a: 1.05, len: 17, r: 4 }
      ];
      var soilY = base - 15;
      for (var i = 0; i < fronds.length; i++) {
        var f = fronds[i];
        var sway = Math.sin(t * 0.9 + i * 0.85) * 1.7;
        var ex = px + Math.sin(f.a) * f.len + sway;
        var ey = soilY - Math.cos(f.a) * f.len + Math.abs(sway) * 0.4;
        fillC(g, amb(L, '#3f7a30', 0.7));
        pxLine(g, px, soilY, ex, ey);
        disc(g, ex, ey, f.r, f.r - 1, g.color(amb(L, '#4f8f3a', 0.7)));
        fillC(g, amb(L, '#6fb854', 0.7));
        g.rect(Math.round(ex) - 1, Math.round(ey) - 1, 3, 1);
      }
    },

    /* ---------- yarn -------------------------------------------------------- */

    drawYarn: function (g, L) {
      var x = this._yarnX, y = 166;

      /* the strand it has unraveled */
      fillC(g, amb(L, '#e79ab5', 0.5));
      pxLine(g, x - 16, y + 6, x - 8, y + 3);
      pxLine(g, x - 8, y + 3, x - 2, y + 6);

      disc(g, x, y, 6, 6, g.color(amb(L, C.pink, 0.5)));

      /* winding stripes; their phase rolls as the ball turns */
      fillC(g, amb(L, '#ea7d9e', 0.5));
      for (var k = 0; k < 3; k++) {
        var a0 = this._yarnPhase + k * 2.1;
        for (var s = -5; s <= 5; s++) {
          var w = 36 - s * s;
          if (w <= 0) continue;
          var xx = x + Math.sin(a0 + s * 0.45) * Math.sqrt(w) * 0.55;
          g.rect(Math.round(xx), Math.round(y + s), 1, 1);
        }
      }
      fillC(g, amb(L, '#ffd9e6', 0.5));
      g.rect(Math.round(x) - 2, Math.round(y) - 3, 2, 1);
    },

    /* ---------- dust --------------------------------------------------------- */

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

    /* ---------- helpers ------------------------------------------------------ */

    /* How far Shiro is currently "in the light" — used for a subtle tint. */
    ambientFor: function () {
      return this.light ? { color: this.light.ambient, amount: this.light.ambientAmt } : null;
    }
  };

  NESCAT.Scene = Scene;
})(typeof window !== 'undefined' ? window : globalThis);
