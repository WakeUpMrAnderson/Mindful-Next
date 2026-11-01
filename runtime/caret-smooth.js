/* Mindfule — smooth custom caret overlay (Word-style blink).
   Renders a fixed-position caret bar that follows the collapsed
   selection inside article.fk-editable. Hides for ranged selections
   and whenever the selection leaves the editor. */
(function () {
  // Tuning constants.
  var TYPING_PAUSE_MS = 600;      // solid-while-typing window before blinking resumes
  var FALLBACK_CARET_HEIGHT = 26; // px caret-bar height when no text metrics exist
  var LINE_HEIGHT_FACTOR = 1.65;  // estimated line-height multiplier for the block fallback

  function initSmoothCaret() {
    var article = document.querySelector('article.fk-editable');
    if (!article || window.__mfkSmoothCaret) return;
    window.__mfkSmoothCaret = true;

    var caret = document.createElement('div');
    caret.className = 'mfk-caret';
    caret.setAttribute('aria-hidden', 'true');
    document.body.appendChild(caret);

    // Suppress the transform transition until the overlay has been
    // placed once, or the very first appearance would glide in from
    // the viewport origin (the element is pinned at left:0/top:0).
    caret.style.transition = 'none';

    function hide() {
      caret.classList.add('mfk-caret--hidden');
      document.documentElement.classList.remove('mfk-overlay-active');
    }

    function show() {
      caret.classList.remove('mfk-caret--hidden');
      document.documentElement.classList.add('mfk-overlay-active');
    }

    // Deepest first/last text node under `node` (or null).
    function deepTextNode(node, last) {
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) return node;
        node = last ? node.lastChild : node.firstChild;
      }
      return null;
    }

    // Rect for the text position adjacent to an element boundary point,
    // read from a SYNTHETIC collapsed range — never touches live DOM.
    function nearestTextRect(el, offset) {
      var kids = el.childNodes;
      var tn, pos;
      var before = deepTextNode(kids[offset - 1] || null, true);
      if (before) {
        tn = before; pos = before.length;
      } else {
        tn = deepTextNode(kids[offset] || null, false);
        if (!tn) return null;
        pos = 0;
      }
      var r = document.createRange();
      r.setStart(tn, pos);
      r.collapse(true);
      var rects = r.getClientRects();
      if (rects.length) {
        return { left: rects[0].left, top: rects[0].top, height: rects[0].height || FALLBACK_CARET_HEIGHT };
      }
      var box = r.getBoundingClientRect();
      if (box && (box.height || box.width)) {
        return { left: box.left, top: box.top, height: box.height || FALLBACK_CARET_HEIGHT };
      }
      return null;
    }

    // Measure the collapsed selection rectangle.
    // 1) Range client rects (normal case).
    // 2) Chromium quirk: a collapsed selection anchored to an ELEMENT
    //    (common after mouse clicks / content restore) reports ZERO
    //    rects -> nearest-text-position lookup via synthetic range.
    // 3) Fallback: containing block geometry (no DOM mutation).
    function measureRect(sel) {
      var range = sel.getRangeAt(0);
      var rects = range.getClientRects();
      if (rects.length) {
        var first = rects[0];
        return { left: first.left, top: first.top, height: first.height };
      }

      var anchor = sel.anchorNode;
      if (anchor && anchor.nodeType === Node.ELEMENT_NODE) {
        var tr = nearestTextRect(anchor, sel.anchorOffset);
        if (tr) return tr;
      }

      var node = sel.anchorNode;
      var el = node && (node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
      if (!el) return null;
      var box = el.getBoundingClientRect();
      if (!box || (!box.height && !box.width)) return null;
      var cs = window.getComputedStyle(el);
      var fontSize = parseFloat(cs.fontSize) || 16;
      var height = parseFloat(cs.lineHeight);
      if (!height || isNaN(height)) height = Math.round(fontSize * LINE_HEIGHT_FACTOR);
      return { left: box.left, top: box.top, height: height };
    }

    var placedOnce = false;

    // Chromium quirk: after mouse clicks or content restore the document
    // selection often stays anchored OUTSIDE the article (e.g. on a UI
    // icon) while the editor still holds focus and typing works. So
    // visibility is keyed on EDITOR FOCUS, not on selection containment.
    function update() {
      var active = document.activeElement;
      var editorFocused = !!(active &&
        (active === article || article.contains(active)));

      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !editorFocused) {
        hide();
        return;
      }

      var rect = measureRect(sel);
      if (!rect) { hide(); return; }

      caret.style.height = rect.height + 'px';
      caret.style.transform =
        'translate3d(' + rect.left + 'px, ' + rect.top + 'px, 0)';
      show();

      // Re-enable the 80ms glide one frame after the first placement.
      if (!placedOnce) {
        placedOnce = true;
        requestAnimationFrame(function () {
          caret.style.transition = '';
        });
      }
    }

    var pendingFrame = false;
    function scheduleUpdate() {
      if (pendingFrame) return;
      pendingFrame = true;
      requestAnimationFrame(function () {
        pendingFrame = false;
        update();
      });
    }

    // Word-style typing behavior: keep the caret solid while the user
    // is typing, resume smooth blinking after a short pause.
    var typingTimer = null;
    function markTyping() {
      caret.classList.add('mfk-caret--typing');
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(function () {
        caret.classList.remove('mfk-caret--typing');
        typingTimer = null;
      }, TYPING_PAUSE_MS);
    }
    article.addEventListener('beforeinput', markTyping);

    document.addEventListener('selectionchange', scheduleUpdate);
    document.addEventListener('visibilitychange', scheduleUpdate);
    article.addEventListener('input', scheduleUpdate);
    article.addEventListener('focusin', scheduleUpdate);
    article.addEventListener('focusout', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);

    // Late-loading webfonts change text metrics after the first
    // placement; remeasure once font loading settles.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleUpdate);
    }

    // Layout-only shifts (sidebar toggle, container resize) fire neither
    // input nor scroll events; watch the editor box itself instead.
    // This also re-fires as typing grows the editor, but updates are
    // rAF-coalesced through scheduleUpdate, so the cost stays flat.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(scheduleUpdate).observe(article);
    }

    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmoothCaret);
  } else {
    initSmoothCaret();
  }
})();
