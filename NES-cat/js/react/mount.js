/* ============================================================
 * NES-cat — js/react/mount.js
 *
 * Mounts the React tree, synchronously, before p5 boots.
 *
 * WHY THIS FILE IS SMALL AND WHY IT IS NOT OPTIONAL.
 *
 * p5 runs in global mode: it looks for window.setup, and when the document is
 * ready it calls it. sketch.js's setup() does `createCanvas(...).parent('stage')`.
 * If #stage is not in the document at that moment, p5 has nothing to parent
 * to and the canvas never appears.
 *
 * React 18's createRoot().render() is CONCURRENT — it schedules work and
 * returns before the DOM exists. That is fine for a normal app and fatal here:
 * by the time React would have committed, p5 would already have booted.
 *
 * So this renders inside flushSync, which forces the commit to happen before
 * returning. React 18's root API is designed to be called after the document
 * is interactive, and using it here is a deliberate exception: the contract
 * between this file and p5 is that #stage exists the instant this script
 * returns, and nothing else honours that.
 *
 * This is the ONLY place React touches the document at startup. After it
 * returns, the canvas belongs to p5 and the HUD belongs to ui.js.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});

  var mountEl = root.document.getElementById('root');
  if (!mountEl) {
    /* Loud rather than silent. A missing #root means the shell is broken and
     * the piece would otherwise come up with no HUD and no explanation — the
     * same failure mode as the CASES silent-skip, which is exactly what this
     * loop keeps paying for. */
    throw new Error('NES-cat: #root not found — the React shell cannot mount.');
  }

  var root$ = root.ReactDOM.createRoot(mountEl);
  root.ReactDOM.flushSync(function () {
    root$.render(root.React.createElement(NESCAT.react.Game));
  });

  /* Exposed so a later phase can drive the tree without reaching for the
   * internals. Nothing calls this yet and nothing should until text ownership
   * actually moves into React. */
  NESCAT.mountRoot = root$;
})(typeof window !== 'undefined' ? window : globalThis);
