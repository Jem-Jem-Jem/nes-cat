/* ============================================================
 * NES-cat — tools/rig2-objects.js
 *
 * PHASE 2 OF THE 640x360 SCALE. The scene's 24 object frames, at twice the
 * grid resolution.
 *
 * WHY THIS FILE IS NOT A RIG, AND WHY THAT IS THE POINT.
 *
 * The cat has anatomy: a skeleton, joints, a tail, a head that rotates. Those
 * are what rig2 exists for, and phase 1 projected one skeleton onto both views.
 *
 * Objects have none of that. A yarn ball is a ball. A bowl is a bowl. There is
 * nothing to articulate, nothing to project, and — the brief's own constraint —
 * they must NOT be made to share rig2's constants. What they share with the
 * cat is the GRID and nothing else: the size of one pixel.
 *
 * So the honest 64x64 emission for an object is mechanical. Every input pixel
 * becomes a 2x2 block. That is the whole transform, and it is deliberately
 * unadventurous: the alternative is re-authoring 24 frames by hand at a finer
 * resolution, which is drawing, not scaling, and drawing is the NEXT phase's
 * job with a human looking at it.
 *
 * BE HONEST ABOUT WHAT THIS BUYS. It buys GRID RESOLUTION, not DETAIL. A ball
 * that was 20px across with 1px features is now 40px across with 2px features.
 * Every shape is exactly the shape it was. Nothing is sharper; the pixels are
 * smaller. That is what "the same art on a finer grid" means, and it is a
 * real result, but it is NOT the same as having drawn the object at 64. The
 * commit that should claim the latter is the one where someone looks at it.
 *
 * ODD DIMENSIONS ARE HANDLED, NOT IGNORED. Nine of the 24 are odd — the bowls
 * are 9x14, the toy 32x11 — so a plain x2 is not always possible. Each output
 * pixel still maps to exactly one input pixel; for the last row or column of an
 * odd-sized frame that input pixel simply claims a 2px block that extends one
 * pixel past the doubled bound. Deterministic, and no pixel is invented.
 */
'use strict';

const fs = require('fs'), path = require('path'), vm = require('vm');

/* the shipped object frames, read the way the app reads them, so the NAMES
 * here are the names there and cannot drift */
function loadShipped() {
  const sb = { console };
  sb.globalThis = sb; sb.window = sb; vm.createContext(sb);
  const R = path.join(__dirname, '..', 'NES-cat', 'js');
  vm.runInContext(fs.readFileSync(path.join(R, 'config.js'), 'utf8'), sb, { filename: 'config.js' });
  vm.runInContext(fs.readFileSync(path.join(R, 'frames.js'), 'utf8'), sb, { filename: 'frames.js' });
  return sb.NESCAT.sceneSprites;
}

/* one pixel -> a KxK block of itself. That is the entire transform. */
function upscale(rows, k) {
  const K = k || 2;
  const out = [];
  for (const row of rows) {
    const wide = [];
    for (const ch of row) for (let i = 0; i < K; i++) wide.push(ch);
    for (let r = 0; r < K; r++) out.push(wide.join(''));
  }
  return out;
}

function emitObjects(k) {
  const K = k || 2;
  const S = loadShipped();
  const out = {};
  const perSprite = {};
  let count = 0;
  for (const set of Object.keys(S)) {
    const frames = {};
    for (const name of Object.keys(S[set].frames)) {
      const src = S[set].frames[name];
      const up = upscale(src, K);
      frames[name] = up;
      /* an "emitted" frame that drew nothing is not emitted */
      if (up.join('').replace(/[.\s]/g, '') === '') {
        throw new Error('rig2-objects: ' + set + '/' + name + ' upscaled to nothing');
      }
      if (up.some(r => r.length !== up[0].length)) {
        throw new Error('rig2-objects: ' + set + '/' + name + ' upscaled to a ragged block');
      }
      count++;
    }
    perSprite[set] = {
      name: S[set].name,
      charColors: S[set].charColors,
      frames
    };
    out[set] = frames;
  }
  return { sprites: perSprite, count, scale: K, spriteCount: Object.keys(perSprite).length };
}

module.exports = { emitObjects, upscale, loadShipped };
