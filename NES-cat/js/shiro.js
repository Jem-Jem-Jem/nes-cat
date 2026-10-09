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
    _flourish: null,      /* a short idle flourish: glance / tail flick / yawn */
    _flourishGap: 5,      /* seconds until the next one is rolled */
    _lift: 0,             /* px she is airborne (jump / pounce) */
    facing: 1,            /* 1 = right, -1 = mirrored */
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
    this._flourishGap = U.rand(CFG.BEHAVIOR.flourishMin, CFG.BEHAVIOR.flourishMax);
  };

  Shiro.buildStateMachine = function () {
    var self = this;
    var B = CFG.BEHAVIOR;
    var sm;

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
          self.facing = dx < 0 ? -1 : 1;
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
          /* a pet/drag/play cancels whatever she was doing — including
           * dropping her back to the floor if she was mid-jump */
          self._lift = 0;
          if (payload && payload.say) say(payload.say);
        },
        update: function (dt, s) {
          self._bob += dt * 14;
          if (s.time > self._reactDur) sm.set('idle');
        }
      },

      /* ---------- activities --------------------------------------------
       * Each activity has two phases: she walks to a fixture, then performs
       * in place. `self._act` carries { target, dur } between them, so the
       * approach and the performance share one state. */

      jump: {
        enter: function () {
          self._act = { target: null, dur: B.jumpDur, done: false };
          self._lift = 0;
        },
        update: function (dt, s) {
          var p = U.clamp(s.time / self._act.dur, 0, 1);
          /* a sine arc: up fast, hang, come down */
          self._lift = Math.sin(p * Math.PI) * B.jumpHeight;
          if (p > 0.15 && p < 0.55 && !self._act.booted) {
            self._act.booted = true;
            /* batting the hanging toy only if she jumped beside it */
            if (Math.abs(self.x - NESCAT.Scene.CAT_TREE_X) < B.treeNearX) {
              NESCAT.Scene.pokeToy(11);
            }
          }
          if (p >= 1) { self._lift = 0; sm.set('idle'); }
        }
      },

      eat: {
        enter: function () {
          self._act = { target: NESCAT.Scene.BOWL_FOOD_X - 18, dur: B.eatDur, phase: 0 };
        },
        update: function (dt, s) {
          if (!self.arrive(dt, self._act.target, s)) return;
          if (self._act.phase === 0) {
            self._act.phase = 1;
            self._sm.time = 0;
            NESCAT.Scene.takeFood();
            self.addMeter('eat');
            if (self.onSay) self.onSay('nom');
          }
          if (s.time > self._act.dur) sm.set('idle');
        }
      },

      drink: {
        enter: function () {
          self._act = { target: NESCAT.Scene.BOWL_WATER_X - 18, dur: B.drinkDur, phase: 0 };
        },
        update: function (dt, s) {
          if (!self.arrive(dt, self._act.target, s)) return;
          if (self._act.phase === 0) {
            self._act.phase = 1;
            self._sm.time = 0;
            NESCAT.Scene.takeWater();
            self.addMeter('drink');
          }
          if (s.time > self._act.dur) sm.set('idle');
        }
      },

      groom: {
        enter: function () {
          self._act = { target: null, dur: B.groomDur, phase: 0 };
        },
        update: function (dt, s) {
          if (s.time > self._act.dur) sm.set('idle');
        }
      },

      wash: {
        enter: function () {
          self._act = { target: null, dur: B.washDur, phase: 0 };
        },
        update: function (dt, s) {
          if (s.time > self._act.dur) sm.set('idle');
        }
      },

      tree: {
        enter: function () {
          self._act = { target: NESCAT.Scene.CAT_TREE_X - 22, dur: B.treeDur, phase: 0 };
        },
        update: function (dt, s) {
          if (!self.arrive(dt, self._act.target, s)) return;
          if (self._act.phase === 0) {
            self._act.phase = 1;
            self._sm.time = 0;
            NESCAT.Scene.pokeToy(7);
          }
          if (s.time > self._act.dur) sm.set('idle');
        }
      },

      pounce: {
        enter: function () {
          self._act = { target: NESCAT.Scene._yarnX - 26, dur: B.pounceDur, phase: 0, hit: false };
          self._lift = 0;
        },
        update: function (dt, s) {
          if (self._act.phase === 0) {
            if (!self.arrive(dt, self._act.target, s)) return;
            self._act.phase = 1;
            self._sm.time = 0;
          }
          var p = U.clamp(s.time / self._act.dur, 0, 1);
          self._lift = Math.sin(p * Math.PI) * B.pounceHeight;
          /* the swat lands a bit before she touches down */
          if (p > 0.45 && !self._act.hit) {
            self._act.hit = true;
            NESCAT.Scene.nudgeYarn(self.x + 16, 24);
            self.addMeter('play');
          }
          if (p >= 1) { self._lift = 0; sm.set('idle'); }
        }
      }
    };

    /* rollNext() (defined below) picks the next state; it needs the machine.
     * `sm` MUST be bound before any state's update() runs — walk/sit/react all
     * call sm.set(). makeStateMachine only invokes the initial state's enter(),
     * which does not touch sm, so binding after construction is safe. */
    sm = this._sm = NESCAT.Sprite.makeStateMachine(states, 'idle');
  };

  /* Walk toward a fixture until she is close enough to act on it.
   Returns true once arrived (and latches, so the caller can then run its
   performance phase without re-walking every frame). */
  Shiro.arrive = function (dt, targetX, s) {
    if (this._act.arrived) return true;
    var dx = targetX - this.x;
    if (Math.abs(dx) <= CFG.BEHAVIOR.arriveEps) {
      this._act.arrived = true;
      return true;
    }
    /* face the way she is travelling so the walk cycle reads correctly */
    this.facing = dx < 0 ? -1 : 1;
    this.x += Math.sign(dx) * CFG.BEHAVIOR.approachSpeed * dt;
    this._bob += dt * 11;
    return false;
  };

  Shiro.rollNext = function () {
    var B = CFG.BEHAVIOR;
    var Sc = NESCAT.Scene;
    var night = Sc.isNight;
    var sleepChance = night ? B.sleepChanceNight : B.sleepChanceDay;
    if (this.meters.energy < 0.18) sleepChance = Math.max(sleepChance, 0.7);

    var r = Math.random();
    if (r < sleepChance) { this._sm.set('sleep'); return; }
    if (r < sleepChance + 0.35) {
      this._sm.set('walk');
      return;
    }

    /* Build a pool of what she could plausibly do right now, then pick.
     * Unavailable activities are left out rather than re-rolled, so a roll
     * never turns into "walk to the bowl, find it empty". */
    var pool = [['sit', B.wSit]];
    /* `hunger` rises as she gets hungry, so she looks for food once it
     * climbs past the threshold (and only if the bowl is not empty). */
    if (this.meters.hunger > B.hungryBelow && Sc.food > 0.05) pool.push(['eat', 30]);
    else pool.push(['groom', B.wGroom]);
    if (this.meters.energy > 0.3) pool.push(['wash', B.wWash]);
    if (Sc.water > 0.05) pool.push(['drink', 18]);
    if (Math.abs(this.x - Sc.CAT_TREE_X) < B.treeNearX) pool.push(['tree', B.wTree]);
    else pool.push(['jump', B.wJump]);
    pool.push(['pounce', B.wYarn]);

    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += pool[i][1];
    var pick = Math.random() * total;
    var kind = 'sit';
    for (i = 0; i < pool.length; i++) {
      pick -= pool[i][1];
      if (pick <= 0) { kind = pool[i][0]; break; }
    }

    if (kind === 'sit') { this._sm.set('sit'); return; }
    if (kind === 'pounce') { this._sm.set('pounce'); return; }

    /* stays put: point her at the fixture and let the state walk her over */
    if (kind === 'eat') this._sm.set('eat', { from: null });
    else if (kind === 'drink') this._sm.set('drink', { from: null });
    else if (kind === 'groom') this._sm.set('groom', { from: null });
    else if (kind === 'wash') this._sm.set('wash', { from: null });
    else if (kind === 'tree') this._sm.set('tree', { from: null });
    else if (kind === 'jump') this._sm.set('jump', { from: null });
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
    /* face the way she is being dragged (test before moving) */
    this.facing = x >= this.x ? 1 : -1;
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
      this._blinkShow = CFG.BEHAVIOR.blinkDur;
    }
    if (this._blinkShow > 0) this._blinkShow -= dt;

    this.updateFlourish(dt);

    /* occlusion / occlusion: dust in the room light */
    if (U.chance(dt * 0.5)) this.spawn('dust');

    /* throttled persistence */
    this._saveT += dt;
    if (this._saveDirty && this._saveT > CFG.SAVE_THROTTLE_MS / 1000) this.save();
  };

  /* ---------- idle flourishes -------------------------------------------- */

  /* A flourish is a short, self-contained burst of character: she glances
   * around the room, flicks her tail, sweeps it up over her back, or yawns.
   * Only one ever runs at a time and only while she is idling — that keeps
   * frameFor() simple, since there are no blink/gaze/tail combinations to
   * author as separate frames. */
  Shiro.rollFlourish = function () {
    var B = CFG.BEHAVIOR;
    var pool = [
      ['glanceL', B.wGlance],
      ['glanceR', B.wGlance],
      ['tailFlick', B.wTailFlick],
      ['tailUp', B.wTailUp]
    ];
    if (this.meters.energy < 0.45) pool.push(['yawn', B.wYawn]);

    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += pool[i][1];
    var r = Math.random() * total;
    var kind = pool[0][0];
    for (i = 0; i < pool.length; i++) {
      r -= pool[i][1];
      if (r <= 0) { kind = pool[i][0]; break; }
    }

    this._flourish = { kind: kind, t: 0, dur: B.flourishDur[kind] || 1.2 };
    if (kind === 'yawn' && this.onSay) this.onSay('sleepy');
  };

  Shiro.updateFlourish = function (dt) {
    var B = CFG.BEHAVIOR;

    if (this._flourish) {
      this._flourish.t += dt;
      var done = this._flourish.t >= this._flourish.dur;
      var interrupted = !this._sm.is('idle') || this.petting || this.dragging;
      if (done || interrupted) {
        this._flourish = null;
        this._flourishGap = U.rand(B.flourishMin, B.flourishMax);
      }
      return;
    }

    /* Only while idling; the cursor holds her gaze otherwise. */
    if (!this._sm.is('idle') || this.petting || this.dragging) return;
    this._flourishGap -= dt;
    if (this._flourishGap <= 0) this.rollFlourish();
  };

  /* 1 = eyes half closed (closing/opening), 2 = fully shut, null = not blinking */
  Shiro.blinkAt = function () {
    if (this._blinkShow <= 0) return null;
    var p = 1 - (this._blinkShow / CFG.BEHAVIOR.blinkDur);
    return (p >= 0.4 && p < 0.6) ? 2 : 1;
  };

  /* ---------- frame choice ------------------------------------------------ */

  Shiro.frameFor = function () {
    var st = this._sm.state;
    var t = this._sm.time;
    var Bh = CFG.BEHAVIOR;

    /* A short leading frame then a two-frame loop reads as a cycle without
     * needing a separate "loop start" per state. */
    function cyc(frames, lead, rate) {
      if (t < lead) return frames[0];
      return frames[1 + (Math.floor((t - lead) * rate) % (frames.length - 1))];
    }

    if (st === 'sleep') return (Math.sin(this._bob) > 0) ? 'sleep_0' : 'sleep_1';
    if (st === 'react') return (t < 0.16) ? 'react_0' : 'react_1';
    if (st === 'walk') return 'walk_' + (Math.floor(t * 7) % 4);

    if (st === 'jump') {
      if (t < Bh.jumpDur * 0.22) return 'jump_0';
      if (t < Bh.jumpDur * 0.5) return 'jump_1';
      if (t < Bh.jumpDur * 0.78) return 'jump_2';
      return 'jump_3';
    }
    if (st === 'pounce') {
      if (t < Bh.pounceDur * 0.3) return 'pounce_0';
      if (t < Bh.pounceDur * 0.7) return 'pounce_1';
      return 'pounce_2';
    }
    if (st === 'eat') return cyc(['eat_0', 'eat_1', 'eat_2', 'eat_1'], 0.25, 3.2);
    if (st === 'drink') return cyc(['drink_0', 'drink_1'], 0.2, 3.0);
    if (st === 'groom') return (Math.sin(t * 2.2) > 0) ? 'groom_0' : 'groom_1';
    if (st === 'wash') return (Math.sin(t * 2.6) > 0) ? 'wash_0' : 'wash_1';
    if (st === 'tree') return (Math.sin(t * 1.9) > 0) ? 'tree_0' : 'tree_1';

    var breathing = Math.sin(this._bob) > 0.55;
    var base = breathing ? 'idle_breathe' : 'idle_open';
    var blink = this.blinkAt();

    if (st === 'sit') return blink === 2 ? 'sit_closed' : 'sit_open';

    /* ---- idle: an active flourish outranks blinking and cursor gaze ---- */
    var f = this._flourish;
    if (f) {
      var p = f.t / f.dur;
      switch (f.kind) {
        case 'glanceL':
          if (this.look === 0) return 'idle_look_left';
          break;
        case 'glanceR':
          if (this.look === 0) return 'idle_look_right';
          break;
        case 'yawn':
          return 'idle_yawn';
        case 'tailFlick':
          /* two quick kicks, then settle back onto the base pose */
          if (Math.floor(f.t / (f.dur / 4)) % 2 === 1) return base + '_tailFlick';
          return base;
        case 'tailUp':
          /* raise (15%) — hold with a lazy sway (70%) — lower (15%) */
          if (p > 0.15 && p < 0.85) {
            return base + (Math.sin(f.t * 3.2) > 0 ? '_tailUp1' : '_tailUp0');
          }
          return base;
      }
    }

    /* ---- idle: blink, then gaze, then breathe ---- */
    if (blink === 1) return 'idle_blink_mid';
    if (blink === 2) return breathing ? 'idle_breathe_closed' : 'idle_closed';
    if (this.look < 0) return 'idle_look_left';
    if (this.look > 0) return 'idle_look_right';
    return base;
  };

  /* ---------- draw -------------------------------------------------------- */

  Shiro.draw = function (g) {
    var light = NESCAT.Scene.light;
    var ambient = light ? light.ambient : null;
    var amt = light ? light.ambientAmt : 0;

    /* She is authored facing right and mirrored to face left. Mid-air the
     * shadow stays on the floor and shrinks, which is what sells the height. */
    var lift = this._lift || 0;
    var air = lift / 14;

    g.noStroke();
    g.fill(0, 0, 0, Math.round(60 * (1 - air * 0.55)));
    g.ellipse(this.x + 16, NESCAT.Scene.FEET_Y + 2,
              30 - air * 14, 7 - air * 3);

    /* particles behind the cat if they are "above" her */
    this.drawParticles(g, false);

    NESCAT.Sprite.draw(g, this.sprite, this.frameFor(), this.x, this.y - lift, {
      ambient: ambient,
      ambientAmt: amt,
      flip: this.facing < 0
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
