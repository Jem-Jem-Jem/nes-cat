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

    /* Interpolate the day/night keyframes for a fractional hour (0..24). */
    at: function (hour) {
      var k = NESCAT.config.DAYNIGHT;
      var h = ((hour % 24) + 24) % 24;
      var a = k[0], b = k[k.length - 1];

      for (var i = 0; i < k.length - 1; i++) {
        if (h >= k[i].h && h <= k[i + 1].h) { a = k[i]; b = k[i + 1]; break; }
      }
      var span = (b.h - a.h) || 1;
      var t = U.smooth(U.clamp((h - a.h) / span, 0, 1));

      return {
        wall:       U.mixHex(a.wall, b.wall, t),
        floor:      U.mixHex(a.floor, b.floor, t),
        window:     U.mixHex(a.window, b.window, t),
        glow:       U.lerp(a.glow, b.glow, t),
        ambient:    U.mixHex(a.ambient, b.ambient, t),
        ambientAmt: U.lerp(a.ambientAmt, b.ambientAmt, t),
        isNight:    h < 6 || h >= 20
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
