/* ============================================================
 * NES-cat — scale.js
 *
 * PHASE 4 OF THE 640x360 SCALE. THE SWITCH.
 *
 * WHAT THE SWITCH IS: a URL parameter. `?scale=2` runs the piece at
 * 640x360 with the 64x64 art; with no parameter it runs at 320x180 with the
 * 32x32 art. Undo it by deleting five characters from the URL.
 *
 * WHY A URL PARAMETER AND NOT A CONFIG FLAG. A flag in config.js is a value
 * somebody has to remember to flip, and the default is the one that matters
 * when you are not looking. A URL parameter sits next to the thing it changes,
 * survives a reload, needs no rebuild, and lets two tabs run at two sizes at
 * once - which is exactly what phase 5 needs to compare them. It is also the
 * only one of the three that can be undone without editing a file, which is
 * the property actually asked for: one switch to undo.
 *
 * IT DELETES NOTHING. The 32x32 set, the 320x180 room and every control-group
 * constant stay exactly where they are. With no parameter this file applies
 * nothing at all, which is asserted by the round-trip check rather than by
 * this comment.
 *
 * THE CONSTRAINT THAT MADE THIS INTERESTING.
 *
 * scene.js draws the room in LOGICAL COORDINATES with literals baked in - the
 * window band is `x >= 14 && x <= 118`, the floorboards step `my += 14`, the
 * skirting is `g.rect(0, 5, W, 1)`. Phase 3 centralised the BEHAVIOURAL
 * geometry (where the furniture is, how far she walks, how wide she is) and
 * could not centralise the drawing without rewriting the art, which is
 * forbidden here.
 *
 * So the room is scaled by a TRANSFORM rather than by editing it: p5's
 * push/scale/pop multiplies every coordinate a draw call receives, so those
 * literals keep working unchanged at 2x. That seam is the thing phase 5 has to
 * look at with human eyes.
 */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});

  function readParam() {
    var loc = root.location;
    if (!loc || !loc.search) return null;
    var m = /[?&]scale=([^&]*)/.exec(loc.search);
    return m ? m[1] : null;
  }

  /* `2` runs the big room. Anything else is 1, and 1 means "change nothing" -
   * the safe default is always the control group. */
  function resolveScale() {
    var raw = readParam();
    if (raw == null) return 1;
    var n = Number(raw);
    if (!isFinite(n) || n <= 0) return 1;
    return Math.abs(n - 2) < 1e-9 ? 2 : 1;
  }

  var SCALE = resolveScale();
  var ROOM = (NESCAT.room && NESCAT.room.roomFor) ? NESCAT.room.roomFor(SCALE) : null;

  /* Capture the control group before touching anything, so restore() can put
   * it back inside one process. A switch that can only be undone by reloading
   * is not really reversible, it is restartable. */
  function snapshot() {
    var S = NESCAT.Scene || {}, scene = {};
    for (var k in S) if (typeof S[k] === 'number') scene[k] = S[k];
    return {
      frames: NESCAT.frames, sceneSprites: NESCAT.sceneSprites,
      w: NESCAT.config.LOGICAL_W, h: NESCAT.config.LOGICAL_H,
      sprite: NESCAT.config.SPRITE,
      bodyHalf: NESCAT.Shiro ? NESCAT.Shiro.BODY_HALF : null,
      speeds: {
        approachSpeed: NESCAT.config.BEHAVIOR.approachSpeed,
        chaseSpeed: NESCAT.config.BEHAVIOR.chaseSpeed,
        stalkSpeed: NESCAT.config.BEHAVIOR.stalkSpeed,
        walkStride: NESCAT.config.BEHAVIOR.walkStride
      },
      scene: scene
    };
  }

  var CONTROL = snapshot();

  function apply() {
    NESCAT.SCALE = SCALE;
    if (SCALE === 1 || !ROOM) return false;

    /* 1. the cat's art: the 64x64 set.
     *
     *    NOT the object set, deliberately. The room is drawn through a scale
     *    transform (see sketch.js) and the objects are drawn by Scene.draw
     *    inside that same transform, so swapping in objects64 here would scale
     *    already-doubled art to 4x. The pixels that come out are identical
     *    either way - a 2x block upscale IS objects64 - so consuming it here
     *    would buy nothing and cost the right answer. Using objects64 for real
     *    needs Scene.draw split into room-draw and object-draw, which is a
     *    change to the art and is not this phase. */
    if (NESCAT.frames64) NESCAT.frames = NESCAT.frames64;

    /* 2. the render target and her sprite grid. sketch.js reads these at
     *    setup() time, which is after this runs. */
    var CFG = NESCAT.config;
    CFG.LOGICAL_W = ROOM.LOGICAL_W;
    CFG.LOGICAL_H = ROOM.LOGICAL_H;
    CFG.SPRITE = ROOM.SPRITE;

    /* 3. the behavioural geometry, doubled once, from room.js. */
    var S = NESCAT.Scene;
    if (S) {
      for (var k in ROOM) {
        if (!Object.prototype.hasOwnProperty.call(ROOM, k)) continue;
        if (k === 'scale' || k === 'bodyHalf') continue;
        if (typeof ROOM[k] === 'number' && typeof S[k] === 'number') S[k] = ROOM[k];
      }
    }

    /* 4. HER COLLISION HALF-WIDTH: the constant the brief names, and the one
     *    that fails silently. At 10 she is half her width and walks through
     *    furniture while looking like she is not. */
    if (NESCAT.Shiro) NESCAT.Shiro.BODY_HALF = ROOM.bodyHalf;

    /* 5. THE PROPS' COLLISION BOXES. Scene.draw reads OBJECTS for position and
     *    the scale transform already doubles the DRAWING. Collision is
     *    arithmetic, not drawing, and no transform touches it — so without
     *    this the furniture is drawn at 2x and collided with at 1x: visible
     *    walls in the wrong place, and a cat who walks through where the plant
     *    looks like it is. Caught by asking "does she stop in the same place at
     *    both scales", which flagged an identical x; "does she clip" passed
     *    happily and proved nothing. */
    var O = NESCAT.Scene.OBJECTS;
    if (O) {
      for (var oname in O) {
        if (!Object.prototype.hasOwnProperty.call(O, oname)) continue;
        var ob = O[oname];
        if (typeof ob.x === 'number') ob.x *= SCALE;
        if (typeof ob.y === 'number') ob.y *= SCALE;
        /* collideW/collideX TOO. The plant's pot is 22px of solid rim, and
         * doubling only its position left the box 22 wide while the pot drew
         * 80 - so the gap between where she stops and where the pot visibly
         * ends went 9px at 320x180 to 29px at 640x360.
         *
         * ONLY these two. ax, ay and shadowW are read by Scene.draw INSIDE the
         * scale transform (lines 1219-20 and 1247), so the transform already
         * multiplies them and doubling here would draw the props at 4x.
         * The rule either way: a number the transform sees must not be
         * pre-scaled, and a number the transform never sees must be. */
        if (typeof ob.collideW === 'number') ob.collideW *= SCALE;
        if (typeof ob.collideX === 'number') ob.collideX *= SCALE;
      }
    }

    /* 6. speeds are world px per second, so they double or she crosses a
     *    twice-wide room in twice as long and feels broken without looking
     *    broken. Durations in seconds do NOT touch. */
    var B = CFG.BEHAVIOR;
    var perPx = ['approachSpeed', 'chaseSpeed', 'stalkSpeed', 'walkStride'];
    for (var i = 0; i < perPx.length; i++) {
      if (typeof B[perPx[i]] === 'number') B[perPx[i]] *= SCALE;
    }
    return true;
  }

  /* Put the control group back, in-process, so the flip both ways is
   * observable without a reload and cannot be faked by a cached file. */
  function restore() {
    NESCAT.SCALE = 1;
    NESCAT.frames = CONTROL.frames;
    NESCAT.sceneSprites = CONTROL.sceneSprites;
    var CFG = NESCAT.config;
    CFG.LOGICAL_W = CONTROL.w; CFG.LOGICAL_H = CONTROL.h; CFG.SPRITE = CONTROL.sprite;
    for (var s in CONTROL.speeds) {
      if (typeof CFG.BEHAVIOR[s] === 'number') CFG.BEHAVIOR[s] = CONTROL.speeds[s];
    }
    var Sc = NESCAT.Scene;
    for (var k in CONTROL.scene) {
      if (typeof Sc[k] === 'number') Sc[k] = CONTROL.scene[k];
    }
    if (NESCAT.Shiro) NESCAT.Shiro.BODY_HALF = CONTROL.bodyHalf;
    return true;
  }

  apply();

  NESCAT.scale = {
    SCALE: SCALE, ROOM: ROOM, CONTROL: CONTROL,
    apply: apply, restore: restore, snapshot: snapshot, readParam: readParam
  };
})(typeof window !== 'undefined' ? window : globalThis);
