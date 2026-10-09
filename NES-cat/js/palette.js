/* ============================================================
 * NES-cat — palette.js
 *
 * A small NES.css-derived palette so the canvas and the HTML shell share
 * one set of colours. Also resolves the day/night keyframes from config.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});
  var U = NESCAT.util;

  /* NES.css core colours + a couple of cat accents. */
  var C = {
    black:     '#212529',   /* NES.css black  */
    ink:       '#343a40',
    greyDark:  '#495057',
    grey:      '#adb5bd',
    silver:    '#ced4da',
    white:     '#ffffff',
    disabled:  '#d3d3d3',
    primary:   '#209cee',   /* NES.css primary */
    primaryDk: '#0f6fb5',
    success:   '#92cc41',   /* NES.css success */
    warning:   '#f7d51d',   /* NES.css warning */
    error:     '#e76e55',   /* NES.css error   */
    pink:      '#f7a8c4',   /* ears + paw pads */
    nose:      '#ea7d9e'
  };

  /* Sprite character -> colour. Keep in sync with tools/build-sprites.js. */
  var CHAR = {
    K: C.black,      /* outline  */
    W: C.white,      /* body     */
    H: C.silver,     /* shade    */
    G: C.grey,       /* deep shade */
    P: C.pink,       /* pink     */
    N: C.nose,       /* nose     */
    E: C.black,      /* eyes     */
    B: C.pink,       /* blush    */
    M: C.greyDark    /* mouth    */
  };

  NESCAT.palette = {
    C: C,
    CHAR: CHAR,

    charColor: function (ch) { return CHAR[ch] || null; },

    /* Lighting is computed, not keyframed.
     *
     * This used to interpolate a hand-written table of stops, which meant
     * the room snapped between authored conditions and any hour between two
     * stops got a straight blend that looked invented rather than derived.
     *
     * Instead, derive everything from one continuous quantity — how high the
     * sun is — and let colour follow from it:
     *
     *   day      0 at sunrise/sunset and all night, 1 at solar noon
     *   night    1 while the sun is below the horizon
     *   golden   a band around sunrise and sunset, the warm low-sun light
     *
     * Every colour is a night->day mix, then pulled toward the golden tint
     * by however golden it is. Because `day` is a sine of the clock, the
     * result is continuous: no stop to fall between, and dawn and dusk fall
     * out of the maths rather than being placed by hand.
     */
    at: function (hour) {
      var h = ((hour % 24) + 24) % 24;

      var day = Math.sin(Math.PI * (h - 6) / 12);   /* <0 through the night */
      if (day < 0) day = 0;

      /* a softstep band: 0 -> 1 across lo..hi, used to build `golden` */
      function band(v, a, b, c, d) {
        var up = U.smooth(U.clamp((v - a) / (b - a || 1), 0, 1));
        var dn = U.smooth(U.clamp((v - c) / (d - c || 1), 0, 1));
        return up * (1 - dn);
      }

      var night = 1 - U.smooth(U.clamp(day / 0.12, 0, 1));
      /* The band's lower edge sits below zero so the warm light fades *into*
       * night instead of being switched off at sunset — a band starting at
       * day=0 vanishes within minutes, because the sun crosses that
       * threshold quickly. */
      var golden = band(day, -0.06, 0.30, 0.34, 0.85);

      var NIGHT_WALL = '#26264a', DAY_WALL = '#dccaa8', GOLD_WALL = '#c98a63';
      var NIGHT_FLOOR = '#1b1b32', DAY_FLOOR = '#b58247', GOLD_FLOOR = '#96552f';
      var NIGHT_WIN = '#101024', DAY_WIN = '#fff4cf', GOLD_WIN = '#ff9a52';
      var NIGHT_AMB = '#26264a', DAY_AMB = '#ffffff', GOLD_AMB = '#e79a6a';

      /* golden sits on top of the night->day mix, and its influence fades
       * as the sun climbs, so the room only ever gets brighter through the
       * morning instead of dipping when the tint lets go */
      function mix3(nightC, dayC, goldC) {
        return U.mixHex(U.mixHex(nightC, dayC, day), goldC, golden * (1 - day));
      }

      return {
        wall:       mix3(NIGHT_WALL, DAY_WALL, GOLD_WALL),
        floor:      mix3(NIGHT_FLOOR, DAY_FLOOR, GOLD_FLOOR),
        window:     mix3(NIGHT_WIN, DAY_WIN, GOLD_WIN),
        /* how much daylight actually spills into the room */
        glow:       0.14 + day * 0.78 + golden * 0.06,
        ambient:    mix3(NIGHT_AMB, DAY_AMB, GOLD_AMB),
        /* the room lightens gradually across the whole dawn, rather than
         * stepping at a fixed hour */
        ambientAmt: NESCAT.config.NIGHT_DIM * (1 - U.smooth(U.clamp(day / 0.42, 0, 1))) +
                    0.03 * day + 0.10 * golden,
        isNight:    day < 0.06
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
