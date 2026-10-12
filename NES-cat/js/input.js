/* ============================================================
 * NES-cat — input.js
 *
 * One pointer path for mouse + touch (Pointer Events). Turns raw input into
 * Shiro's gestures, and the room's objects:
 *
 *   press on Shiro, release quickly   -> pet burst
 *   press on Shiro, hold              -> continuous petting
 *   press on Shiro, move              -> drag her along the floor
 *   press on the yarn, move           -> push the ball of wool about
 *   press on any other object         -> she goes and does the thing it is for
 *   press on empty room, release      -> play (notes)
 *
 * The object cases are the ones that needed the room to be addressable. The
 * only hit test this file used to have was `_hitShiro` — a bounding box
 * against a hardcoded 32 — which cannot ask "what else is here, and how big
 * is it" and therefore had nothing to offer a ball of wool.
 *
 * It also keeps Shiro's gaze pointed at the cursor.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});
  var U = NESCAT.util;

  /* The two thresholds that decide what a press means. These are in config
   * rather than here: they are the difference between "a click on her" and
   * "you have picked her up", which is a feel value, and a feel value that
   * lives in a file called `input.js` cannot be tuned from the place the
   * README tells you to tune from. */
  var DRAG_THRESHOLD = NESCAT.config.INPUT.dragThreshold;
  var GAZE_DEADZONE = NESCAT.config.INPUT.gazeDeadzone;

  var Input = {
    x: 0,
    y: 0,
    inside: false,
    pressed: false,
    dragging: false,
    _startX: 0,
    _startY: 0,
    _onShiro: false,
    /* the room object this press started on, if any. Separate from
     * _onShiro because pressing the cat and pressing the thing next to her
     * are different gestures, and because a press that started on nothing is
     * still a press that may become a drag. */
    _onObject: null,
    _lastObjX: 0,

    init: function () {
      var self = this;
      var el = (typeof document !== 'undefined') ? document.querySelector('canvas') : null;
      if (!el) return;
      this._el = el;

      /* Pointer Events cover mouse, touch and pen in one path. */
      el.addEventListener('pointerdown', function (e) { self._down(e); }, { passive: false });
      root.addEventListener('pointermove', function (e) { self._move(e); }, { passive: true });
      root.addEventListener('pointerup', function (e) { self._up(e); }, { passive: true });
      root.addEventListener('pointercancel', function (e) { self._up(e); }, { passive: true });
      /* a pointer leaving the window should never leave her stuck in drag */
      root.addEventListener('blur', function () { self._cancel(); });

      /* touch: stop the page scrolling/zooming under the finger */
      el.style.touchAction = 'none';
    },

    _locate: function (e) {
      var p = NESCAT.layout.toLogical(e.clientX, e.clientY);
      return p;
    },

    _hitShiro: function (x, y) {
      var s = NESCAT.Shiro;
      return x >= s.x && x <= s.x + 32 && y >= s.y && y <= s.y + 32;
    },

    /* What is under the pointer, if it is something rather than the cat.
     *
     * `objectAt` reads the same OBJECTS table the renderer and the collider
     * read, so what you can click is exactly what is drawn — which is the
     * property that was missing before, and the reason to do this through
     * frames rather than through a second list of rectangles. */
    _hitObject: function (x, y) {
      var Sc = NESCAT.Scene;
      if (!Sc || !Sc.objectAt) return null;
      /* the cat is in front of the furniture, so she is what you are pressing
       * on if she is anywhere near it */
      if (this._hitShiro(x, y)) return null;
      return Sc.objectAt(x, y);
    },

    _down: function (e) {
      if (e.cancelable) e.preventDefault();
      var p = this._locate(e);
      this.x = p.x; this.y = p.y;
      this.pressed = true;
      this.dragging = false;
      this.inside = true;
      this._startX = p.x; this._startY = p.y;
      this._onObject = null;

      if (this._hitShiro(p.x, p.y)) {
        this._onShiro = true;
        NESCAT.Shiro.petStart();
      } else {
        this._onShiro = false;
        var obj = this._hitObject(p.x, p.y);
        if (obj) {
          this._onObject = obj;
          this._lastObjX = p.x;
          /* a grabbable object is picked up on press, not on a drag
           * threshold: a ball of wool does not need a 6px commitment before it
           * comes off the floor */
          NESCAT.Scene.grab(obj, p.x);
        }
      }
      this.updateGaze();
    },

    _move: function (e) {
      var p = this._locate(e);
      this.x = p.x; this.y = p.y;

      if (this.pressed) {
        var dx = p.x - this._startX;
        var dy = p.y - this._startY;
        var moved = (dx * dx + dy * dy) > DRAG_THRESHOLD * DRAG_THRESHOLD;

        if (this._onObject) {
          NESCAT.Scene.dragObject(p.x);
          this._lastObjX = p.x;
        } else if (!this.dragging && this._onShiro && moved) {
          this.dragging = true;
          NESCAT.Shiro.dragStart();
        }
        if (this.dragging) NESCAT.Shiro.dragTo(p.x - 16, p.y);
      }
      this.updateGaze();
    },

    _up: function (e) {
      /* Only a gesture that STARTED on the canvas counts. Without this guard a
       * pointer-up from the HUD buttons (SOUND, PRESS START) would be read as a
       * "click the room to play" and fire Shiro.play(). */
      if (!this.pressed) { this.updateGaze(); return; }
      var p = this._locate(e);
      this.x = p.x; this.y = p.y;

      if (this._onObject) {
        /* Let go, with however much momentum the pointer had. A flick throws
         * the ball and a careful placement does not, which is the difference
         * between an object and a decoration. */
        NESCAT.Scene.releaseObject((p.x - this._lastObjX) * 60);
        /* and she goes to see what you did with it */
        NESCAT.Shiro.notice(this._onObject);
      } else if (this.dragging) {
        NESCAT.Shiro.dragEnd();
      } else if (this._onShiro) {
        NESCAT.Shiro.petStop();
      } else {
        /* a click on the room itself = play */
        NESCAT.Shiro.play();
      }
      this.pressed = false;
      this.dragging = false;
      this._onShiro = false;
      this._onObject = null;
      this.updateGaze();
    },

    _cancel: function () {
      if (this._onObject) NESCAT.Scene.releaseObject(0);
      else if (this.dragging) NESCAT.Shiro.dragEnd();
      else if (this._onShiro) NESCAT.Shiro.petStop();
      this.pressed = false;
      this.dragging = false;
      this._onShiro = false;
      this._onObject = null;
    },

    /* Shiro glances toward the cursor when it is far enough to her side.
     *
     * She does not follow a ball of wool being dragged past her nose — that
     * would be her tracking your hand rather than looking at where she is,
     * and the hunt reads far better if she only finds out by turning round. */
    updateGaze: function () {
      var s = NESCAT.Shiro;
      if (!s || !s.sprite) return;
      /* during play/drag her eyes are busy elsewhere */
      if (this.dragging || s.petting || this._onObject) { s.look = 0; return; }

      var dx = this.x - (s.x + 16);
      if (Math.abs(dx) < GAZE_DEADZONE) s.look = 0;
      else s.look = dx < 0 ? -1 : 1;
    }
  };

  NESCAT.Input = Input;
})(typeof window !== 'undefined' ? window : globalThis);
