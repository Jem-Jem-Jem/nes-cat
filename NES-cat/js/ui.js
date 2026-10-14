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
      /* Only the two nodes this file still has a BEHAVIOUR for. Everything it
       * used to look up — the name, the clock, the dialogue text, the gate —
       * is React's now, and reaching for them here would be two owners
       * fighting over one node. See js/react/store.js. */
      this.els = {
        gateBtn: d.getElementById('gate-start'),
        mute: d.getElementById('mute')
      };

      /* The name is config, and config.js loads AFTER the shell mounts, so it
       * travels through the store rather than being read at render time. */
      NESCAT.store.set({ name: CFG.CAT_NAME });

      var self = this;

      /* PRESS START gate — also the user gesture that unlocks audio. */
      if (this.els.gateBtn) {
        this.els.gateBtn.addEventListener('click', function () { self.begin(); });
      }
      root.addEventListener('keydown', function (e) {
        /* read the gate's state from the store rather than off its className:
         * the class is React's output now, and asking the DOM what React
         * believes is a round trip that can go stale */
        if (!NESCAT.store.get().started &&
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
      NESCAT.store.set({ started: true });
      NESCAT.Audio.start();
      this.refreshMute();
      this.say('start');
    },

    /* React renders; this publishes. See js/react/store.js — imperative code
     * writes into the store and never touches a rendered node's text, so there
     * is exactly one owner per piece of text and it is React. */
    refreshMute: function () {
      NESCAT.store.set({ muted: !!NESCAT.Audio.muted });
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
      this._lastN = 0;                    /* characters already voiced */
      this._typing = true;
      this._gap = 2.2;
      /* each line starts its own little melody */
      if (NESCAT.Audio && NESCAT.Audio.resetVoice) NESCAT.Audio.resetVoice();
      NESCAT.store.set({ dialogue: '' });
    },

    update: function (dt) {
      if (!this.ready) return;
      if (this._gap > 0) this._gap -= dt;

      /* typewriter */
      if (this._typing) {
        this._shown += TYPE_CPS * dt;
        var n = Math.floor(this._shown);
        /* one voice blip per character that just appeared, so she is
         * audibly speaking the line as it is written */
        if (n > this._lastN) {
          var fresh = this._full.slice(this._lastN, n);
          if (NESCAT.Audio && NESCAT.Audio.blip) {
            for (var c = 0; c < fresh.length; c++) {
              /* punctuation gets a beat of silence, like punctuation */
              if ('.,!?~'.indexOf(fresh.charAt(c)) >= 0) continue;
              NESCAT.Audio.blip();
            }
          }
        }
        this._lastN = n;
        if (n >= this._full.length) {
          this._typing = false;
          this.setDialogue(this._full, false);
        } else {
          this.setDialogue(this._full.slice(0, n), true);
        }
      }

      /* Idle chatter. This used to pick a line by reading her three meters,
       * which meant the thing she said was a readout of hidden state rather
       * than anything to do with the room. It is keyed to the clock and to
       * what she is doing now instead, so a line and the picture behind it
       * agree — she says she is sleepy in a dark room, not because a bar
       * dropped below a number. */
      this._nextIdle -= dt;
      if (this._nextIdle <= 0) {
        this._nextIdle = U.rand(IDLE_MIN, IDLE_MAX);
        var S = NESCAT.Shiro;
        if (S._sm.is('sleep')) this.say('sleepy');
        else if (NESCAT.Scene.isNight) this.say('night');
        else if (S._sm.is('loaf') || S._sm.is('circle')) this.say('happy');
        else this.say('idle');
      }

      this.updateClock();
    },

    /* The cursor is React's job: it renders `text + (typing ? '▮' : '')`. All
     * this publishes is the string and whether it is still growing, so the
     * component owns the one character the CSS and the eye agree on. */
    setDialogue: function (text, typing) {
      NESCAT.store.set({ dialogue: text, typing: !!typing });
    },

    updateClock: function () {
      var h = NESCAT.Scene.hour;
      var hh = Math.floor(h);
      var mm = Math.floor((h - hh) * 60);
      var label = (hh % 12 === 0 ? 12 : hh % 12) + ':' + (mm < 10 ? '0' : '') + mm +
                  (hh < 12 ? 'am' : 'pm');
      var phase = NESCAT.Scene.isNight ? 'night' : 'day';
      NESCAT.store.set({ clock: label + ' · ' + phase });
    }
  };

  NESCAT.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
