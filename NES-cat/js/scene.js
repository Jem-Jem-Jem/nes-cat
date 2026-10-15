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

  /* ---------- what is actually in the room -------------------------------
   *
   * One table, and everything about an object is in it: which sprite it is,
   * which of its pixels is the anchor point, where it sits, whether the cat
   * can walk through it, and whether you can pick it up. The draw code, the
   * hit test and the collider all read this, so they cannot drift apart —
   * which is the entire reason the room went through the sprite API rather
   * than staying a pile of drawing calls.
   *
   * ax/ay is the frame pixel that sits on `x`/`y`. For the yarn that is its
   * middle; for a bowl it is the top-left, because a bowl is placed by where
   * its foot lands on the floor, not by its centre.
   *
   * `solid` is deliberately false for everything that is on the floor as
   * opposed to standing in it. A cat walks past a ball of wool and a cat
   * does not walk through the planter; but she does walk over the rug and
   * through the gap between the two bowls, and marking those solid would
   * fence her out of the middle of her own room.
   *
   * `collideW` / `collideX` are separate from the box on purpose. The cat
   * tree's box is 46 wide and 82 tall, because you should be able to reach up
   * and touch the bed; the thing that stops her walking into it is the post,
   * which is 8 wide. A hit box and a collider are different questions and the
   * answers here are nothing alike.
   */
  var OBJECTS = {
    yarn: {
      sprite: 'yarn', ax: 13, ay: 6, x: 104, y: 166,
      solid: false, grab: true, label: 'the yarn',
      /* how far it can be pushed about. Not the whole floor: a ball of wool
       * that could be thrown behind the sofa would come to rest somewhere the
       * cat has no reason to go and be useless there. */
      grabRange: [92, 138],
      shadowW: 8            /* the ball only — the strand lies flat in the
                              * same light and casts nothing */
    },
    food: {
      sprite: 'bowl', ax: 7, ay: 0, x: 66, y: 133,
      solid: false, grab: false, label: 'the food bowl',
      shadowW: 14,
      frame: function (sc) { return sc.food > 0.02 ? 'bowl_food' : 'bowl_food_empty'; }
    },
    water: {
      sprite: 'bowl', ax: 7, ay: 0, x: 46, y: 130,
      solid: false, grab: false, label: 'the water bowl',
      shadowW: 14,
      frame: function (sc) { return sc.water > 0.02 ? 'bowl_water' : 'bowl_water_empty'; }
    },
    tree: {
      sprite: 'tree', ax: 0, ay: 0, x: 188, y: 55,
      /* Not solid, and the reason is the draw order: the room is painted
       * before her, so she is always in front of the furniture. What meets her
       * at floor level is a 6px plinth, and standing in front of a plinth
       * looks like standing in front of a plinth. Her whole body is above it
       * anyway — the rest of the tree is 82px over her head.
       *
       * Making it solid was tried and is worse in both directions: she can no
       * longer cross the room, because the plinth is 46px of a 250px floor and
       * she has to get from one side of it to the other, and the only way past
       * was a 30px teleport through a post she was walking into. */
      solid: false, grab: false, label: 'the cat tree',
      shadowW: 46
    },
    plant: {
      sprite: 'plant', ax: 20, ay: 41, x: 271, y: 142,
      /* Solid, and for the opposite reason. The pot is 22px of solid rim at
       * exactly her height, and because she is drawn in front of it, being
       * "inside" the plant puts her legs over the front of the pot with the
       * rim crossing them. That reads as a cat standing in a bucket. */
      solid: true, grab: false, label: 'the plant',
      collideW: 22, collideX: 0,           /* the pot */
      shadowW: 22,
      /* eight frames of the fronds swaying, at four a second. The hand-drawn
       * version had a seven-second period, and eight frames over seven
       * seconds is barely one frame a second — a stutter, not a sway. */
      frame: function (sc) {
        return 'plant_' + (Math.floor(sc.time * 4) % 8);
      }
    },
    toy: {
      sprite: 'toy', ax: 5, ay: 0, x: 233, y: 64,
      solid: false, grab: false, label: 'the dangling toy',
      /* The frame carries the ambient swing; being batted is a *position*
       * offset rather than another frame. That is not a shortcut — a frame
       * chooser for an arbitrary swing value has to map a continuous quantity
       * onto a discrete cycle, and the mapping is discontinuous where the
       * pendulum passes vertical, so the toy would jump. Offsetting keeps the
       * kick smooth and leaves the loop to do what loops do. */
      frame: function (sc) {
        var f = Math.floor(sc.time * 1.7 / (Math.PI * 2) * 5);
        return 'toy_' + (((f % 5) + 5) % 5);
      },
      dx: function (sc) { return sc._toySwing; }
    }
  };
  var SOLID = Object.keys(OBJECTS).filter(function (k) { return OBJECTS[k].solid; });

  var Scene = {
    /* geometry other modules read */
    FLOOR_TOP: 116,      /* where the wall meets the floor */
    FEET_Y: 142,         /* the y Shiro's feet rest on */
    WALK_MIN_X: 18,
    WALK_MAX_X: 268,

    /* Where the interactive furniture lives. Shiro walks to these, so they
     * are the single source of truth for both drawing and behaviour — change
     * a bowl here and she turns up at the new spot automatically. */
    BOWL_WATER_X: 46,
    BOWL_FOOD_X: 66,
    /* The window's centre, so the cat can be pointed at it without either of
     * them hardcoding the other one's geometry. The room knows where the glass
     * is; she only knows there is something out there worth looking at. */
    WINDOW_CX: 63,
    /* How far left of a bowl she stands to use it. The profile muzzle sits
     * about 27px into a 32px sprite, so anything less and she reaches past
     * the bowl instead of into it — which is what an 18px stand-off did,
     * leaving her head ten pixels beyond the food with nothing under it. */
    BOWL_GAP: 27,
    CAT_TREE_X: 213,     /* the rope post: she stands just left of it */
    /* How far left of the post she stands to scratch it. Her forepaws reach
     * about 25px into a 32px sprite, so anything less puts her raking the air
     * beside the post rather than on it. */
    TREE_GAP: 28,
    YARN_MIN_X: 92,
    YARN_MAX_X: 138,

    light: null,
    hour: 12,
    second: 0,
    time: 0,
    isNight: false,

    /* How much is left in each bowl, 0..1. She only goes when there is
     * something to eat, and eating visibly empties the bowl. */
    food: 1,
    water: 1,

    /* Impulses other modules can poke, so the room reacts to Shiro. */
    _toySwing: 0,
    _toySwingV: 0,

    _motes: [],
    _stars: [],
    _birds: [],
    _birdGap: 6,
    /* s left of "something just went past the window", which shiro.js reads
     * to decide whether a glance should go that way. Zero when nothing is
     * out there, which is most of the time. */
    birdSighting: 0,
    _yarnX: 104,
    _yarnPhase: 0,
    _yarnGap: 4,
    _yarnAnim: 0,
    _yarnDur: 1,
    _yarnFrom: 104,
    _yarnTo: 118,

    /* ---------- the room's objects, as sprites ---------------------------
     *
     * The furniture used to be 184 calls to rect/disc/pxLine. That is a
     * picture and nothing else: nothing in a pile of drawing calls knows how
     * big a ball of wool is, so there is no way to ask whether a click landed
     * on one, and no way to stop a cat walking through the plant. Both of
     * those were true — she could be dropped exactly onto the planter and the
     * game was entirely happy about it, and the yarn was a thing that rolled
     * about on a timer rather than a thing you could touch.
     *
     * As frames, the same data answers all of it at once. A frame has a width
     * and a height, so it *is* the hit box and it *is* the collider, and the
     * string that draws it is the thing you point at. One source, so the
     * collision and the hit test cannot disagree with what is on screen.
     *
     * Built once here rather than per frame: makeSprite only validates, so
     * there is nothing to do per frame and nothing to get wrong doing it.
     */
    sprites: null,
    _buildSprites: function () {
      var defs = NESCAT.sceneSprites || {};
      var out = {};
      for (var k in defs) {
        if (Object.prototype.hasOwnProperty.call(defs, k)) {
          out[k] = NESCAT.Sprite.makeSprite(defs[k]);
        }
      }
      this.sprites = out;
    },

    /* An object's footprint on the floor. Read by the hit test and the
     * collider alike, so there is one answer to "how big is it and where". */
    bounds: function (obj) {
      var d = OBJECTS[obj];
      if (!d || !this.sprites || !this.sprites[obj]) return null;
      var f = this.sprites[obj].frames[d.frame];
      if (!f) return null;
      return { x: d.x - d.ax, y: d.y - d.ay, w: f.size.w, h: f.size.h };
    },

    /* ---------- addressing the room ------------------------------------- */

    /* Where an object is *now*. The yarn is the only one that moves, and it
     * has been carrying its position in `_yarnX` all along; this is the one
     * place that turns that into the coordinates the frame is drawn at. */
    objectX: function (name) {
      return name === 'yarn' ? this._yarnX : OBJECTS[name].x;
    },

    /* Which frame an object is on right now. For the bowls that is the level
     * of what is in them, so an empty bowl is a different picture and not the
     * same picture with the contents painted over. For a thing that does not
     * move, it is simply its one frame. */
    objectFrame: function (name) {
      var d = OBJECTS[name];
      if (d.frame) return d.frame(this);
      var sprite = d.sprite && this.sprites ? this.sprites[d.sprite] : null;
      if (!sprite) return null;
      if (name === 'yarn') {
        /* the wind's phase is already a 0..2pi roll; cycle the six frames off
         * it, which is what turns a rolling ball into a rolling ball rather
         * than a sliding one */
        return 'yarn_' + ((Math.floor(this._yarnPhase / (Math.PI * 2) * 6) % 6) + 6) % 6;
      }
      /* A static object: one frame, and that is the whole of it. Falling back
       * to "null unless it says" left the cat tree with no frame at all and it
       * simply did not draw — which is the kind of silence a drawing call
       * never produces, because `Sprite.draw` returns quietly on a frame it
       * cannot find. */
      var keys = Object.keys(sprite.frames);
      return keys.length === 1 ? keys[0] : null;
    },

    /* An object's box on screen, or null for something not yet a sprite.
     * The hit test, the collider and the renderer all ask this one, so "where
     * the yarn is" has exactly one answer. */
    box: function (name) {
      var d = OBJECTS[name];
      if (!d) return null;
      var sprite = d.sprite && this.sprites ? this.sprites[d.sprite] : null;
      var frameName = this.objectFrame(name);
      var f = sprite && frameName ? sprite.frames[frameName] : null;
      var w = f ? f.size.w : (d.ax * 2);
      var h = f ? f.size.h : (d.ay * 2);
      return { x: this.objectX(name) - d.ax, y: d.y - d.ay, w: w, h: h };
    },

    /* Which object a point is on, or null.
     *
     * This is the whole of "is the room interactive": before the room went
     * through the sprite API there was nothing to ask this question with. The
     * only hit test in the piece was `_hitShiro`, which is a bounding box
     * against a hardcoded 32, and it could not have answered this — it does
     * not know what else there is, or how big it is.
     *
     * Later entries win, which is the z-order: the toy's box sits entirely
     * inside the cat tree's, so returning the first match made the toy
     * unreachable and clicking it scratched the post instead. The drawing
     * order is the order in OBJECTS, so the last hit *is* the one on top. */
    objectAt: function (px, py) {
      var names = Object.keys(OBJECTS);
      var hit = null;
      for (var i = 0; i < names.length; i++) {
        var b = this.box(names[i]);
        if (!b) continue;
        if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) hit = names[i];
      }
      return hit;
    },

    /* ---------- picking things up ----------------------------------------
     *
     * Only the yarn is grabbable so far, and deliberately: a ball of wool is
     * the one object in a cat's room you would actually pick up and throw, and
     * the bowls and the cat tree are the ones you would *use*. They are all
     * interactive, just in a different way — see Shiro.notice.
     *
     * Dragging keeps the grab point rather than centring on the pointer, so
     * the ball does not snap to your cursor the moment you touch it.
     */
    grab: function (name, atX) {
      if (!OBJECTS[name] || !OBJECTS[name].grab) return false;
      this._holding = { name: name, dx: this.objectX(name) - atX };
      /* stop her own rolling animation: a ball under the pointer is not also
       * rolling away on a timer, and two things moving it at once fights */
      if (name === 'yarn') { this._yarnAnim = 0; this._yarnGap = 6; }
      return true;
    },

    dragObject: function (atX) {
      if (!this._holding) return;
      var d = OBJECTS[this._holding.name];
      var range = d.grabRange || [0, this.WALK_MAX_X];
      var nx = U.clamp(atX + this._holding.dx, range[0], range[1]);
      /* her own collision, not the player's: a ball you drop under the
       * planter would otherwise end up inside it, and the next thing that
       * happened would be a cat pouncing into a pot */
      if (d.solid) nx = this.avoidSolids(nx, (d.collideW || 0) / 2);
      this.setObjectX(this._holding.name, nx);
    },

    /* Let go. The yarn is given the momentum of the last drag so a flick
     * throws it and a gentle placement does not — which is the difference
     * between an object and a decoration. */
    releaseObject: function (speed) {
      if (!this._holding) return;
      var name = this._holding.name;
      var v = Math.abs(speed || 0);
      this._holding = null;
      if (name === 'yarn' && v > 6) this.nudgeYarn(null, Math.min(26, 6 + v * 0.12));
    },

    /* The yarn moves; everything else is furniture and does not. One setter so
     * the drag path and the idle rolling cannot drift into writing to
     * different fields. */
    setObjectX: function (name, x) {
      if (name !== 'yarn') return;
      this._yarnX = U.clamp(x, this.YARN_MIN_X, this.YARN_MAX_X);
    },

    /* Collision.
     *
     * Before this, nothing in the piece had any: she could be dropped exactly
     * onto the planter at x=271 and the game reported no problem, because the
     * only thing constraining her was the room's walls.
     *
     * The model is one-dimensional on purpose. Everything in this room stands
     * on the floor and none of it can be climbed, so what actually needs
     * resolving is *which stretches of floor are occupied*. Everything else is
     * wall-to-wall and one-dimensional already, so doing this in 2D would be
     * solving a problem the room does not have.
     *
     * Shallow rather than resolved: she is pushed back to the nearer edge she
     * is not inside. A cat does not slide along obstacles, she picks a path
     * that goes round — and her wandering targets already steer away from the
     * furniture (see treeNearX), so this only has to catch the cases where
     * she is *placed* somewhere silly, or a random walk happens to aim at the
     * planter. */
    solids: function () {
      var out = [];
      for (var i = 0; i < SOLID.length; i++) {
        var d = OBJECTS[SOLID[i]];
        var cx = d.x + (d.collideX || 0);
        var w = d.collideW || d.ax * 2;
        out.push({ name: SOLID[i], x0: cx - w / 2, x1: cx + w / 2 });
      }
      return out;
    },

    /* Push an x out of anything solid she is standing in.
     *
     * `halfW` is half her *body*, not half her sprite. A 32px walking frame is
     * 32 wide because a cat's legs swing out to the edges of it, but the
     * middle twenty pixels are what is actually on the floor; measuring her
     * from the sprite would put her a six-pixel halo of empty air either side
     * of everything, and she would stop well short of the post she is reaching
     * for.
     *
     * `fromX` is where she was, and it is the whole reason this takes three
     * arguments. Pushing her out of the nearest edge is right when she was
     * *placed* somewhere silly — she drops onto the planter and lands beside
     * it. It is badly wrong when she is *walking*: a 2px step to the left from
     * just right of the cat tree resolves to "nearest edge" on the far side,
     * and the cat teleports thirty pixels through a post she was about to
     * walk into. So a resolved position that is further from where she started
     * than the step she asked for is refused, and the caller treats that as
     * blocked. */
    avoidSolids: function (wantX, halfW, fromX) {
      var x = wantX;
      var list = this.solids();
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (x + halfW <= s.x0 || x >= s.x1) continue;
        var left = s.x0 - halfW;
        var right = s.x1 + halfW;
        x = (x - left <= right - x) ? left : right;
      }
      if (fromX != null && x !== wantX) {
        /* refused: the resolution is further away than the step asked for */
        if (Math.abs(x - fromX) > Math.abs(wantX - fromX)) return fromX;
      }
      return U.clamp(x, this.WALK_MIN_X, this.WALK_MAX_X);
    },

    /* Can she get from where she is to x, unobstructed? Used by the walker to
     * decide whether a destination is reachable at all, so it can pick another
     * one rather than walk into a wall of furniture forever. */
    canReach: function (fromX, toX, halfW) {
      var list = this.solids();
      var step = Math.sign(toX - fromX) || 1;
      for (var x = fromX; step > 0 ? x <= toX : x >= toX; x += step) {
        for (var i = 0; i < list.length; i++) {
          var s = list[i];
          if (x + halfW <= s.x0 || x >= s.x1) continue;
          /* she may already be overlapping — she was dropped there, or she is
           * standing at a fixture. That is not the walk being blocked. */
          if (Math.abs(x - fromX) < 1) continue;
          return false;
        }
      }
      return true;
    },

    /* ---------- reactions to Shiro ---------------------------------------- */

    /* Shiro swatted the hanging toy: kick it and let it damp out. */
    pokeToy: function (power) {
      this._toySwingV += (power == null ? 9 : power);
    },

    /* Shiro batted the yarn: send it rolling away from her. */
    nudgeYarn: function (fromX, power) {
      var dir = fromX == null ? 1 : (this._yarnX < fromX ? 1 : -1);
      this._yarnDur = 1.4;
      this._yarnAnim = this._yarnDur;
      this._yarnFrom = this._yarnX;
      this._yarnTo = U.clamp(this._yarnX + dir * (power == null ? 22 : power),
                             this.YARN_MIN_X, this.YARN_MAX_X);
      this._yarnGap = 9;
      this._yarnPhase += 1.2;
    },

    /* A mouthful or a lap costs a slice of the bowl. */
    takeFood: function () { this.food = Math.max(0, this.food - 0.34); return this.food; },
    takeWater: function () { this.water = Math.max(0, this.water - 0.34); return this.water; },

    /* Bowls slowly refill so she is never permanently locked out. */
    updateBowls: function (dt) {
      this.food = U.clamp(this.food + dt * 0.012, 0, 1);
      this.water = U.clamp(this.water + dt * 0.016, 0, 1);
    },

    updateToy: function (dt) {
      if (this._toySwing === 0 && this._toySwingV === 0) return;
      /* damped spring back to rest */
      this._toySwingV += -this._toySwing * 9 * dt;
      this._toySwingV *= (1 - 2.2 * dt);
      this._toySwing += this._toySwingV * dt;
      if (Math.abs(this._toySwing) < 0.05 && Math.abs(this._toySwingV) < 0.05) {
        this._toySwing = 0; this._toySwingV = 0;
      }
    },

    init: function () {
      var d = new Date();
      this.hour = d.getHours() + d.getMinutes() / 60;
      this.second = d.getSeconds();
      this.light = NESCAT.palette.at(this.hour);
      this.isNight = this.light.isNight;

      this._buildSprites();

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
      this.updateToy(dt);
      this.updateBowls(dt);
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
          /* Something just went past the window. The cat is allowed to know:
           * a bird is the one event in this room that is worth reacting to,
           * and without this the window is scenery she never looks at. */
          this.birdSighting = 4.5;
        }
      }
      if (this.birdSighting > 0) this.birdSighting -= dt;
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
        this._yarnTo = U.clamp(this._yarnX + U.rand(-20, 20), this.YARN_MIN_X, this.YARN_MAX_X);
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

      /* baseboard: a proper profile rather than two flat bands — a cap, a
       * face, the groove a skirting board has, and a soft cast shadow along
       * the boards. It used to stop two pixels short of the floor, and that
       * strip of bare wall above the seam is exactly what makes a room read
       * as a backdrop rather than as a room. */
      var bb = 106;                    /* top of the board */
      fillC(g, U.mixHex(L.wall, '#ffffff', 0.10));
      g.rect(0, bb, W, 1);
      fillC(g, U.mixHex(L.wall, '#000000', 0.30));
      g.rect(0, bb + 1, W, this.FLOOR_TOP - bb - 2);
      fillC(g, U.mixHex(L.wall, '#000000', 0.40));
      g.rect(0, bb + 5, W, 1);
      fillC(g, U.mixHex(L.floor, '#000000', 0.16));
      g.rect(0, this.FLOOR_TOP, W, 2);

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
     * lands right. Drawn before the rug, which sits on top of it.
     *
     * Scanline rects, not a polygon. p5 antialiases a shape, and this buffer
     * is blitted with smoothing off, so a slanted quad came out with soft
     * grey edges that matched nothing else in the room — the one thing in
     * here drawn in a different style. One rect per row keeps it crisp and
     * costs nothing at 64 rows. */
    drawBeam: function (g, L) {
      if (this.isNight) return;
      var sunT = U.clamp((this.hour - 6) / 12, 0, 1);
      var shift = Math.round((sunT - 0.5) * 52);
      var beam = U.mixHex(L.floor, L.window, 0.14 + 0.26 * L.glow);
      g.fill(g.color(beam));
      var top = this.FLOOR_TOP + 1;
      for (var y = top; y < H; y++) {
        var t = (y - top) / (H - top);
        var x0 = U.lerp(36, 6 + shift, t);
        var x1 = U.lerp(94, 126 + shift, t);
        g.rect(Math.round(x0), y, Math.round(x1 - x0), 1);
      }
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

    /* The rug she spends most of her life on, so it is worth more than four
     * concentric ellipses. A kilim: a dark ground, two bands, a stepped
     * medallion in the middle, a border of diamonds and a woven fringe at each
     * end. All discs and rects, so it stays as crisp as the rest of the room.
     *
     * An earlier pass scattered pale dashes over the surface to suggest pile.
     * At this scale they did not read as texture, they read as dirt on the
     * carpet, and nothing else in the room is speckled, so they are gone. */
    drawRug: function (g, L) {
      var cx = 160, cy = 150;
      var dark = U.mixHex(L.floor, '#000000', 0.34);
      var red = U.mixHex(L.floor, C.error, 0.34);
      var gold = U.mixHex(L.floor, C.warning, 0.22);
      var cream = U.mixHex(L.floor, '#ffffff', 0.20);

      /* fringe first, so the body of the rug overlaps its roots */
      fillC(g, cream);
      for (var f = -6; f <= 6; f++) {
        var fx = cx + f * 12;
        g.rect(fx, cy - 18, 1, 3);
        g.rect(fx, cy + 15, 1, 3);
      }

      disc(g, cx, cy, 78, 17, g.color(dark));          /* the dark ground */
      disc(g, cx, cy, 74, 15, g.color(red));           /* outer band */
      disc(g, cx, cy, 58, 11, g.color(gold));          /* middle band */
      disc(g, cx, cy, 42, 7, g.color(red));            /* inner field */

      /* A border of stepped diamonds on the red band. Three pixels across
       * reads as a motif; one reads as a speck, which is what the first
       * version was. */
      fillC(g, dark);
      for (var d = 0; d < 12; d++) {
        var a = (d / 12) * Math.PI * 2;
        var dx = Math.round(cx + Math.cos(a) * 66);
        var dy = Math.round(cy + Math.sin(a) * 13.5);
        g.rect(dx - 1, dy - 1, 3, 1);
        g.rect(dx - 1, dy, 3, 1);
        g.rect(dx, dy - 1, 1, 3);
      }

      /* the medallion: a stepped lozenge, three rings, centred on her */
      fillC(g, gold);
      g.rect(cx - 14, cy - 1, 29, 3);
      g.rect(cx - 1, cy - 3, 3, 7);
      fillC(g, dark);
      g.rect(cx - 9, cy - 1, 19, 3);
      g.rect(cx - 1, cy - 2, 3, 5);
      fillC(g, gold);
      g.rect(cx - 4, cy - 1, 9, 3);
      fillC(g, dark);
      g.rect(cx, cy, 1, 1);
    },

    drawBowls: function (g, L) {
      /* Both bowls empty as Shiro uses them, so she is never eating a
       * bowl that is visibly already empty. That used to be two concentric
       * discs — a dark ring and a coloured one — which is the least a bowl
       * can look like: you could not tell it from a coaster, and she put her
       * nose in it. It is a frame now, with a rim seen slightly from above
       * and a wall below it, so the inside of an empty one reads as inside.
       *
       * The level test is the same one the hand-drawn version used; all that
       * changed is that a full bowl and an empty one are now different
       * pictures rather than the same picture with a rectangle painted on it.
       */
      this.drawShadow(g, L, 'food');
      this.drawObject(g, L, 'food', 0.5);
      this.drawShadow(g, L, 'water');
      this.drawObject(g, L, 'water', 0.5);
    },

    /* One object, through the sprite API, lit the way the room lights
     * everything else. The `k` is the same ambient weight amb() used, so an
     * object becoming a sprite did not also change how the light falls on it.
     *
     * Two things every sprite needs and the frame gives for free: the run
     * merging in Sprite.draw, so a 16x12 ball costs a handful of rects rather
     * than 192, and the transparency — '.' is not drawn at all, which is why
     * the strand can trail off the edge of the frame without a box around it.
     */
    drawObject: function (g, L, name, k) {
      var d = OBJECTS[name];
      if (!d || !d.sprite || !this.sprites) return;
      var sprite = this.sprites[d.sprite];
      var frame = this.objectFrame(name);
      if (!frame || !sprite.frames[frame]) return;
      /* THE DIVISION BY THE SWITCH SCALE, AND WHY IT IS HERE.
       *
       * OBJECTS.x / OBJECTS.y are in the ROOM's coordinates. Everything that
       * reads them wants that: the hit test, the collider, the offset recorded
       * when she grabs the yarn. The painting is the one exception, because
       * sketch.js wraps this whole draw in scale(2) and the renderer
       * multiplies whatever it is handed - so the room's coordinates have to be
       * brought back to 320-space before they get multiplied a second time.
       *
       * d.ax / d.ay are 320-space already and must NOT be divided. Dividing the
       * position and not the anchor is the whole trick: (x/scale) - ax.
       *
       * Commit 26cc6cf did not have this, so every floor object was drawn at
       * twice its doubled position and vanished off the edge of the canvas:
       * the plant 484px past a 640px edge, the bowls below a 360px floor.
       * The wall survived because it is drawn from literals in the transform,
       * not from this table.
       */
      var inv = 1 / (NESCAT.SCALE || 1);
      NESCAT.Sprite.draw(g, sprite, frame,
        (this.objectX(name) + (d.dx ? d.dx(this) : 0)) * inv - d.ax,
        d.y * inv - d.ay,
        { ambient: L.ambient, ambientAmt: L.ambientAmt * (k == null ? 0.6 : k) });
    },

    /* The contact shadow under something standing on the floor.
     *
     * Deliberately *not* part of the frame. A shadow is the floor's colour
     * darkened, so it has to be tinted by the floor and not by the light —
     * put it in the sprite and it would take the object's own ambient and sit
     * on the rug at a different temperature from the rug.
     *
     * Sized from the frame's footprint rather than hardcoded, which is the
     * other half of why the room went through the sprite API: the shadow is
     * the right width because the bowl is.
     */
    drawShadow: function (g, L, name) {
      var b = this.box(name);
      var d = OBJECTS[name];
      if (!b || !d) return;
      /* same division as drawObject: the centre and the floor line come from the
       * table and are in room coordinates, while shadowW and the frame width
       * are 320-space and go to the transform as they are. */
      var inv = 1 / (NESCAT.SCALE || 1);
      var cx = this.objectX(name) * inv;
      /* b.y + b.h is the BOTTOM of the frame, which is the floor line - not
       * d.y, which is the anchor. Keep the frame height in it. */
      var footY = (d.y - d.ay + b.h) * inv;
      /* The shadow is its own size, not the frame's. The yarn's frame is 20
       * wide because it has a strand trailing off one side, and a shadow
       * derived from that came out nearly twice the ball — a dark bar on the
       * rug the length of a tail that is lying flat in the same light. What
       * actually meets the floor is narrower than its frame, and only the
       * object knows by how much. */
      var hw = d.shadowW || Math.round(b.w * 0.5);
      disc(g, Math.round(cx), Math.round(footY), Math.round(hw * 0.5), 2,
        g.color(U.mixHex(L.floor, '#000000', 0.26)));
      disc(g, Math.round(cx) - 1, Math.round(footY), Math.round(hw * 0.32), 1,
        g.color(U.mixHex(L.floor, '#000000', 0.18)));
    },

    /* ---------- cat tree ---------------------------------------------------- */

    /* The cat tree, its shadow, and the toy hanging off it.
     *
     * The tree itself does not move, so it is one frame. The rope's seam steps
     * right as it climbs — which is what a spiral does, and what stops it
     * reading as the rungs of a ladder — and the plinth is stamped last so
     * the post stands *in* the base rather than on it. Both were got right
     * the hard way by hand and both are preserved here.
     *
     * The toy is a separate object rather than part of the tree because it
     * moves, and because it is the thing you actually click: touching it is
     * how you ask her to reach up at it. */
    drawCatTree: function (g, L) {
      this.drawShadow(g, L, 'tree');
      this.drawObject(g, L, 'tree');
      this.drawObject(g, L, 'toy');
    },

    /* ---------- plant ------------------------------------------------------- */

    drawPlant: function (g, L) {
      /* Eight frames of the fronds, each offset three frames from its
       * neighbour so they never move in lockstep. */
      this.drawShadow(g, L, 'plant');
      this.drawObject(g, L, 'plant', 0.7);
    },

    /* ---------- yarn -------------------------------------------------------- */

    drawYarn: function (g, L) {
      /* Six frames of the wind at different phases, cycled off the rolling
       * phase. It was a live trigonometric redraw before — three winding arcs
       * computed every frame, and the phase coming from wherever the rolling
       * animation had got to. Six frames off the same phase is the same
       * motion, and it means the ball's size is data rather than the radius of
       * a disc() call that nothing else in the room can see.
       *
       * The unravelled strand is part of the frame, which is why it still
       * trails off to the left of the ball and reads as one object rather
       * than a ball with a line drawn near it.
       */
      this.drawShadow(g, L, 'yarn');
      this.drawObject(g, L, 'yarn', 0.5);
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

  /* EXPOSED, ADDITIVELY, FOR THE 640x360 SWITCH.
   *
   * OBJECTS holds each prop's x/y and anchor as literals, and both the drawing
   * and solids() read them. The drawing is doubled for free by the scale
   * transform in sketch.js; the COLLISION is not, because collision is
   * arithmetic and no transform touches it.
   *
   * The first pass of the switch left this alone and shipped a room where the
   * furniture was drawn at 2x and collided with at 1x - visible walls in the
   * wrong place, and a cat who walks through where the plant looks like it is.
   * The test that caught it did not ask "does she clip", it asked "does she stop
   * in the same place at both scales", and got an identical x.
   *
   * One line, no literal changed, no art touched. It only makes the table
   * reachable so scale.js can double it like everything else. */
  Scene.OBJECTS = OBJECTS;

  NESCAT.Scene = Scene;
})(typeof window !== 'undefined' ? window : globalThis);
