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
      blinkDur: 0.16,        /* one blink: half-closed -> shut -> half-open */
      gazeRange: 46,         /* logical px of cursor offset that maxes the glance */
      bobSpeed: 7.0,          /* head bob for the breathe animation */

      /* idle flourishes — the small self-started animations that keep her
       * alive between interactions (see Shiro.rollFlourish). These fire
       * while she is idling *or* sitting; the gaps are short because she
       * does not stay still for long any more. */
      flourishMin: 2.2,      /* s between flourishes */
      flourishMax: 6.0,
      wGlance: 26,           /* relative odds of each flourish being rolled */
      wTailFlick: 26,
      wTailUp: 22,
      wYawn: 16,
      flourishDur: {
        glanceL: 1.2,
        glanceR: 1.2,
        tailFlick: 0.6,
        tailUp: 3.4,
        yawn: 1.6
      },

      /* --- activities ---------------------------------------------------- *
       * Each is a state that walks her to a fixture, performs, and returns
       * to idle. `approachSpeed` is logical px/s while closing the gap. */
      jumpDur: 0.62,
      jumpHeight: 13,        /* logical px her paws clear the floor */
      eatDur: 2.6,
      drinkDur: 2.1,
      groomDur: 3.4,
      washDur: 2.8,
      pounceDur: 0.75,
      pounceHeight: 10,
      treeDur: 2.2,
      approachSpeed: 46,
      /* how close counts as "arrived" at a fixture */
      arriveEps: 3,

      /* Odds that a wander roll becomes each activity. An activity gated on
       * a meter or on the room (eating needs food in the bowl) is skipped
       * when unavailable rather than re-rolled. */
      /* Sitting carries the most weight on purpose: activities keep her
       * crossing the room, and she needs to actually stand still for the
       * idle flourishes (glance, tail flick, yawn) to be visible at all. */
      wSit: 62,
      wGroom: 16,
      wWatch: 22,
      wWash: 12,
      wTree: 18,
      wYarn: 20,
      wJump: 10,
      /* hunger climbs as she gets hungry; past this she heads for the bowl */
      hungryBelow: 0.45,
      /* the cat tree is only worth jumping at when she is already near it */
      treeNearX: 26,

      /* how high she can be lifted when picked up (logical px above the
       * floor); keeps a drag from dragging her off the top of the room */
      carryLiftMax: 64,

      /* the carried animation, as a sequence rather than a loop: the "!" as her
       * paws leave the floor, the hang, the startled kicks, then settling */
      held: { lift: 0.34, dangle: 1.15, kick: 0.55 },

      /* the rotation between the front and profile views. turnDur spans the
       * from-pose, both three-quarter frames and the hand-off, so ~0.45s
       * reads as a deliberate pivot rather than a flicker. */
      turnDur: 0.45,
      /* how long she stays turned, and the idle postures. A stretch is mostly
       * hold — the pose is the point, not the motion into it — while a
       * loaf is a long settle with nothing to do. */
      watchDur: 2.6,
      stretchDur: 1.7,
      loafDur: 5.5,
      wStretch: 18,
      wLoaf: 14
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
      eat: { mood: 0.02, energy: 0.012, hunger: -0.30 },
      drink: { mood: 0.012, energy: 0.010, hunger: -0.02 },
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

      /* Shiro's voice: one blip per typed character. `blipPitch` is a motif
       * of semitone offsets walked in order and reset each line, so a
       * sentence gets its own little melody instead of a flat buzz. */
      blipOctave: 4,                      /* above the music root -> small voice */
      blipDur: 0.045,
      blipVol: 0.045,
      blipPitch: [0, 3, 5, 3, 7, 5, 3, 0],
      muteKey: 'nescat.muted'
    },

    /* --- persistence --------------------------------------------------- */
    STORE_KEY: 'nescat.save.v1',
    SAVE_THROTTLE_MS: 1500,

    /* --- day/night ------------------------------------------------------ *
     * There is no table here on purpose. Lighting is derived from the sun's
     * height in palette.at(), so dawn and dusk are a consequence of the
     * clock rather than a list of hand-placed conditions. The one thing you
     * can still tune is how dark the room gets at night.               */
    NIGHT_DIM: 0.44,        /* peak ambient tint applied to the room/cat */

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
