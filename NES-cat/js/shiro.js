/* ============================================================
 * NES-cat — shiro.js
 *
 * Shiro: the cat. Owns her position, her state machine (idle / walk / sit /
 * sleep / react), her Mood-Energy-Hunger meters, and her particles.
 *
 * Interaction entry points (called by input.js):
 *   Shiro.petStart() / Shiro.petStop() / Shiro.petTick(dt)
 *   Shiro.dragStart() / Shiro.dragTo(x, y) / Shiro.dragEnd()
 *   Shiro.play()
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});
  var U = NESCAT.util;
  var CFG = NESCAT.config;

  /* 5x5 pixel glyphs for the particle flourishes. */
  var GLYPH = {
    heart: ['.K.K.', 'KKKKK', 'KKKKK', '.KKK.', '..K..'],
    zzz:   ['KKKK.', '...K.', '..K..', '.K...', 'KKKKK'],
    note:  ['..KK.', '..KK.', '..KK.', 'KKK..', 'KK...'],
    dust:  ['K']
  };

  var Shiro = {
    sprite: null,
    x: 150,
    y: 0,
    meters: { mood: 0.74, energy: 0.66, hunger: 0.22 },
    look: 0,
    facing: 1,          /* 1 = facing viewer (we never flip; kept for the API) */
    particles: [],
    onSay: null,        /* set by ui.js */

    /* interaction flags (driven by input.js) */
    petting: false,
    dragging: false,

    _blink: 0,
    _blinkNext: 3,
    _squash: 0,         /* transient squash/stretch amount */
    _squashV: 0,
    _wander: 0,
    _targetX: 150,
    _bob: 0,
    _saveT: 0,
    _saveDirty: false

  };

  /* ---------- lifecycle ------------------------------------------------- */

  Shiro.init = function () {
    this.sprite = NESCAT.Sprite.makeSprite({ name: 'shiro', frames: NESCAT.frames });
    this.x = 150;
    this.y = NESCAT.Scene.FEET_Y - 28;   /* sprite row 28 is her bottom */
    this.load();
    this.buildStateMachine();
  };

  Shiro.buildStateMachine = function () {
    var self = this;
    var B = CFG.BEHAVIOR;
    var sm;

    function toIdle() {
      self._wander = U.rand(B.wanderMin, B.wanderMax);
      sm.set('idle');
    }

    function say(key) {
      if (self.onSay) self.onSay(key);
    }

    var states = {
      idle: {
        enter: function () { self._wander = U.rand(B.wanderMin, B.wanderMax); },
        update: function (dt, s) {
          self._bob += dt * B.bobSpeed;
          if (self.petting) return;
          if (s.time > self._wander) self.rollNext();
        }
      },
      walk: {
        enter: function () {
          self._targetX = U.rand(NESCAT.Scene.WALK_MIN_X, NESCAT.Scene.WALK_MAX_X);
          self._walkDur = U.rand(B.walkMin, B.walkMax);
        },
        update: function (dt, s) {
          var dx = self._targetX - self.x;
          var speed = 26;                     /* logical px/s */
          if (Math.abs(dx) < 1.5) { sm.set('idle'); return; }
          self.x += Math.sign(dx) * speed * dt;
          self._bob += dt * 11;
          if (s.time > self._walkDur + 1.5) sm.set('idle');
        }
      },
      sit: {
        enter: function () { self._sitDur = U.rand(B.sitMin, B.sitMax); },
        update: function (dt, s) {
          self._bob += dt * B.bobSpeed * 0.6;
          if (self.petting) return;
          if (s.time > self._sitDur) sm.set('idle');
        }
      },
      sleep: {
        enter: function () {
          self._squash = 0.5;
          say('sleepy');
        },
        update: function (dt, s) {
          self._bob += dt * 2.0;
          /* regenerate energy, wake when rested, disturbed, or daytime */
          var m = CFG.METERS;
          self.meters.energy += m.sleep.energy * dt;
          self.meters.mood += m.sleep.mood * dt;
          self.meters.hunger += m.sleep.hunger * dt;
          if (self.petting || self.meters.energy > 0.96) { self.wake(); return; }
          if (!NESCAT.Scene.isNight && U.chance(dt * 0.05)) { self.wake(); return; }
          if (U.chance(dt * 0.6) && NESCAT.Scene.isNight) self.spawn('zzz');
        }
      },
      react: {
        enter: function (payload) {
          self._reactDur = U.rand(B.reactMin, B.reactMax);
          self._squashV = -14;
          if (payload && payload.say) say(payload.say);
        },
        update: function (dt, s) {
          self._bob += dt * 14;
          if (s.time > self._reactDur) sm.set('idle');
        }
      }
    };

    /* rollNext() (defined below) picks the next state; it needs the machine. */
    this._sm = NESCAT.Sprite.makeStateMachine(states, 'idle');
  };

  Shiro.rollNext = function () {
    var B = CFG.BEHAVIOR;
    var night = NESCAT.Scene.isNight;
    var sleepChance = night ? B.sleepChanceNight : B.sleepChanceDay;
    if (this.meters.energy < 0.18) sleepChance = Math.max(sleepChance, 0.7);

    var r = Math.random();
    if (r < sleepChance) { this._sm.set('sleep'); return; }
    if (r < sleepChance + 0.35) {
      this._sm.set('walk');
      return;
    }
    if (U.chance(0.5)) {
      this._sm.set('sit');
    } else {
      /* stay in idle, but reset the dwell timer (set() would no-op on itself) */
      this._wander = U.rand(B.wanderMin, B.wanderMax);
    }
  };

  /* ---------- interactions --------------------------------------------- */

  Shiro.petStart = function () {
    if (this._sm.is('sleep')) { this.wake(); }
    this.petting = true;
    this._petBlock = 0;
    this.spawn('heart');
    this.addMeter('pet');
  };

  Shiro.petStop = function () { this.petting = false; };

  Shiro.petTick = function (dt) {
    if (!this.petting) return;
    var m = CFG.METERS;
    this._petBlock = (this._petBlock || 0) + dt;
    this.meters.mood += m.petHoldPerSecond * dt;
    if (this._petBlock > 0.45) {
      this._petBlock = 0;
      this.spawn('heart');
    }
  };

  Shiro.dragStart = function () {
    this.petting = false;
    this.dragging = true;
    if (this._sm.is('sleep')) this.wake();
    this._sm.set('react', { say: null });
  };

  Shiro.dragTo = function (x) {
    this.x = U.clamp(x, NESCAT.Scene.WALK_MIN_X - 12, NESCAT.Scene.WALK_MAX_X + 12);
  };

  Shiro.dragEnd = function () {
    this.dragging = false;
    this._squashV = 10;
    this._sm.set('react', { say: 'wake' });
  };

  Shiro.play = function () {
    if (this._sm.is('sleep')) this.wake();
    this.addMeter('play');
    for (var i = 0; i < 5; i++) this.spawn('note');
    this._squashV = -18;
    this._sm.set('react', { say: 'play' });
  };

  Shiro.wake = function () {
    this._squash = 0.4;
    this._sm.set('react', { say: 'wake' });
  };

  /* ---------- meters ---------------------------------------------------- */

  Shiro.addMeter = function (kind) {
    var d = CFG.METERS[kind];
    if (!d) return;
    if (d.mood) this.meters.mood += d.mood;
    if (d.energy) this.meters.energy += d.energy;
    if (d.hunger) this.meters.hunger += d.hunger;
    this._saveDirty = true;
  };

  /* ---------- particles -------------------------------------------------- */

  Shiro.spawn = function (kind) {
    var cx = this.x + 16, top = this.y;
    var p = { kind: kind, life: 1, t: 0 };
    if (kind === 'heart') {
      p.x = cx + U.rand(-6, 6); p.y = top + U.rand(2, 10);
      p.vx = U.rand(-6, 6); p.vy = U.rand(-26, -16); p.life = U.rand(0.9, 1.4);
      p.color = NESCAT.palette.C.pink;
    } else if (kind === 'zzz') {
      p.x = this.x + 24; p.y = top + 2;
      p.vx = U.rand(4, 9); p.vy = U.rand(-16, -10); p.life = U.rand(1.6, 2.4);
      p.color = NESCAT.palette.C.silver;
    } else if (kind === 'note') {
      p.x = cx + U.rand(-14, 14); p.y = top + U.rand(-2, 12);
      p.vx = U.rand(-14, 14); p.vy = U.rand(-34, -20); p.life = U.rand(0.9, 1.5);
      p.color = U.pick([NESCAT.palette.C.primary, NESCAT.palette.C.success, NESCAT.palette.C.warning]);
    } else { /* dust */
      p.x = cx + U.rand(-16, 16); p.y = this.y + 26;
      p.vx = U.rand(-8, 8); p.vy = U.rand(-8, -2); p.life = U.rand(0.6, 1.1);
      p.color = NESCAT.palette.C.silver;
    }
    p.max = p.life;
    this.particles.push(p);
    if (this.particles.length > 90) this.particles.shift();
  };

  Shiro.updateParticles = function (dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === 'heart' ? 6 : 4) * dt;
      if (p.t >= p.life) this.particles.splice(i, 1);
    }
  };

  /* ---------- per-frame update ------------------------------------------- */

  Shiro.update = function (dt) {
    var m = CFG.METERS;

    /* meters drift slowly */
    this.meters.mood += m.drift.mood * dt;
    this.meters.energy += m.drift.energy * dt;
    this.meters.hunger += m.drift.hunger * dt;
    this.meters.mood = U.clamp(this.meters.mood, m.clamp[0], m.clamp[1]);
    this.meters.energy = U.clamp(this.meters.energy, m.clamp[0], m.clamp[1]);
    this.meters.hunger = U.clamp(this.meters.hunger, m.clamp[0], m.clamp[1]);

    /* target y, a light squash/stretch spring, plus a beat-synced bounce */
    var beat = (NESCAT.Audio && NESCAT.Audio.started && !NESCAT.Audio.muted)
      ? NESCAT.Audio.pulse : 0;
    this.y = NESCAT.Scene.FEET_Y - 28 + this._squash * 2 - beat * 1.5;
    this._squashV += -this._squash * 90 * dt;
    this._squashV *= (1 - Math.min(1, 8 * dt));
    this._squash += this._squashV * dt;
    if (Math.abs(this._squash) < 0.004 && Math.abs(this._squashV) < 0.05) {
      this._squashV = 0;
      this._squash = 0;
    }

    this.petTick(dt);
    if (!this.dragging) this._sm.update(dt);
    this.updateParticles(dt);

    /* blink timing */
    this._blink -= dt;
    if (this._blink <= 0) {
      this._blink = U.rand(CFG.BEHAVIOR.blinkMin, CFG.BEHAVIOR.blinkMax);
      this._blinkShow = 0.14;
    }
    if (this._blinkShow > 0) this._blinkShow -= dt;

    /* occlusion / occlusion: dust in the room light */
    if (U.chance(dt * 0.5)) this.spawn('dust');

    /* throttled persistence */
    this._saveT += dt;
    if (this._saveDirty && this._saveT > CFG.SAVE_THROTTLE_MS / 1000) this.save();
  };

  /* ---------- frame choice ------------------------------------------------ */

  Shiro.frameFor = function () {
    var blinking = this._blinkShow > 0;
    var breathing = Math.sin(this._bob) > 0.55;
    var st = this._sm.state;

    if (st === 'sleep') return (Math.sin(this._bob) > 0) ? 'sleep_0' : 'sleep_1';
    if (st === 'react') return (this._sm.time < 0.16) ? 'react_0' : 'react_1';
    if (st === 'walk') {
      var i = Math.floor(this._sm.time * 7) % 4;
      return 'walk_' + i;
    }
    if (st === 'sit') return blinking ? 'sit_closed' : 'sit_open';

    /* idle */
    if (blinking) return breathing ? 'idle_breathe_closed' : 'idle_closed';
    if (this.look < 0) return 'idle_look_left';
    if (this.look > 0) return 'idle_look_right';
    return breathing ? 'idle_breathe' : 'idle_open';
  };

  /* ---------- draw -------------------------------------------------------- */

  Shiro.draw = function (g) {
    var light = NESCAT.Scene.light;
    var ambient = light ? light.ambient : null;
    var amt = light ? light.ambientAmt : 0;

    /* soft shadow on the floor */
    g.noStroke();
    g.fill(0, 0, 0, 60);
    g.ellipse(this.x + 16, NESCAT.Scene.FEET_Y + 2, 30, 7);

    /* particles behind the cat if they are "above" her */
    this.drawParticles(g, false);

    NESCAT.Sprite.draw(g, this.sprite, this.frameFor(), this.x, this.y, {
      ambient: ambient,
      ambientAmt: amt
    });

    this.drawParticles(g, true);
  };

  Shiro.drawParticles = function (g, front) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var isFront = p.kind !== 'dust';
      if (isFront !== front) continue;
      var glyph = GLYPH[p.kind];
      var alpha = U.clamp(1 - (p.t / p.life), 0, 1);
      /* fade in the last quarter */
      alpha = Math.min(1, alpha * 2.2);
      var col = g.color(p.color);
      col.setAlpha(alpha * 255);
      g.fill(col);
      g.noStroke();
      var px = Math.round(p.x), py = Math.round(p.y);
      for (var ry = 0; ry < glyph.length; ry++) {
        var row = glyph[ry];
        for (var rx = 0; rx < row.length; rx++) {
          if (row.charAt(rx) !== '.') g.rect(px + rx, py + ry, 1, 1);
        }
      }
    }
  };

  /* ---------- persistence ------------------------------------------------- */

  Shiro.save = function () {
    this._saveT = 0;
    this._saveDirty = false;
    try {
      root.localStorage.setItem(CFG.STORE_KEY, JSON.stringify({
        mood: this.meters.mood,
        energy: this.meters.energy,
        hunger: this.meters.hunger,
        x: this.x
      }));
    } catch (e) { /* private mode / storage disabled — not fatal */ }
  };

  Shiro.load = function () {
    var start = CFG.METERS.start;
    this.meters.mood = start.mood;
    this.meters.energy = start.energy;
    this.meters.hunger = start.hunger;
    try {
      var raw = root.localStorage.getItem(CFG.STORE_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && typeof d === 'object') {
        if (typeof d.mood === 'number') this.meters.mood = U.clamp(d.mood, 0, 1);
        if (typeof d.energy === 'number') this.meters.energy = U.clamp(d.energy, 0, 1);
        if (typeof d.hunger === 'number') this.meters.hunger = U.clamp(d.hunger, 0, 1);
        if (typeof d.x === 'number') this.x = d.x;
      }
    } catch (e) { /* corrupt or unavailable — fall back to defaults */ }
  };

  NESCAT.Shiro = Shiro;
})(typeof window !== 'undefined' ? window : globalThis);
