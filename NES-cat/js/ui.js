/* ============================================================
 * NES-cat — ui.js
 *
 * The NES.css shell around the canvas: the PRESS START gate, the title
 * bar, the dialogue box (typewriter), the Mood/Energy/Hunger bars and the
 * sound toggle. All of it is plain DOM positioned over the canvas.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});
  var U = NESCAT.util;
  var CFG = NESCAT.config;

  var TYPE_CPS = 30;          /* characters per second */
  var IDLE_MIN = 24, IDLE_MAX = 52;

  var UI = {
    ready: false,
    _typed: '',
    _shown: 0,
    _full: '',
    _typing: false,
    _lastKey: null,
    _nextIdle: 0,
    _gap: 0,

    init: function () {
      var d = document;
      this.els = {
        gate: d.getElementById('gate'),
        gateBtn: d.getElementById('gate-start'),
        dialogue: d.getElementById('dialogue'),
        dialogueText: d.getElementById('dialogue-text'),
        name: d.getElementById('cat-name'),
        clock: d.getElementById('clock'),
        mute: d.getElementById('mute'),
        bars: {
          mood: d.getElementById('bar-mood'),
          energy: d.getElementById('bar-energy'),
          hunger: d.getElementById('bar-hunger')
        },
        vals: {
          mood: d.getElementById('val-mood'),
          energy: d.getElementById('val-energy'),
          hunger: d.getElementById('val-hunger')
        }
      };

      if (this.els.name) this.els.name.textContent = CFG.CAT_NAME;

      var self = this;

      /* PRESS START gate — also the user gesture that unlocks audio. */
      if (this.els.gateBtn) {
        this.els.gateBtn.addEventListener('click', function () { self.begin(); });
      }
      root.addEventListener('keydown', function (e) {
        if (self.els.gate && !self.els.gate.classList.contains('is-hidden') &&
            (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          self.begin();
        }
      });

      if (this.els.mute) {
        this.els.mute.addEventListener('click', function () {
          var m = NESCAT.Audio.toggleMute();
          self.refreshMute();
          self.say(m ? 'idle' : 'happy');
        });
      }

      /* Shiro asks us to speak. */
      NESCAT.Shiro.onSay = function (key) { self.say(key); };

      this.refreshMute();
      this.ready = true;
      this._nextIdle = U.rand(IDLE_MIN, IDLE_MAX);
    },

    begin: function () {
      if (this.els.gate) this.els.gate.classList.add('is-hidden');
      NESCAT.Audio.start();
      this.refreshMute();
      this.say('start');
    },

    refreshMute: function () {
      if (!this.els.mute) return;
      var m = NESCAT.Audio.muted;
      this.els.mute.textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
      this.els.mute.classList.toggle('is-off', m);
    },

    say: function (key) {
      var lines = CFG.DIALOGUE[key];
      if (!lines || !lines.length) return;
      if (this._gap > 0 && key !== 'start' && key !== 'pet') return;

      /* avoid repeating the same line back to back */
      var line = U.pick(lines);
      for (var i = 0; i < 4 && line === this._lastKey; i++) line = U.pick(lines);
      this._lastKey = line;

      this._full = line;
      this._shown = 0;
      this._typing = true;
      this._gap = 2.2;
      if (this.els.dialogueText) this.els.dialogueText.textContent = '';
    },

    update: function (dt) {
      if (!this.ready) return;
      if (this._gap > 0) this._gap -= dt;

      /* typewriter */
      if (this._typing) {
        this._shown += TYPE_CPS * dt;
        var n = Math.floor(this._shown);
        if (n >= this._full.length) {
          this._typing = false;
          this.setDialogue(this._full, false);
        } else {
          this.setDialogue(this._full.slice(0, n), true);
        }
      }

      /* idle chatter */
      this._nextIdle -= dt;
      if (this._nextIdle <= 0) {
        this._nextIdle = U.rand(IDLE_MIN, IDLE_MAX);
        var m = NESCAT.Shiro.meters;
        if (m.hunger > 0.8) this.say('hungry');
        else if (m.energy < 0.2) this.say('sleepy');
        else if (m.mood > 0.75) this.say('happy');
        else this.say('idle');
      }

      this.updateBars();
      this.updateClock();
    },

    setDialogue: function (text, typing) {
      if (!this.els.dialogueText) return;
      this.els.dialogueText.textContent = text + (typing ? '▮' : '');
    },

    updateBars: function () {
      var m = NESCAT.Shiro.meters;
      var pairs = [['mood', m.mood], ['energy', m.energy], ['hunger', m.hunger]];
      for (var i = 0; i < pairs.length; i++) {
        var k = pairs[i][0], v = U.clamp(pairs[i][1], 0, 1);
        var bar = this.els.bars[k], val = this.els.vals[k];
        if (bar) {
          bar.value = Math.round(v * 100);
          /* NES.css colours the bar via these helper classes */
          bar.classList.remove('is-success', 'is-warning', 'is-error');
          if (k === 'mood') bar.classList.add(v > 0.5 ? 'is-success' : (v > 0.25 ? 'is-warning' : 'is-error'));
          else if (k === 'energy') bar.classList.add(v > 0.5 ? 'is-primary' : (v > 0.25 ? 'is-warning' : 'is-error'));
          else bar.classList.add(v < 0.6 ? 'is-success' : (v < 0.85 ? 'is-warning' : 'is-error'));
        }
        if (val) val.textContent = Math.round(v * 100) + '%';
      }
    },

    updateClock: function () {
      if (!this.els.clock) return;
      var h = NESCAT.Scene.hour;
      var hh = Math.floor(h);
      var mm = Math.floor((h - hh) * 60);
      var label = (hh % 12 === 0 ? 12 : hh % 12) + ':' + (mm < 10 ? '0' : '') + mm +
                  (hh < 12 ? 'am' : 'pm');
      var phase = NESCAT.Scene.isNight ? 'night' : 'day';
      this.els.clock.textContent = label + ' · ' + phase;
    }
  };

  NESCAT.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
