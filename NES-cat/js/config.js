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
      /* How long she thinks before doing something. Measured over five
       * minutes of real running, the previous 6-13s left her standing in
       * idle for 63% of it, which is right for an ambient companion and
       * wrong for a box of animations — the point of this piece is what she
       * does, and at that ratio a third of the repertoire never showed up.
       * Faster decisions, and less sitting, and she spends her time doing
       * it. */
      wanderMin: 4.5,      /* s between idle -> walk rolls */
      wanderMax: 9.5,
      walkMin: 2.6,
      walkMax: 5.0,
      /* logical px of ground covered per walk frame. Stepping is driven by
       * distance rather than by a clock so the paws never skate. */
      walkStride: 5.2,
      sitMin: 4.0,
      sitMax: 8.5,
      reactMin: 1.5,
      reactMax: 2.4,
      /* bump: the headbutt into a hand. A short press is one; holding the
       * press keeps her in it, easing in and out as long as you do. */
      bumpDur: 0.95,
      /* Sleeping is a function of the clock and of how long she has been up,
       * not of a bar. `sleepChanceNight/Day` are ceilings, scaled by how worn
       * out she is and suppressed entirely until `sinceSleepGap` has passed,
       * so a cat who has just woken cannot immediately roll herself back into
       * bed at three in the morning. */
      sleepChanceNight: 0.85,  /* ceiling when dark */
      sleepChanceDay: 0.10,    /* ceiling in daylight — a nap, not a night */
      blinkMin: 2.2,
      blinkMax: 6.5,
      blinkDur: 0.16,        /* one blink: half-closed -> shut -> half-open */
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
      scratchDur: 3.0,
      approachSpeed: 46,
      /* how close counts as "arrived" at a fixture */
      arriveEps: 3,

      /* Odds that a wander roll becomes each activity. An activity gated on
       * a meter or on the room (eating needs food in the bowl) is skipped
       * when unavailable rather than re-rolled. */
      /* Sitting carries the most weight of any single state on purpose:
       * activities keep her crossing the room, and she does need to stand
       * still for the idle flourishes (glance, tail flick, yawn) to be
       * visible at all. It is still the largest number here — it is just no
       * longer so far ahead of everything else that sitting is what she does
       * most of the time. */
      wSit: 40,
      wGroom: 16,
      wWatch: 22,
      wWash: 12,
      wTree: 18,
      wScratch: 22,
      wYarn: 20,
      wJump: 10,
      /* the cat tree is only worth jumping at when she is already near it */
      treeNearX: 26,

      /* --- what drives her, now there are no meters ----------------------
       *
       * The three bars are gone. Two of them existed only to be displayed, but
       * all three were gating behaviour, so this is not a HUD change — it is
       * the thing that decides what she does next.
       *
       * What replaces them is honest about the reason. She sleeps because it
       * is night and she has been up a while. She eats because her bowl has
       * been going a while and the scene refills it. She is lively in the
       * morning and slow in the small hours. All of it is derived from the
       * clock the room already runs, so the cause is visible in the room
       * rather than having to be read off a gauge.
       *
       * `awake` is the only number that looks like the old energy meter, and
       * it is never displayed. It is not a resource she spends — it is the
       * state the clock puts her in, and the behaviour reads it the way you
       * would read the light coming through the window. */
      awake: {
        drift: 0.0075,     /* per second, while she is up */
        sleepGain: 0.10,   /* per second, while she is asleep */
        floor: 0.30        /* how worn out she gets before sleeping is a relief */
      },
      sinceSleepGap: 55,  /* s she must be up before a nap is on the cards */
      foodGap: 55,         /* s before she looks for the food bowl */
      drinkGap: 95,        /* s before she looks for the water bowl */

      /* the hunt. A pounce sends the yarn rolling across the room, and a cat
       * that has just batted something does not sit down and admire it — she
       * goes after it. chase reuses the walk cycle with a shorter stride and
       * a longer stride of ground per second, which at 32px is the difference
       * between walking and running. */
      chaseSpeed: 64,        /* logical px/s, well above approachSpeed */
      chaseStride: 3.2,      /* shorter stride than a walk: paws cycle faster */
      chaseMax: 2,           /* pounce-chase rounds before she loses interest */

      /* stalk: the creep before a pounce. Deliberately slower than an
       * approach — she is not going somewhere, she is lying in wait, and the
       * slowness is the tell. stalkHold is how long she stays coiled at the
       * end before she actually springs. */
      stalkSpeed: 15,        /* logical px/s: a creep, not a walk */
      stalkHold: 0.9,
      wStalk: 20,

      /* circle: trampling a spot before lying down on it. Cats do this almost
       * every time, and it is the reason a cat settles somewhere new rather
       * than just deciding to. Purely a code animation — she turns on the
       * spot in profile, so the arc is foreshortened to a small horizontal
       * swing with the facing flipping at each extreme, and the walk cycle
       * keeps stepping underneath it. */
      circleDur: 2.6,
      circleRadius: 13,     /* logical px of swing either side of the spot */
      circleTurns: 1.5,     /* rotations over circleDur */
      circleChance: 0.55,   /* of settling into a loaf, circle first */

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
      /* the beat between finishing a stretch and turning back to the room. It
       * exists to be seen: side_stretch_3 is the pose she is actually standing
       * still in, and it is what the turn pivots from, so it has to land
       * before the rotation rather than being cut by it. */
      stretchReleaseDur: 0.4,
      /* the same beat for the two perch activities, for the same reason.
       * `tree` and `scratch` both ended on a frame caught mid-gesture —
       * tree_0 is the top of a reach, scratch_0 is the paw at the top of a
       * rake — and endActivity() hands the turn whatever frame is on screen,
       * so the rotation pivoted out of an unfinished posture. These two
       * durations own the settled pose instead. They are separate constants
       * rather than one shared beat even though both are 0.4 today, because a
       * settle is the first thing anyone would retune when a performance reads
       * too long, and a bat and a scratch should not move together when that
       * happens. */
      treeSettleDur: 0.4,
      scratchSettleDur: 0.4,
      loafDur: 5.5,
      wStretch: 18,
      wLoaf: 14,

      /* the rest of the idle repertoire */
      shakeDur: 0.52,     /* the shudder on landing after being carried */
      alertDur: 1.15,
      alertSnapDur: 0.4,
      kneadDur: 4.2,
      /* nod: sitting up and losing a fight with sleep. The droop-and-recover
       * beats, and how long she sits there before the last one does not come
       * back up. She reaches it from the tiredness roll rather than from the
       * activity pool — see rollNext — so it is not a weight to tune but a
       * length. */
      nodBeat: 0.85,
      nodDur: 4.6,
      wAlert: 12,
      wKnead: 15,
      sleepSettle: 0.9,   /* she curls down into sleep rather than snapping */
    },

    /* --- input ----------------------------------------------------------- *
     * The two thresholds that decide what a press means. These lived as
     * constants at the top of input.js, which made them the two numbers in
     * the whole piece that config.js did not actually own — and config.js
     * claiming to be the tuning surface while the drag threshold was not in
     * it is how that claim stops being true. */
    INPUT: {
      dragThreshold: 6,     /* logical px a press must travel to become a drag */
      gazeDeadzone: 6       /* logical px of cursor offset before she glances */
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
     * Keyed by situation; ui.js picks and speaks them. The keys are the
     * things she can be doing or the light she is doing it in — there is no
     * 'hungry' any more, because there is no longer a number for it to be
     * read off, and a line about being hungry with a full bowl on screen is
     * worse than no line. */
    DIALOGUE: {
      start: ['hi! i am shiro.', 'good to see you.', 'welcome home.'],
      pet: ['purrr~', 'that is nice.', 'more please!', 'mmm...'],
      play: ['wheee!', 'catch me!', 'again again!'],
      nom: ['yum.', 'mmn.', 'this is the good stuff.', 'nom.'],
      sleepy: ['so sleepy...', 'nap time.', 'zzz...'],
      wake: ['mm? oh! hi.', 'i was dreaming.'],
      night: ['it is dark.', 'stars out.', 'quiet in here.'],
      happy: ['i love it here.', 'best day.', 'this is the spot.'],
      alert: ['what was that?', 'did you hear?', 'hm?'],
      bird: ['bird!', 'did you see that?', 'on the window!'],
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
