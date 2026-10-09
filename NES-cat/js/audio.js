/* ============================================================
 * NES-cat — audio.js
 *
 * Generative chiptune. There is no fixed melody: every step picks from a
 * minor-pentatonic pool, so the loop never repeats exactly.
 *
 * Signal chain:  voice -> lowpass -> (dry to master, + delay/echo) -> master
 *
 * NOTE ON p5.sound: this project ships p5.sound 15.x, whose node wrappers
 * (p5.Gain / p5.Filter / p5.Delay / p5.Envelope) have a different and partial
 * API than classic p5.sound — e.g. `p5.Gain.amp()` throws and
 * `p5.Filter.freq()` does not exist. We therefore still rely on p5.sound for
 * what it does provide reliably — the shared AudioContext (`getAudioContext()`)
 * and the autoplay unlock (`userStartAudio()`) — and schedule the chiptune on
 * that context with the Web Audio API. Everything is synthesised in code; no
 * audio assets.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});
  var U = NESCAT.util;
  var CFG = NESCAT.config;
  var A = CFG.AUDIO;

  var Audio = {
    available: false,
    started: false,
    muted: false,

    beat: 0,            /* beats since start */
    pulse: 0,           /* 1 -> 0 decay, for beat-synced visuals */
    onBeat: [],

    _ctx: null,
    _master: null,
    _filter: null,
    _timer: null,
    _step: 0,

    /* ---------- setup ---------------------------------------------------- */

    init: function () {
      this.muted = this._loadMuted();
      /* p5.sound exposes these as globals in p5's global mode. */
      this.available = (typeof root.getAudioContext === 'function');
      return this.available;
    },

    /* Must be called from a user gesture (the PRESS START gate). */
    start: function () {
      if (this.started) { this.setMuted(this.muted); return; }
      if (!this.available) return;

      try {
        if (typeof root.userStartAudio === 'function') root.userStartAudio();

        var ctx = root.getAudioContext();
        if (!ctx) { this.available = false; return; }
        if (ctx.state === 'suspended' && ctx.resume) {
          /* resolves once the gesture is accepted; ignore rejection */
          var p = ctx.resume();
          if (p && p.catch) p.catch(function () {});
        }

        this._ctx = ctx;
        this._buildGraph();

        this.started = true;
        this._step = 0;
        this._schedule();
      } catch (err) {
        if (root.console && console.warn) console.warn('NES-cat: audio unavailable —', err);
        this.available = false;
        this.started = false;
      }
    },

    _buildGraph: function () {
      var ctx = this._ctx;

      var master = ctx.createGain();
      master.gain.value = this.muted ? 0 : A.master;
      master.connect(ctx.destination);

      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = A.cutoff;
      filter.Q.value = 1.1;
      filter.connect(master);            /* dry */

      /* simple feedback echo for a bit of space */
      var delay = ctx.createDelay(1.0);
      delay.delayTime.value = A.delayTime;
      var fb = ctx.createGain();
      fb.gain.value = A.delayFeedback;
      var wet = ctx.createGain();
      wet.gain.value = 0.30;

      filter.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(master);

      this._master = master;
      this._filter = filter;
      this._delay = delay;
    },

    _schedule: function () {
      var self = this;
      var stepMs = (60000 / A.bpm) / A.stepsPerBeat;
      if (this._timer) clearInterval(this._timer);
      this._timer = setInterval(function () { self._tick(); }, stepMs);
    },

    /* ---------- sequencing ------------------------------------------------- */

    _tick: function () {
      if (!this.started) return;
      var step = this._step++;

      if (step % A.stepsPerBeat === 0) {
        this.beat++;
        this.pulse = 1;
        for (var i = 0; i < this.onBeat.length; i++) this.onBeat[i](this.beat);
      }
      if (this.muted) return;

      var ctx = this._ctx;
      var t = ctx.currentTime + 0.02;

      /* melody: sparse, random pentatonic degree + octave */
      if (Math.random() < A.noteChance) {
        var semi = U.pick(A.scale);
        var oct = U.pick([1, 2, 2]);
        var freq = A.root * Math.pow(2, semi / 12) * oct;
        this._voice(freq, t, 0.18, U.chance(0.75) ? 'square' : 'triangle', 0.09);
      }

      /* bass every few steps */
      if (step % A.bassEvery === 0) {
        var bdeg = U.pick([0, 0, 3, 5]);
        this._voice(A.root / 2 * Math.pow(2, bdeg / 12), t, 0.42, 'triangle', 0.15);
      }
    },

    /* One synthesised note. The oscillator is disposed on `ended`, so a long
     * session does not accumulate audio nodes. */
    _voice: function (freq, t, dur, wave, vol) {
      var ctx = this._ctx;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();

      osc.type = wave;
      osc.frequency.setValueAtTime(freq, t);

      /* exponential ramps need a non-zero start value */
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc.connect(gain);
      gain.connect(this._filter);
      osc.start(t);
      osc.stop(t + dur + 0.03);
      osc.onended = function () {
        try { osc.disconnect(); gain.disconnect(); } catch (e) { /* already gone */ }
      };
    },

    /* ---------- control ---------------------------------------------------- */

    setMuted: function (m) {
      this.muted = !!m;
      this._saveMuted(this.muted);
      try {
        if (this._master) this._master.gain.value = this.muted ? 0 : A.master;
      } catch (e) { /* ok */ }
      return this.muted;
    },

    toggleMute: function () { return this.setMuted(!this.muted); },

    /* ---------- persistence -------------------------------------------------- */

    _loadMuted: function () {
      try { return root.localStorage.getItem(A.muteKey) === '1'; }
      catch (e) { return false; }
    },

    _saveMuted: function (m) {
      try { root.localStorage.setItem(A.muteKey, m ? '1' : '0'); }
      catch (e) { /* ok */ }
    },

    /* decay the visual pulse */
    update: function (dt) {
      if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 3.2);
    }
  };

  NESCAT.Audio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
