/* ============================================================
 * NES-cat — scale.js
 *
 * PHASE 4 OF THE 640x360 SCALE. THE SWITCH.
 *
 * WHAT THE SWITCH IS: a URL parameter AND a button, and they are the same
 * switch. `?scale=2` runs the piece at 640x360 with the 64x64 art; with no
 * parameter it runs at 320x180 with the 32x32 art. The button in index.html
 * flips it in-page, repeatedly, in both directions, without a reload — and
 * rewrites the parameter to match, so the address bar, the button and the
 * pixels can never say three different things.
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
  function normalise(raw) {
    if (raw == null) return 1;
    var n = Number(raw);
    if (!isFinite(n) || n <= 0) return 1;
    return Math.abs(n - 2) < 1e-9 ? 2 : 1;
  }

  /* the load path asks the URL; setScale() below asks a number. Both go
   * through the same normaliser, so the toggle cannot produce a third
   * answer that the parameter would not. */
  function resolveScale() {
    return normalise(readParam());
  }

  /* THE PROP FIELDS THAT ARE WORLD GEOMETRY, IN ONE PLACE.
   *
   * collideW/collideX are here, and ax, ay and shadowW are NOT. The plant's
   * pot is 22px of solid rim, and doubling only its position left the box 22
   * wide while the pot drew 80 - so the gap between where she stops and where
   * the pot visibly ends went 9px at 320x180 to 29px at 640x360. But ax, ay
   * and shadowW are read by Scene.draw INSIDE the scale transform, so the
   * transform already multiplies them and doubling here would draw the props
   * at 4x.
   *
   * The rule either way: a number the transform sees must not be pre-scaled,
   * and a number the transform never sees must be. Collision is arithmetic and
   * no transform touches it; drawing is the other way round.
   *
   * apply() multiplies these and restore() has to put them back. They used to
   * be listed twice — once in apply(), and not at all in restore() — which is
   * how a `?scale=2` load followed by restore() came to leave every prop at
   * four times its position: the plant at x 1084 of a 320-wide room, its pot
   * 88 wide, drawn off the right edge of the screen entirely.
   *
   * One list, read by all three of snapshot(), apply() and restore(), so a
   * field cannot be added to one and forgotten in another. That they COULD be
   * is the bug; a list that only one of them reads would not be a fix. */
  var PROP_GEOMETRY = ['x', 'y', 'collideW', 'collideX'];

  var SCALE = resolveScale();
  var ROOM = (NESCAT.room && NESCAT.room.roomFor) ? NESCAT.room.roomFor(SCALE) : null;

  /* Capture the control group before touching anything, so restore() can put
   * it back inside one process. A switch that can only be undone by reloading
   * is not really reversible, it is restartable.
   *
   * THE CONTROL GROUP IS THE ROOM TABLE, NOT EVERY NUMBER ON Scene.
   *
   * This used to capture every numeric property of NESCAT.Scene, which quietly
   * filed the yarn's live position, how full the bowls are, the clock, and the
   * phase counters behind the sway of the plant and the roll of the yarn under
   * "the control group". Harmless while restore() was never called — the code
   * was there for a future switch, and a future switch was hypothetical.
   *
   * It is not hypothetical any more. restore() now runs on the path of every
   * press of the button, so its breadth became a live bug: measured, one
   * press, the bowls went back to full and the yarn jumped from wherever she
   * had batted it to x 104. The piece had been switched, not restarted.
   *
   * So the capture is exactly the keys of roomFor(1) — the same table apply()
   * writes from, so capture and apply cannot fall out of step — and nothing
   * else. Geometry is restorable; everything else is the room's ongoing state
   * and is left alone. */
  function snapshot() {
    var S = NESCAT.Scene || {}, scene = {};
    var table = NESCAT.room && NESCAT.room.roomFor ? NESCAT.room.roomFor(1) : null;
    if (table) {
      for (var k in table) {
        if (Object.prototype.hasOwnProperty.call(table, k) &&
            typeof S[k] === 'number') scene[k] = S[k];
      }
    } else {
      for (var f in S) if (typeof S[f] === 'number') scene[f] = S[f];
    }
    var objs = {};
    var O = S.OBJECTS;
    if (O) {
      for (var on in O) {
        if (!Object.prototype.hasOwnProperty.call(O, on)) continue;
        var src = O[on], o = {};
        for (var gi = 0; gi < PROP_GEOMETRY.length; gi++) {
          var gf = PROP_GEOMETRY[gi];
          if (typeof src[gf] === 'number') o[gf] = src[gf];
        }
        objs[on] = o;
      }
    }
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
      scene: scene,
      objects: objs
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
        /* FLOOR_TOP IS THE FLOOR COLOUR BUG. It is the one constant in this
         * table that is read ONLY by scene.js drawing - lines 660, 667, 693,
         * 697, 701, 1078, 1082 and 1110, every one of them inside the draw,
         * and therefore inside the scale transform. The transform already
         * multiplies it, so doubling it here drew the wall/floor boundary at
         * 232 in 320-space = 464 on a canvas 360 tall. The boundary went off
         * the bottom of the screen, the floorboards loop (scene.js:1082,
         * `for (var y = this.FLOOR_TOP; y < H; y += 9)`) started below the
         * canvas and never ran, and a wall band was left covering where the
         * floor should be - which is what a human reported as the floor being
         * the wrong colour.
         *
         * Every other constant here is read by BEHAVIOUR - FEET_Y by shiro.js,
         * the walk range and the bowl and yarn and tree positions by her
         * approach logic - so they must double. This one must not, and the
         * rule is the same as the OBJECTS table two blocks down: a number the
         * transform sees must not be pre-scaled, and a number the transform
         * never sees must be. */
        if (k === 'FLOOR_TOP') continue;
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
        for (var gi = 0; gi < PROP_GEOMETRY.length; gi++) {
          var gf = PROP_GEOMETRY[gi];
          if (typeof ob[gf] === 'number') ob[gf] *= SCALE;
        }
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

    /* THE PROPS. This block did not exist, and restore() is the one function
     * in this file whose whole job is to put the control group back, so its
     * silence here was not a simplification — it was the switch lying.
     *
     * Measured, on a `?scale=2` load, one restore() call: LOGICAL_W 640->320,
     * FEET_Y 284->142, BODY_HALF 20->10, approachSpeed 92->46 — all four
     * correct — and the props unmoved. plant.x 542 -> 1084 of a 320-wide
     * room, plant.collideW 44 -> 88, yarn 208 -> 416. The furniture drawn at
     * four times its position, on a canvas it had already left. */
    var O = Sc.OBJECTS;
    if (O) {
      for (var on in CONTROL.objects) {
        if (!Object.prototype.hasOwnProperty.call(O, on)) continue;
        var src = CONTROL.objects[on], ob = O[on];
        for (var gi = 0; gi < PROP_GEOMETRY.length; gi++) {
          var gf = PROP_GEOMETRY[gi];
          if (typeof src[gf] === 'number') ob[gf] = src[gf];
        }
      }
    }
    return true;
  }

  /* ---------- the runtime switch ------------------------------------------ */

  /* Move the room-coordinate state that snapshot() cannot see.
   *
   * THE RULE IS NOT "map everything that differs between the two scales". It is
   * "end up in exactly the state a cold load at the new scale would have".
   * Those are different rules, and the second one is the correct one — a cold
   * load carries its own quirks and reproducing them is the point.
   *
   * Concretely, the dust motes and the stars are NOT here. scene.js resolves
   * `var W = CFG.LOGICAL_W` at line 26, once, at load — before this file runs —
   * so the motes are seeded and wrapped inside a 320x180 box and drawn through
   * the scale transform like everything else. They are 320-space at BOTH
   * scales, and doubling them would make a switched room differ from a loaded
   * one. Same for the stars, whose window rect is a literal.
   *
   * What IS here is the handful of numbers this file's own tables cannot reach:
   * where she is standing, and where the one object in the room that moves is
   * sitting. Both are written every frame by behaviour the switch must not
   * interrupt, which is exactly why they have to be carried across by a factor
   * rather than re-derived. */
  function remapPositions(from, to) {
    var k = to / from;
    if (k === 1) return;
    var Sh = NESCAT.Shiro, S = NESCAT.Scene;
    function scaleField(obj, field) {
      if (obj && typeof obj[field] === 'number') obj[field] *= k;
    }
    if (Sh) {
      scaleField(Sh, 'x');
      scaleField(Sh, '_targetX');
      /* where the current walk measured its stride from (shiro.js:153). Left
       * behind it is not a glitch on screen — the stride is already finished
       * by then — but the next walk to read it would start from a position in
       * the other room and cover the floor in one step. */
      scaleField(Sh, '_walkStartX');
    }
    if (S) {
      scaleField(S, '_yarnX');
      /* the endpoints of a roll already in flight. Left behind, the yarn
       * would animate from a 2x coordinate to a 1x one, crossing the whole
       * room in a third of a second. */
      scaleField(S, '_yarnFrom');
      scaleField(S, '_yarnTo');
    }
  }

  /* Rebuild her sprite against the frame table that is installed NOW.
   *
   * Sprite.makeSprite does not keep a reference to the table it is handed: it
   * copies every frame's rows into a fresh object and validates each one
   * (sprite.js:33-45). Shiro.init() ran once, at setup, so her sprite holds
   * whatever art was installed then, forever. Assigning NESCAT.frames changes
   * what she *would* draw next time she was rebuilt and nothing at all about
   * what she draws now — measured, after a 2x->1x switch: NESCAT.frames back
   * to the 32 set, and Shiro.sprite.frames.idle_open still 64x64, which is a
   * 64-pixel cat standing in a 320-pixel room.
   *
   * Rebuilt here rather than by calling Shiro.init() again, which would also
   * reset her position, her state machine and the three "seconds since she
   * last did it" counters. Switching the size of the room is not starting a
   * new game, and the brief is explicit that this slice changes how you
   * switch and never how anything behaves. */
  function rebuildSprite() {
    if (!NESCAT.Shiro || !NESCAT.Sprite) return;
    NESCAT.Shiro.sprite = NESCAT.Sprite.makeSprite({ name: 'shiro', frames: NESCAT.frames });
  }

  /* Keep the parameter and the toggle from ever disagreeing.
   *
   * replaceState, not assign: this rewrites the address bar so a reload and a
   * shared link both land on the size now on screen, without reloading the
   * page and without adding a history entry the Back button has to walk back
   * through one room-size at a time. `?scale=2` survives untouched — it is
   * what the bookmark is, and this only ever writes the value that is already
   * true. */
  function syncUrl(n) {
    var hist = root.history;
    if (!hist || !hist.replaceState || !root.location) return;
    var loc = root.location;
    var q = (loc.search || '').replace(/^\?/, '').split('&').filter(function (pair) {
      return pair && !/^scale=/.test(pair);
    });
    if (n === 2) q.push('scale=2');
    root.history.replaceState(null, '',
      loc.pathname + (q.length ? '?' + q.join('&') : '') + (loc.hash || ''));
  }

  var toggle = null;

  function paintToggle() {
    if (!toggle) return;
    toggle.textContent = (NESCAT.SCALE === 2) ? '640x360' : '320x180';
    toggle.setAttribute('aria-pressed', NESCAT.SCALE === 2 ? 'true' : 'false');
  }

  /* THE TOGGLE. Bound to the one button in index.html, which is a SIBLING of
   * #root and not a descendant of it.
   *
   * ReactDOM.createRoot() owns one element and its subtree. #root is that
   * element, so a sibling of #root is invisible to React for the whole life of
   * the migration: React will not render it, reconcile it, or remove it, and
   * it in turn reads nothing from the shell. Neither side depends on the
   * other, which is the property the brief asked for and the reason this is
   * here rather than in the tree. Inside the shell it could only have been a
   * leaf that owns nothing — and it would have needed the store to carry its
   * own label, which is the text ownership App.js explicitly reserves. If the
   * migration later wants this in the tree, it becomes exactly that leaf, and
   * nothing in this file changes to allow it. */
  function mountToggle() {
    if (!root.document) return;
    toggle = root.document.getElementById('scale-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      setScale(NESCAT.SCALE === 2 ? 1 : 2);
    });
    paintToggle();
  }

  /* THE GUARD. setScale() is the only supported way to change size, and it
   * does not take apply()'s word for anything.
   *
   * apply() MULTIPLIES. It is not idempotent and cannot be made idempotent
   * without ceasing to be the one function that turns a 320-room into a
   * 640-room. So the guard is not a flag and not a check — it is that
   * restore() runs FIRST, unconditionally, on every call, including the ones
   * that ask for the size already on screen. Every number apply() is about to
   * touch is at the control group before it runs, which is the only property
   * that makes calling it twice the same as calling it once.
   *
   * Measured, before this existed: apply() twice on a `?scale=2` load took the
   * plant from x 542 to 1084 and approachSpeed from 92 to 184, and the
   * restore() that followed left all of it there while reporting success. */
  function setScale(n) {
    var target = normalise(n);
    var from = NESCAT.SCALE || 1;

    restore();                                   /* <- the guard. Not an if. */
    SCALE = target;
    ROOM = (NESCAT.room && NESCAT.room.roomFor) ? NESCAT.room.roomFor(SCALE) : null;
    apply();

    remapPositions(from, target);
    rebuildSprite();

    /* The offscreen buffer is the thing that is actually 320x180 or 640x360,
     * and sketch.js made it once at setup(). If it is not rebuilt here the
     * toggle changes every number in the piece and draws none of it — which is
     * the failure the brief calls "a lie". Guarded because the control is live
     * from the moment the document parses and p5 boots on DOMContentLoaded, so
     * a click can land in the gap; setup() then reads the already-swapped
     * LOGICAL_W and creates the right buffer without this. */
    if (NESCAT.viewport && NESCAT.viewport.resize) NESCAT.viewport.resize();

    syncUrl(target);
    paintToggle();
    return target;
  }

  apply();

  NESCAT.scale = {
    SCALE: SCALE, ROOM: ROOM, CONTROL: CONTROL,
    apply: apply, restore: restore, snapshot: snapshot, readParam: readParam,
    setScale: setScale
  };

  mountToggle();
})(typeof window !== 'undefined' ? window : globalThis);
