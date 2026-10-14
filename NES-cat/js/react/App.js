/* ============================================================
 * NES-cat — js/react/App.js
 *
 * The React shell. This is the coexistence proof, and the whole of it:
 * React takes the DOM that was hand-written in index.html — the HUD, the
 * dialogue box, the PRESS START gate — and rebuilds it as a component tree.
 *
 * THE ONE RULE THIS FILE EXISTS TO KEEP
 * React does NOT own the pixel loop. The canvas is p5's, in global mode,
 * running the same sketch.js it always ran, with its own rAF. React renders
 * markup AROUND it and never touches it. Nothing here draws a pixel, and
 * nothing here re-renders on a clock — there is no setState in the rAF path,
 * because a 60fps reconciliation of a pixel grid is the thing this migration
 * is specifically not doing.
 *
 * In this first phase React owns STRUCTURE only. Every piece of dynamic text —
 * the dialogue typewriter, the clock, the sound label, the gate's visibility —
 * is still written imperatively by ui.js into the nodes React rendered. That
 * is deliberate and temporary: it makes the first phase a zero-visual-change
 * proof, and the phase after it hands text ownership to React properly.
 *
 * The markup below is a faithful reproduction of what index.html had, ids,
 * classes and initial text included. style.css is written against `#hud`
 * and `.hud-*` at two-class specificity, so those names are load-bearing and
 * changing one would move the HUD. They are kept exactly.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});
  var h = NESCAT.h;
  var Fragment = NESCAT.Fragment;
  var React = root.React;

  /* Read the imperative store the way React expects to read an external
   * source. useSyncExternalStore is built for exactly this case: an external
   * mutable source read during render, with no tearing and no "React state is
   * the real thing, the store is a copy" drift. The third argument is the
   * server snapshot, which this app never uses, but returning the same frozen
   * object is correct for it too. */
  function useStore() {
    return React.useSyncExternalStore(
      NESCAT.store.subscribe,
      NESCAT.store.get,
      NESCAT.store.get
    );
  }

  /* ---------- <Canvas> --------------------------------------------------
   *
   * The imperative layer, mounted but not owned.
   *
   * p5 in global mode parents its canvas into #stage and drives setup/draw
   * from its own loop. React's entire involvement is to put #stage in the
   * document at the right moment: the mount below runs BEFORE the p5 script
   * tag, flushed synchronously, so #stage exists by the time p5 boots and
   * `createCanvas(...).parent('stage')` resolves. If this ever rendered
   * asynchronously, p5 would start first and parent to nothing.
   *
   * After mount, React has no further involvement with the canvas at all. */
  function Canvas() {
    return h('div', { id: 'stage' });
  }

  /* ---------- <Hud> ------------------------------------------------------
   * The title bar, the sound button and the dialogue box.
   *
   * Every piece of text here is React's, read from the store ui.js publishes
   * into. ui.js attaches its click handlers to these nodes by id — the nodes
   * are React's, the behaviour is not, and a button with a listener on it is
   * still owned by whoever rendered it. */
  function Hud() {
    var s = useStore();
    return h('div', { id: 'hud' },
      h('div', { className: 'nes-container is-dark hud-top' },
        h('span', { className: 'nes-text is-primary', id: 'cat-name' }, s.name),
        h('span', { className: 'hud-clock', id: 'clock' }, s.clock)
      ),
      h('div', { className: 'nes-container is-dark hud-bars' },
        h('button', { id: 'mute', className: 'nes-btn hud-btn' + (s.muted ? ' is-off' : '') },
          s.muted ? 'SOUND: OFF' : 'SOUND: ON')
      ),
      h('div', { id: 'dialogue', className: 'nes-container is-dark hud-dialogue' },
        /* NBSP, not a plain space: the static markup used &nbsp; so the line
         * box survives before anything is said. A collapsing space would be a
         * different box on the first frame. */
        h('p', { id: 'dialogue-text', className: 'dialogue-text' },
          s.dialogue + (s.typing ? '▮' : ''))
      )
    );
  }

  /* ---------- <Gate> -----------------------------------------------------
   * PRESS START. Also the user gesture that unlocks audio, which is why it
   * cannot become a passive overlay — ui.js's click handler is load-bearing,
   * not decoration.
   *
   * `is-hidden` used to be a class added to a DOM node. React owns the class
   * now, so the dismiss is a reconciliation like everything else here; the
   * CSS transition behind it is untouched. */
  function Gate() {
    var s = useStore();
    return h('div', { id: 'gate', className: 'gate' + (s.started ? ' is-hidden' : '') },
      h('div', { className: 'nes-container is-dark gate-box' },
        h('p', { className: 'gate-title' }, 'NES-CAT'),
        h('p', { className: 'gate-sub' }, 'a small cat in a cozy room'),
        h('button', { id: 'gate-start', className: 'nes-btn is-primary gate-btn' }, 'PRESS START'),
        h('p', { className: 'gate-hint' },
          'click her to be headbutted · drag to carry',
          h('br'),
          'click the room to play · she naps after dark'
        )
      )
    );
  }

  /* ---------- <Game> -----------------------------------------------------
   * Owns composition and nothing else. No routing yet — the piece has exactly
   * one scene, and a router over one route would be a component tree drawing
   * attention to a problem the project does not have. `<Story>` arrives with
   * the first branch that needs it.
   *
   * Ordering matters: <Canvas> first so #stage is in the document, then the
   * overlay. The overlay is last so the HUD and gate paint over the canvas,
   * which is also what their z-index already says. */
  function Game() {
    return h(Fragment, null,
      h(Canvas),
      h(Hud),
      h(Gate)
    );
  }

  NESCAT.react = {
    Game: Game,
    Canvas: Canvas,
    Hud: Hud,
    Gate: Gate
  };
})(typeof window !== 'undefined' ? window : globalThis);
