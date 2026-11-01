(function () {
  // Mindful (Next) runtime shims. All content persistence lives in the
  // vault plugin (encrypted); this file only carries UI/mode shims and
  // dead-editor fallbacks.

  function setDayMode(mode) {
    var root = document.documentElement;
    root.classList.remove('night', 'day');
    root.classList.add(mode);
  }

  function applySavedDayMode() {
    var mode = localStorage.getItem('daymode') || 'day';
    setDayMode(mode);
  }

  function toggleDayMode() {
    var isNight = document.documentElement.classList.contains('night');
    var next = isNight ? 'day' : 'night';
    localStorage.setItem('daymode', next);
    setDayMode(next);
  }

  function bindDarkModeFallback() {
    document.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest
        // Night mode is bound by the mindful plugin itself once the editor
        // boots; keeping it here would double-toggle every click. The sun
        // icon has no plugin-side handler, so the fallback stays for it.
        ? ev.target.closest('.fk-icon-sun')
        : null;
      if (!btn) return;
      toggleDayMode();
    });
  }

  function bindNotificationDomCleanup() {
    function pruneDismissedNotifications() {
      var notices = document.querySelectorAll('.notification');
      for (var i = 0; i < notices.length; i++) {
        var n = notices[i];
        if (!n.classList.contains('show')) {
          n.remove();
        }
      }
    }

    document.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest
        ? ev.target.closest('.notification__button')
        : null;
      if (!btn) return;
      var host = btn.closest('.notification');
      if (!host) return;
      setTimeout(function () {
        host.remove();
      }, 0);
    });

    var observer = new MutationObserver(pruneDismissedNotifications);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function sanitizeOutgoingLinks() {
    document.addEventListener('click', function (ev) {
      if (!(ev.metaKey || ev.ctrlKey)) return;
      var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
      if (!a) return;

      var rawHref = a.getAttribute('href') || '';
      var safe = false;
      try {
        var u = new URL(rawHref, window.location.href);
        safe = u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:';
      } catch (_) {
        safe = false;
      }

      if (!safe) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }, true);
  }

  function applySavedHideMode() {
  // Apply persisted hide mode on page load. Fresh installs default to
  // "show" — matching the mindful plugin's own `|| 'show'` fallback — so a
  // first run (or a fresh profile after removing/re-loading the unpacked
  // extension) does not boot with an invisible, unclickable article.
  var saved = localStorage.getItem('hidemode');
  if (saved !== 'hide' && saved !== 'show') {
    // No prior setting – choose the default state.
    saved = 'show';
  }
  // Ensure only one of the two classes is present.
  document.documentElement.classList.remove('hide', 'show');
  document.documentElement.classList.add(saved);
}

  function removeTrailingNewline() {
    var article = document.querySelector('article.fk-editable');
    if (!article) return;
    var last = article.lastChild;
    if (last && last.nodeType === Node.TEXT_NODE && /^\n$/.test(last.nodeValue)) {
      article.removeChild(last);
    }
  }


  function bindInfoAndHideModeFallback() {
    // Dead-editor fallback only: with the editor alive the mindful plugin
    // binds its own handlers for the info and eye icons, and this shim would
    // double-toggle every click (two toggles net to zero = "broken button").
    if (window._editor) return;

    // Capture-phase handler for info (i) and eye (hide/show) buttons.
    document.addEventListener('click', function (ev) {
      var infoBtn = ev.target && ev.target.closest ? ev.target.closest('.fk-icon-info') : null;
      if (infoBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        document.documentElement.classList.toggle('author');
        return;
      }

      var eyeBtn = ev.target && ev.target.closest ? ev.target.closest('.fk-icon-hide, .fk-icon-show') : null;
      if (eyeBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        var next = document.documentElement.classList.contains('show') ? 'hide' : 'show';
        localStorage.setItem('hidemode', next);
        document.documentElement.classList.remove('hide', 'show');
        document.documentElement.classList.add(next);
        return;
      }
    }, true);
  }

  function warnIfEditorBundleMissing() {
    // m.js runs synchronously before this script, so a missing window._editor
    // here means the bundle never executed — most commonly because the repo
    // ROOT was loaded as the unpacked extension (the bundle is generated into
    // dist/). Make that failure visible instead of a page that "half works":
    // native contenteditable typing and the caret overlay still run, but
    // every plugin-side button (theme, info, eye) and saving are dead.
    if (window._editor) return;
    console.error(
      '[Mindful] Editor bundle (m.js) did not load. If chrome://extensions ' +
      'points at the repo root, remove it and Load unpacked the dist/ folder instead.'
    );
    var badge = document.createElement('div');
    badge.textContent = 'Mindful: editor bundle failed to load — point Load unpacked at the dist/ folder, not the repo root.';
    badge.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:8px;z-index:2147483647;' +
      'background:#b3261e;color:#fff;font:12px/1.4 sans-serif;padding:6px 12px;border-radius:4px;';
    document.body.appendChild(badge);
  }

  function init() {
    applySavedDayMode();
    bindDarkModeFallback();
    applySavedHideMode();
    bindInfoAndHideModeFallback(); // add listener for eye/info buttons
    bindNotificationDomCleanup();
    sanitizeOutgoingLinks();
    removeTrailingNewline();
    warnIfEditorBundleMissing();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
