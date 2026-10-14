/* ============================================================
 * NES-cat — js/react/store.js
 *
 * The seam between the imperative layer and React.
 *
 * THE PROBLEM THIS SOLVES. ui.js is driven from the p5 draw loop at 60fps and
 * writes DOM directly. React wants to own what it renders. Both cannot be
 * true of the same node, and letting them share one is how you get a tree that
 * lies: React believes it rendered the text, ui.js overwrites it, and the next
 * reconciliation silently reverts whatever ui.js just said.
 *
 * THE RULE, STATED ONCE: **imperative code publishes, React renders.**
 * ui.js never touches a rendered node's text. It writes into this store, and
 * `useSyncExternalStore` in the components picks the change up. There is one
 * owner per piece of text, and it is React.
 *
 * WHY useSyncExternalStore AND NOT useState + A LISTENER. The source of truth
 * here is NOT React state — it is a 60fps clock that happens to have text
 * derived from it. useState would mean React state is the real thing and the
 * store is a copy, which is backwards, and it would drift. useSyncExternal-
 * Store is built for exactly this: an external mutable source, read during
 * render, torn reads impossible, and no tearing on concurrent render.
 *
 * WHY THE SNAPSHOT IS REPLACED RATHER THAN MUTATED. useSyncExternalStore
 * compares snapshots by identity; a mutated object reads as "unchanged" and
 * React silently stops updating, which is the worst possible failure for a
 * store like this. Every publish makes a NEW frozen object, so identity change
 * is the change signal and it cannot lie.
 *
 * This is the only mutable bridge in the migration. It is deliberately small:
 * four fields, none of them pixels, and none of them read on the frame path.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});

  /* What React needs to know. Anything not here is not rendered by React. */
  function initial() {
    return Object.freeze({
      name: 'Shiro',   /* overwritten from config.CAT_NAME once config.js loads */
      /* NBSP, written as an escape on purpose. The static markup this replaced
       * shipped `&nbsp;` so the line box survived before anything was said, and
       * a plain space collapses — which is a different box on the first frame.
       * As a literal character it survives file round-trips and edits; typed
       * bare it does not, and it is invisible either way. */
      dialogue: ' ',
      typing: false,
      clock: '--:--',
      muted: false,
      started: false   /* has the PRESS START gate been dismissed? */
    });
  }

  var state = initial();
  var listeners = [];

  function emit() {
    for (var i = 0; i < listeners.length; i++) listeners[i]();
  }

  NESCAT.store = {
    /* the snapshot React renders from */
    get: function () { return state; },

    /* Merge a patch and notify, but only if something actually changed.
     * The typewriter runs at 30 characters a second and most frames produce an
     * identical string; without this guard every one of those would be a
     * React render for no reason. */
    set: function (patch) {
      var changed = false;
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k) && state[k] !== patch[k]) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      var next = {};
      for (var j in state) if (Object.prototype.hasOwnProperty.call(state, j)) next[j] = state[j];
      for (var k2 in patch) if (Object.prototype.hasOwnProperty.call(patch, k2)) next[k2] = patch[k2];
      state = Object.freeze(next);
      emit();
    },

    subscribe: function (fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
