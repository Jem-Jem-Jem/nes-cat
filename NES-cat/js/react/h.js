/* ============================================================
 * NES-cat — js/react/h.js
 *
 * The createElement alias, and nothing else.
 *
 * WHY NO JSX. This project has never had a build step: p5, p5.sound and
 * NES.css all load from a CDN and `npm start` is a static file server.
 * Adding JSX means adding a bundler, which means `npm start` stops being
 * "serve the directory" and the no-build property the whole repo depends on
 * is gone — for a syntax sugar that saves a few brackets.
 *
 * So React is adopted WITHOUT a build step: the UMD builds load from a CDN
 * exactly like p5 already does, and elements are built with createElement
 * through the alias below. Nothing about the toolchain changed, and if this
 * migration is ever abandoned the CDN scripts are the only thing to remove.
 *
 * The piece stays authoritative for drawing. React never gets a chance to
 * repaint the pixel grid — see App.js and the note on <Canvas>.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});

  NESCAT.h = function (type, props) {
    /* children as trailing varargs, which is the shape createElement wants
     * anyway — `h('p', null, 'text')` rather than an object of children. */
    var kids = Array.prototype.slice.call(arguments, 2);
    if (props) {
      var copy = {};
      for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) copy[k] = props[k];
      props = copy;
    } else {
      props = null;
    }
    return root.React.createElement.apply(root.React, [type, props].concat(kids));
  };

  /* Fragments let a component return siblings without a wrapper div, which
   * matters here: the HUD is absolutely positioned against the window, so an
   * extra element in the tree would be an extra element in the layout. */
  NESCAT.Fragment = root.React.Fragment;
})(typeof window !== 'undefined' ? window : globalThis);
