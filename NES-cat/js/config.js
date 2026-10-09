/* ============================================================
 * NES-cat — config.js
 *
 * The single tuning surface for the whole piece: render size, behaviour
 * timings, meter rates, audio settings and the day/night keyframes.
 * Loaded first; everything else reads from NESCAT.config.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});

  NESCAT.config = {
    /* --- rendering ---------------------------------------------------- */
    LOGICAL_W: 320,          /* pre-scale pixel grid (16:9) */
    LOGICAL_H: 180,
    SPRITE: 32,              /* Shiro's sprite grid, in logical pixels */
    THEME_BG: '#212529',     /* NES.css black — the space around the stage */
    MIN_SCALE: 1,

    CAT_NAME: 'Shiro',

    /* --- behaviour ---------------------------------------------------- */
    BEHAVIOR: {
      wanderMin: 6.0,        /* s between idle -> walk rolls */
      wanderMax: 13.0,
      walkMin: 2.6,
      walkMax: 5.0,
      sitMin: 5.0,
      sitMax: 11.0,
      reactMin: 1.5,
      reactMax: 2.4,
      sleepChanceNight: 0.9, /* chance a wander roll becomes "go to sleep" at night */
      sleepChanceDay: 0.08,
      blinkMin: 2.2,
      blinkMax: 6.5,
      gazeRange: 46,         /* logical px of cursor offset that maxes the glance */
      bobSpeed: 7.0          /* head bob for the breathe animation */
    },

    /* --- meters (all 0..1) -------------------------------------------- */
    METERS: {
      start: { mood: 0.74, energy: 0.66, hunger: 0.22 },
      /* per-second drift — deliberately slow ("ambient", not tamagotchi) */
      drift: {
        mood: -0.0013,
        energy: -0.0007,
        hunger: 0.0022
      },
      /* instant deltas from interactions */
      pet: { mood: 0.05, energy: -0.001, hunger: 0 },
      play: { mood: 0.07, energy: -0.055, hunger: 0.012 },
      sleep: { mood: 0.004, energy: 0.022, hunger: 0.001 },
      petHoldPerSecond: 0.055,   /* while a pet press is held */
      clamp: [0, 1]
    },

    /* --- audio --------------------------------------------------------- */
    AUDIO: {
      bpm: 84,
      master: 0.30,
      stepsPerBeat: 2,                    /* eighth-note grid */
      scale: [0, 3, 5, 7, 10],            /* minor pentatonic, semitones */
      root: 220,                          /* A3 */
      noteChance: 0.5,
      bassEvery: 4,                       /* bass note every N steps */
      cutoff: 1500,
      delayTime: 0.34,
      delayFeedback: 0.3,
      muteKey: 'nescat.muted'
    },

    /* --- persistence --------------------------------------------------- */
    STORE_KEY: 'nescat.save.v1',
    SAVE_THROTTLE_MS: 1500,

    /* --- day/night ------------------------------------------------------ *
     * Keyframes by hour, interpolated around the clock. `ambient`/`ambientAmt`
     * are applied to the cat sprite so it sits in the room's light.        */
    DAYNIGHT: [
      { h: 0.0, wall: '#2b2b4a', floor: '#1d1d33', window: '#131327', glow: 0.16, ambient: '#2b2b4a', ambientAmt: 0.42 },
      { h: 5.0, wall: '#3a3858', floor: '#2a2740', window: '#2a2a55', glow: 0.22, ambient: '#3a3858', ambientAmt: 0.38 },
      { h: 6.5, wall: '#8a6f8e', floor: '#6b4f46', window: '#e8a06a', glow: 0.42, ambient: '#c08a86', ambientAmt: 0.22 },
      { h: 8.0, wall: '#cbb79a', floor: '#a9743f', window: '#ffe9a8', glow: 0.72, ambient: '#ffffff', ambientAmt: 0.05 },
      { h: 12.0, wall: '#d9c7a7', floor: '#b07d45', window: '#fff4cf', glow: 0.92, ambient: '#ffffff', ambientAmt: 0.0 },
      { h: 16.0, wall: '#d2bd9a', floor: '#a9743f', window: '#ffe6a0', glow: 0.82, ambient: '#fff3d6', ambientAmt: 0.06 },
      { h: 18.5, wall: '#b5766a', floor: '#8a5533', window: '#ff9e5a', glow: 0.55, ambient: '#e79a6a', ambientAmt: 0.18 },
      { h: 20.5, wall: '#5c4266', floor: '#43304a', window: '#4a3a7a', glow: 0.30, ambient: '#6a5288', ambientAmt: 0.34 },
      { h: 24.0, wall: '#2b2b4a', floor: '#1d1d33', window: '#131327', glow: 0.16, ambient: '#2b2b4a', ambientAmt: 0.42 }
    ],

    /* --- dialogue ------------------------------------------------------- *
     * Keyed by situation; ui.js picks and speaks them.                    */
    DIALOGUE: {
      start: ['hi! i am shiro.', 'good to see you.', 'welcome home.'],
      pet: ['purrr~', 'that is nice.', 'more please!', 'mmm...'],
      play: ['wheee!', 'catch me!', 'again again!'],
      sleepy: ['so sleepy...', 'nap time.', 'zzz...'],
      wake: ['mm? oh! hi.', 'i was dreaming.'],
      hungry: ['my tummy is rumbly.', 'snack?'],
      happy: ['i love it here.', 'best day.'],
      idle: ['nice light today.', 'i like this room.', 'just sitting.']
    }
  };

  /* --- tiny shared helpers --------------------------------------------- */
  NESCAT.util = {
    clamp: function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    smooth: function (t) { return t * t * (3 - 2 * t); },
    rand: function (a, b) { return a + Math.random() * (b - a); },
    randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    chance: function (p) { return Math.random() < p; },
    hexToRgb: function (hex) {
      var h = String(hex).replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    },
    rgbToHex: function (r, g, b) {
      var U = NESCAT.util;
      function h(v) {
        var s = Math.round(U.clamp(v, 0, 255)).toString(16);
        return s.length < 2 ? '0' + s : s;
      }
      return '#' + h(r) + h(g) + h(b);
    },
    mixHex: function (a, b, t) {
      var U = NESCAT.util, A = U.hexToRgb(a), B = U.hexToRgb(b);
      return U.rgbToHex(
        A.r + (B.r - A.r) * t,
        A.g + (B.g - A.g) * t,
        A.b + (B.b - A.b) * t
      );
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
