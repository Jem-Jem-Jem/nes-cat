/* ============================================================
 * NES-cat — input.js
 *
 * One pointer path for mouse + touch (Pointer Events). Turns raw input into
 * Shiro's three gestures:
 *
 *   press on Shiro, release quickly   -> pet burst
 *   press on Shiro, hold              -> continuous petting
 *   press on Shiro, move              -> drag her along the floor
 *   press anywhere else, release      -> play (notes, energy down)
 *
 * It also keeps Shiro's gaze pointed at the cursor.
 * ============================================================ */
(function (root) {
  'use strict';

  var NESCAT = (root.NESCAT = root.NESCAT || {});
  var U = NESCAT.util;

  var DRAG_THRESHOLD = 6;    /* logical px before a press becomes a drag */
  var GAZE_DEADZONE = 6;     /* logical px before the eyes glance */

  var Input = {
    x: 0,
    y: 0,
    inside: false,
    pressed: false,
    dragging: false,
    _startX: 0,
    _startY: 0,
    _onShiro: false,

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

    _down: function (e) {
      if (e.cancelable) e.preventDefault();
      var p = this._locate(e);
      this.x = p.x; this.y = p.y;
      this.pressed = true;
      this.dragging = false;
      this.inside = true;
      this._startX = p.x; this._startY = p.y;

      if (this._hitShiro(p.x, p.y)) {
        this._onShiro = true;
        NESCAT.Shiro.petStart();
      } else {
        this._onShiro = false;
      }
      this.updateGaze();
    },

    _move: function (e) {
      var p = this._locate(e);
      this.x = p.x; this.y = p.y;

      if (this.pressed) {
        var dx = p.x - this._startX;
        var dy = p.y - this._startY;
        if (!this.dragging && this._onShiro && (dx * dx + dy * dy) > DRAG_THRESHOLD * DRAG_THRESHOLD) {
          this.dragging = true;
          NESCAT.Shiro.dragStart();
        }
        if (this.dragging) NESCAT.Shiro.dragTo(p.x - 16);
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

      if (this.dragging) {
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
      this.updateGaze();
    },

    _cancel: function () {
      if (this.dragging) NESCAT.Shiro.dragEnd();
      else if (this._onShiro) NESCAT.Shiro.petStop();
      this.pressed = false;
      this.dragging = false;
      this._onShiro = false;
    },

    /* Shiro glances toward the cursor when it is far enough to her side. */
    updateGaze: function () {
      var s = NESCAT.Shiro;
      if (!s || !s.sprite) return;
      /* during play/drag her eyes are busy elsewhere */
      if (this.dragging || s.petting) { s.look = 0; return; }

      var dx = this.x - (s.x + 16);
      if (Math.abs(dx) < GAZE_DEADZONE) s.look = 0;
      else s.look = dx < 0 ? -1 : 1;
    }
  };

  NESCAT.Input = Input;
})(typeof window !== 'undefined' ? window : globalThis);
