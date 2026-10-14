/* ============================================================
 * NES-cat — room.js
 *
 * PHASE 3 OF THE 640x360 SCALE. The room, able to exist at 640x360 without
 * the 320x180 one breaking.
 *
 * WHY A MODULE AND NOT AN EDIT. The 320x180 numbers in scene.js and config.js
 * are the CONTROL GROUP. Phase 5 has to be able to throw away everything from
 * phase 3 onward and leave a working piece, which is only true if this file
 * can be deleted and nothing else has moved. So nothing here edits them: it
 * ADDS a second configuration and one function that answers "given a scale,
 * what are all the coordinates".
 *
 * THE UNIT QUESTION, WHICH IS THE WHOLE POINT OF THIS FILE.
 *
 * Doubling a number is the easy part. Knowing WHICH numbers double, and WHY,
 * is the part that silently breaks a room, so every constant in the piece is
 * classified here and the classification is data rather than a comment:
 *
 *   WORLD   a position or distance in LOGICAL PIXELS. Doubles with the room,
 *           because the room is twice as many logical pixels across and the
 *           furniture has to sit twice as far from the left wall.
 *
 *   SPRITE  a distance measured INSIDE the cat's sprite, or a reach out of it.
 *           These double with the SPRITE, not with the room. The two happen to
 *           move together at the only scale anyone has asked for, which is
 *           exactly why mixing them up has not bitten yet.
 *
 *   TIME    seconds, or a rate in seconds. DOES NOT DOUBLE. A room twice as
 *           wide walked at the same 46 px/s would take twice as long and feel
 *           broken; a px/s rate must double to keep the same feel, and a
 *           duration must not.
 *
 * THE TWO THAT ARE EASILY GOT WRONG, and the brief's warning is aimed squarely
 * at them:
 *
 *   Shiro.BODY_HALF = 10 is her collision half-width in SPRITE pixels. It is
 *   NOT a world distance. At 64x64 it must be 20. Left at 10 it is half her
 *   width and she walks through furniture while looking like she is not.
 *
 *   BOWL_GAP (27) and TREE_GAP (28) are also sprite pixels, despite sitting
 *   among world x-coordinates and being used as world offsets. The comments
 *   say why: the profile muzzle sits ~27px into a 32px sprite, and her forepaws
 *   reach ~25px into one. They are reach out of the SPRITE, so they track the
 *   sprite and not the furniture. They read as world constants and are not.
 */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});

  /* The control group, restated so this file can be checked against reality
   * rather than against its own memory. These are the 320x180 numbers as they
   * exist in scene.js and shiro.js TODAY; nothing here is authoritative over
   * them, and if they ever drift, this table is how you find out. */
  var CONTROL_320 = {
    LOGICAL_W: 320, LOGICAL_H: 180, SPRITE: 32,
    FLOOR_TOP: 116, FEET_Y: 142,
    WALK_MIN_X: 18, WALK_MAX_X: 268,
    BOWL_WATER_X: 46, BOWL_FOOD_X: 66, WINDOW_CX: 63,
    BOWL_GAP: 27, CAT_TREE_X: 213, TREE_GAP: 28,
    YARN_MIN_X: 92, YARN_MAX_X: 138,
    BODY_HALF: 10
  };

  /* Every constant in the piece, classified. This is the deliverable the brief
   * asked for — "say which is which" — expressed so a tool can read it rather
   * than so a person can trust a comment. */
  var UNITS = {
    world: [
      'LOGICAL_W', 'LOGICAL_H',
      'FLOOR_TOP', 'FEET_Y',
      'WALK_MIN_X', 'WALK_MAX_X',
      'BOWL_WATER_X', 'BOWL_FOOD_X', 'WINDOW_CX', 'CAT_TREE_X',
      'YARN_MIN_X', 'YARN_MAX_X'
    ],
    sprite: [
      'SPRITE',
      'BODY_HALF',   /* her collision half-width, in sprite px — the brief's trap */
      'BOWL_GAP',    /* reach out of the sprite to a bowl, not a world gap */
      'TREE_GAP'     /* reach out of the sprite to the post, not a world gap */
    ],
    time: [
      /* durations in seconds — these do NOT double */
      'BEHAVIOR.*Dur', 'BEHAVIOR.*Min', 'BEHAVIOR.*Max', 'BEHAVIOR.*Hold',
      /* rates in seconds — also do NOT double */
      'BEHAVIOR.blink*', 'BEHAVIOR.approachEps'
    ],
    /* rates expressed in LOGICAL PX PER SECOND or per frame. These are neither
     * world geometry nor time: they are world pixels over time, so they double
     * with the room or she crosses a room twice as wide in twice as long. */
    speed: [
      'BEHAVIOR.approachSpeed', 'BEHAVIOR.chaseSpeed', 'BEHAVIOR.stalkSpeed',
      'BEHAVIOR.walkStride', 'BEHAVIOR.walkSpeed'
    ]
  };

  var ALL_WORLD = UNITS.world.concat();
  var ALL_SPRITE = UNITS.sprite.concat();

  /* roomFor(scale): the ONE place a doubled room is asked for.
   *
   * Everything that is world or sprite doubles; nothing that is time does. At
   * scale 2 the two sets agree, so the split is not load-bearing today — it is
   * recorded so that the first time they DISAGREE (a bigger room, a smaller
   * cat, a denser one) the code already knows which is which. */
  function roomFor(scale) {
    var k = scale == null ? 1 : Number(scale);
    var out = {};
    var i;
    for (i = 0; i < ALL_WORLD.length; i++) {
      var w = ALL_WORLD[i];
      if (CONTROL_320[w] == null) continue;
      out[w] = CONTROL_320[w] * k;
    }
    for (i = 0; i < ALL_SPRITE.length; i++) {
      var s = ALL_SPRITE[i];
      if (CONTROL_320[s] == null) continue;
      out[s] = CONTROL_320[s] * k;
    }
    out.scale = k;
    /* her collision half-width, named here so phase 4 cannot set it from the
     * wrong table. At 64x64 this is 20, not 10. */
    out.bodyHalf = CONTROL_320.BODY_HALF * k;
    return out;
  }

  /* The doubled control, spelled out, because the brief's headline claim is
   * "BODY_HALF must become 20 at 64x64" and that deserves to be readable
   * without calling a function. */
  var ROOM_320 = roomFor(1);
  var ROOM_640 = roomFor(2);

  NESCAT.room = {
    CONTROL_320: CONTROL_320,
    UNITS: UNITS,
    ROOM_320: ROOM_320,
    ROOM_640: ROOM_640,
    roomFor: roomFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
