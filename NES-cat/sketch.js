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

  function recomputeLayout() {
    var s = Math.floor(Math.min(root.innerWidth / CFG.LOGICAL_W, root.innerHeight / CFG.LOGICAL_H));
    layout.scale = Math.max(CFG.MIN_SCALE, s || CFG.MIN_SCALE);
    layout.ox = Math.floor((root.innerWidth - CFG.LOGICAL_W * layout.scale) / 2);
    layout.oy = Math.floor((root.innerHeight - CFG.LOGICAL_H * layout.scale) / 2);
  }

  root.setup = function () {
    var c = createCanvas(root.innerWidth, root.innerHeight);
    c.parent('stage');
    pixelDensity(1);
    noSmooth();

    sceneGfx = createGraphics(CFG.LOGICAL_W, CFG.LOGICAL_H);
    sceneGfx.pixelDensity(1);
    sceneGfx.noSmooth();

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
    NESCAT.Scene.draw(sceneGfx);
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
