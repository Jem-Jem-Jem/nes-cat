/* ============================================================
 * NES-cat — sketch.js
 *
 * Orchestration only. Everything renders into a 320x180 offscreen p5.Graphics
 * buffer and is then blitted to the window at an INTEGER scale with smoothing
 * off, so the pixels stay crisp at any size. The space around the stage is
 * filled with the NES.css theme colour (never black bars).
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});
  var CFG = NESCAT.config;

  var sceneGfx = null;

  /* THE OFFSCREEN BUFFER, AND WHY IT HAS TO BE A FUNCTION.
   *
   * This is the thing that is actually 320x180 or 640x360. The visible canvas
   * is the window and is always window-sized; the room is composited into this
   * buffer and blitted out of it. It was created once inside setup() from
   * CFG.LOGICAL_W, which made it the one piece of the room that could not
   * follow a size change — switch from 2x to 1x and every number in the piece
   * would come back to 320-space while a 640x360 buffer stayed there to be
   * drawn into, so the toggle would change what was true and not what was
   * drawn.
   *
   * remove() before replacing: each createGraphics makes a real canvas element,
   * and a toggle pressed a few dozen times would otherwise leave one attached
   * to nothing per press. */
  function makeSceneGfx() {
    if (sceneGfx) sceneGfx.remove();
    sceneGfx = createGraphics(CFG.LOGICAL_W, CFG.LOGICAL_H);
    sceneGfx.pixelDensity(1);
    sceneGfx.noSmooth();
    NESCAT.viewport.w = sceneGfx.width;
    NESCAT.viewport.h = sceneGfx.height;
  }

  /* Published so the buffer can be measured from outside rather than asserted.
   * w/h are what createGraphics actually produced; resize() is the hook
   * scale.js calls once it has finished swapping the geometry. */
  NESCAT.viewport = {
    w: 0,
    h: 0,
    resize: function () {
      makeSceneGfx();
      recomputeLayout();
    }
  };

  var layout = {
    scale: 1,
    ox: 0,
    oy: 0,
    toLogical: function (clientX, clientY) {
      var el = document.querySelector('canvas');
      if (!el) return { x: 0, y: 0 };
      var r = el.getBoundingClientRect();
      var cx = (clientX - r.left) * (el.width / (r.width || 1));
      var cy = (clientY - r.top) * (el.height / (r.height || 1));
      return {
        x: (cx - layout.ox) / layout.scale,
        y: (cy - layout.oy) / layout.scale
      };
    }
  };
  NESCAT.layout = layout;

  /* Publish the playfield rect to CSS.
   *
   * The room is a fixed 320x180 logical buffer blitted to a CENTRED
   * INTEGER-SCALED rect, but the HUD is positioned in CSS against the
   * WINDOW. Those are two coordinate systems, and any HUD element sized
   * in plain CSS pixels therefore covers a DIFFERENT fraction of the room
   * at every window size — which is exactly how the dialogue box came to
   * hide the yarn at 1280x720 but not at 800x600.
   *
   * So the stage geometry is handed to CSS as custom properties and the
   * HUD is sized in `--stage-u`, ONE LOGICAL PIXEL expressed in CSS
   * pixels. Anything expressed in that unit scales with the room for
   * free: when LOGICAL_W/H double, `scale` doubles, and so does every
   * HUD measurement derived from it. No breakpoint has to be revisited.
   *
   * `--stage-u` is set to `1px * scale` so the arithmetic in CSS reads
   * as "N logical pixels" rather than as a magic number. */
  function publishLayout() {
    var rootEl = root.document && root.document.documentElement;
    if (!rootEl || !rootEl.style) return;
    var s = layout.scale;
    var set = function (k, v) { rootEl.style.setProperty(k, v); };
    set('--stage-u', s + 'px');                     /* 1 logical px, in CSS px */
    set('--stage-scale', String(s));
    set('--stage-x', layout.ox + 'px');
    set('--stage-y', layout.oy + 'px');
    set('--stage-w', (CFG.LOGICAL_W * s) + 'px');
    set('--stage-h', (CFG.LOGICAL_H * s) + 'px');
  }

  function recomputeLayout() {
    var s = Math.floor(Math.min(root.innerWidth / CFG.LOGICAL_W, root.innerHeight / CFG.LOGICAL_H));
    layout.scale = Math.max(CFG.MIN_SCALE, s || CFG.MIN_SCALE);
    layout.ox = Math.floor((root.innerWidth - CFG.LOGICAL_W * layout.scale) / 2);
    layout.oy = Math.floor((root.innerHeight - CFG.LOGICAL_H * layout.scale) / 2);
    publishLayout();
  }

  root.setup = function () {
    var c = createCanvas(root.innerWidth, root.innerHeight);
    c.parent('stage');
    pixelDensity(1);
    noSmooth();

    makeSceneGfx();
    recomputeLayout();

    /* order matters: room geometry, then the cat, then its inputs + shell */
    NESCAT.Scene.init();
    NESCAT.Shiro.init();
    NESCAT.Audio.init();
    NESCAT.Input.init();
    NESCAT.UI.init();

    background(CFG.THEME_BG);
  };

  root.draw = function () {
    var dt = Math.min(deltaTime / 1000, 0.05);

    NESCAT.Scene.update(dt);
    NESCAT.Shiro.update(dt);
    NESCAT.Audio.update(dt);
    NESCAT.UI.update(dt);
    NESCAT.Input.updateGaze();

    sceneGfx.noSmooth();

    /* THE ROOM IS SCALED BY A TRANSFORM, not by editing its geometry.
     *
     * scene.js draws in logical coordinates with literals baked in - the window
     * band is `x >= 14 && x <= 118`, the floorboards step `my += 14`, the
     * skirting is `g.rect(0, 5, W, 1)`. Those are the art, and rewriting art
     * is forbidden here. p5's push/scale/pop multiplies every coordinate a
     * draw call receives, so the same literals render correctly at 2x with no
     * edit inside scene.js at all.
     *
     * The cat is drawn AFTER the pop, so she is NOT scaled a second time: her
     * frames are already 64x64 art in a 640x360 room. Scaling her too would
     * make her 128 tall in a 360 room - 35% of screen height, which is exactly
     * the failure the whole doubling exists to avoid. */
    var sc = NESCAT.SCALE || 1;
    if (sc !== 1) { sceneGfx.push(); sceneGfx.scale(sc); }
    NESCAT.Scene.draw(sceneGfx);
    if (sc !== 1) { sceneGfx.pop(); }
    NESCAT.Shiro.draw(sceneGfx);

    background(CFG.THEME_BG);
    noSmooth();
    image(sceneGfx, layout.ox, layout.oy,
          CFG.LOGICAL_W * layout.scale, CFG.LOGICAL_H * layout.scale);
  };

  root.windowResized = function () {
    resizeCanvas(root.innerWidth, root.innerHeight);
    recomputeLayout();
  };
})(typeof window !== 'undefined' ? window : globalThis);
