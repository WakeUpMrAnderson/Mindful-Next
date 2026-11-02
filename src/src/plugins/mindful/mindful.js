import shortcuts from '../../core/shortcuts/shortcuts.js';

/**
 * Mindful product plugin: UI behaviors only.
 *
 * All content persistence lives in the vault plugin (src/plugins/vault/),
 * which encrypts everything before it touches chrome.storage or
 * localStorage. This plugin intentionally has no storage code.
 */

import { decorateIcons, watchIcons } from '../../core/ui/icons.js';

function Mindful() {}
Mindful.prototype.init = function(editor){
    this.editor     = editor;

    /*
     * Collect all the element we need to toggle UI states
     */
    this.nightMode = document.body.querySelector('.fk-icon-nightmode');
    this.info = document.body.querySelector('.fk-icon-info');
    // toggle pairs share one rail slot: one is visible, the other is
    // opacity: 0 + pointer-events: none — BOTH carry the click handler,
    // so the visible one is always the working click target (previously
    // only the moon / hide button had a listener and the invisible one
    // happened to sit on top, clicking through its blank surface)
    this.sunMode = document.body.querySelector('.fk-icon-sun');
    this.showMode = document.body.querySelector('.fk-icon-show');
    this.hideMode = document.body.querySelector('.fk-icon-hide');

    // inline SVG icons for the toggle rail, inline menu and bubble
    decorateIcons(document);
    watchIcons();

    try { localStorage.removeItem('nlength'); } catch (_) {}

    this.info.addEventListener('click', ()=> document.documentElement.classList.toggle('author'));

    // link clicking + CMD
    this.initAnchorBehavior();

    // F-settings: the side panel opens from the settings gear. Built
    // EAGERLY (hidden) so other plugins (vault: export/import) can render
    // their settings sections into it at their own init.
    this.settingsBtn = document.body.querySelector('.fk-icon-settings');
    this.buildSettingsPanel();
    this.settingsBtn && this.settingsBtn.addEventListener('click', () => this.toggleSettingsPanel());

    // click-outside closes the panel (the gear toggles — excluded here)
    document.addEventListener('click', (ev) => {
        const panel = this.settingsPanel;
        if (!panel || !panel.classList.contains('mfk-settings-open')) return;
        if (panel.contains(ev.target)) return;
        if (this.settingsBtn && this.settingsBtn.contains(ev.target)) return;
        this.toggleSettingsPanel();
    });

    // initialize night / day mode based on preferences
    this.bindNightDayModeListeners();
    this.setNightMode();
    this.setHideMode();
    this.applyEditorWidth();

    // the settings panel writes the width in this tab — re-read it live
    // from other tabs via the storage event
    window.addEventListener('storage', (e) => {
        if (e.key === 'editorwidth') this.applyEditorWidth();
    });
};

Mindful.prototype.initAnchorBehavior = function(){
    var isCmd = false;
    var isFocused = false;

    this.editor.on('mousemove', (ev)=>{
        // NOTE: the closure `isFocused` (not this.isFocused, which is never
        // set) — this flag tracks the keyboard-driven "focus" UI state.
        if(isFocused) document.documentElement.classList.remove('focus');
        isFocused = false;
    });

    this.editor.on('blur', (ev)=>{
        document.documentElement.classList.remove('metakey');
    });

    this.editor.on('keydown', (ev)=>{
        isCmd = (ev.metaKey || ev.ctrlKey);
        if(isCmd) document.documentElement.classList.add('metakey');

        if(!isFocused) document.documentElement.classList.add('focus');
        isFocused = true;
    });

    this.editor.on('click', (ev)=>{
        if((ev.metaKey || ev.ctrlKey) && ev.target.closest('a')){
            window.open(ev.target.closest('a').getAttribute('href'), '_blank');
        }
    });

    this.editor.on('keyup', (ev)=>{
        if(isCmd) document.documentElement.classList.remove('metakey');
        isCmd = false;
    });
};

Mindful.prototype.setNightMode = function(){
    document.documentElement.classList.remove('night', 'day');
    document.documentElement.classList.add(localStorage.getItem('daymode') || 'day');
};

Mindful.prototype.applyEditorWidth = function(){
    // F-options: the editor column width as a percentage of the window,
    // set from the settings panel (editorwidth, 30-90). Absent key = the
    // 2016 layout (80% width capped at 688px) — zero change by default.
    // --editor-max-cap relaxes the 688px column cap so larger percentages
    // actually apply; m.css keeps a minimum 24px side gap via min().
    var w = parseInt(localStorage.getItem('editorwidth'), 10);
    if (w >= 30 && w <= 90) {
        document.documentElement.style.setProperty('--editor-width', w + '%');
        document.documentElement.style.setProperty('--editor-max-cap', '100vw');
    } else {
        document.documentElement.style.removeProperty('--editor-width');
        document.documentElement.style.removeProperty('--editor-max-cap');
    }
};

Mindful.prototype.toggleSettingsPanel = function(){
    if (!this.settingsPanel) this.buildSettingsPanel();
    this.settingsPanel.classList.toggle('mfk-settings-open');
    if (this.settingsPanel.classList.contains('mfk-settings-open')) {
        this.applyEditorWidth();
        var input = this.settingsPanel.querySelector('.mfk-settings-width-num');
        input && input.focus();
    } else {
        // never leave shortcut capture armed while the panel is closed —
        // it swallows every keydown page-wide until Escape
        this._exitShortcutCapture && this._exitShortcutCapture();
    }
};

Mindful.prototype.ensureSettingsStyles = function(){
    if (document.getElementById('mfk-settings-styles')) return;
    var style = document.createElement('style');
    style.id = 'mfk-settings-styles';
    style.textContent = [
        '.mfk-settings-panel { position: fixed; top: 0; right: 0; bottom: 0;',
        '    width: min(360px, calc(100vw - 24px)); z-index: 2147481000;',
        '    background: #f6f6f6; color: #111;',
        '    box-shadow: -10px 0 36px rgba(0, 0, 0, .28);',
        '    transform: translateX(110%); opacity: 0;',
        '    transition: transform .3s ease, opacity .3s ease;',
        '    overflow-y: auto; }',
        '.mfk-settings-panel.mfk-settings-open { transform: none; opacity: 1; }',
        '.mfk-settings-card { padding: 26px 26px 32px; }',
        '.mfk-settings-head { display: flex; align-items: center;',
        '    justify-content: space-between; margin-bottom: 22px; }',
        '.mfk-settings-head h1 { font-size: 15px; font-weight: 700; margin: 0;',
        '    letter-spacing: .02em; }',
        '.mfk-settings-close { font-size: 18px; line-height: 1; cursor: pointer;',
        '    color: rgba(0, 0, 0, .45); padding: 2px 6px;',
        '    transition: color .2s ease-in-out; }',
        '.mfk-settings-close:hover { color: #111; }',
        '.mfk-settings-panel section { margin-bottom: 26px; }',
        '.mfk-settings-panel section h2 { font-size: 12px; font-weight: 700;',
        '    margin: 0 0 4px; color: inherit; }',
        /* color: inherit — m.css's global h2 { color: #727272 } (editor
           headings) leaks in here and dims the section titles below the
           panel text; the headings must read like the `Settings` h1 */
        '.mfk-settings-sub { font-size: 11px; color: rgba(0, 0, 0, .45);',
        '    margin: 0 0 14px; }',
        '.mfk-settings-row { display: flex; align-items: center; gap: 14px; }',
        '.mfk-settings-row input[type="range"] { flex: 1; accent-color: #111; }',
        '.mfk-settings-row input[type="number"] { width: 60px; padding: 6px 8px;',
        '    box-sizing: border-box; font: inherit; font-size: 12px;',
        '    text-align: center; border: 1px solid rgba(0, 0, 0, .15);',
        '    border-radius: 4px; background: transparent; color: inherit; }',
        '.mfk-settings-unit { font-size: 11px; color: rgba(0, 0, 0, .45); }',
        '.mfk-settings-label { font-size: 11px; flex: 1; }',
        '.mfk-settings-row-tight { margin-top: 10px; }',
        '.mfk-settings-row input[type="checkbox"] { accent-color: #111; }',
        '.night .mfk-settings-row input[type="checkbox"] { accent-color: #dadada; }',
        '.mfk-settings-notes-actions { display: flex; gap: 8px; flex-wrap: wrap; }',
        '/* the vault renders its export/import buttons in here — style them',
        '   like the .mfk-settings-shortcut-combo pills (this sheet loads after',
        '   the vault one, so the panel owns the look of its own section) */',
        '.mfk-settings-notes-actions button { background: none; padding: 5px 12px;',
        '    border: 1px solid rgba(0, 0, 0, .15); border-radius: 4px;',
        '    font: inherit; font-size: 11px; cursor: pointer;',
        '    color: rgba(0, 0, 0, .54);',
        '    transition: color .2s ease-in-out, border-color .2s ease-in-out; }',
        '.mfk-settings-notes-actions button:hover { color: inherit;',
        '    border-color: rgba(0, 0, 0, .4); }',
        '.night .mfk-settings-notes-actions button {',
        '    border-color: rgba(255, 255, 255, .2); color: rgba(255, 255, 255, .54); }',
        '.night .mfk-settings-notes-actions button:hover { color: #dadada;',
        '    border-color: rgba(255, 255, 255, .5); }',
        '.mfk-settings-bounds { display: flex; justify-content: space-between;',
        '    font-size: 10px; color: rgba(0, 0, 0, .35); margin-top: 6px; }',
        '.mfk-settings-preview { margin-top: 16px; font-size: 11px;',
        '    color: rgba(0, 0, 0, .45); }',
        '.mfk-settings-preview i { display: block; height: 10px;',
        '    border-radius: 5px; background: rgba(0, 0, 0, .4);',
        '    transition: width .2s ease-in-out; }',
        '.mfk-settings-saved { font-size: 11px; color: rgba(0, 0, 0, .45);',
        '    opacity: 0; transition: opacity .3s ease-in-out; }',
        '.mfk-settings-saved-show { opacity: 1; }',
        '.mfk-settings-shortcuts { display: flex; flex-direction: column; gap: 8px; }',
        '.mfk-settings-shortcut-row { display: flex; align-items: center;',
        '    justify-content: space-between; gap: 12px; }',
        '.mfk-settings-shortcut-label { font-size: 12px; }',
        '.mfk-settings-shortcut-combo { font: inherit; font-size: 11px;',
        '    padding: 5px 12px; border: 1px solid rgba(0, 0, 0, .15);',
        '    border-radius: 4px; background: transparent; color: inherit;',
        '    cursor: pointer; min-width: 130px; transition: border-color .2s ease-in-out; }',
        '.mfk-settings-shortcut-combo:hover { border-color: rgba(0, 0, 0, .4); }',
        '.mfk-settings-shortcut-combo.mfk-settings-capturing {',
        '    border-color: #111; color: rgba(0, 0, 0, .45); }',
        '.mfk-settings-warn { font-size: 11px; color: #a33; margin: 2px 0 0; }',
        '.night .mfk-settings-shortcut-combo { border-color: rgba(255, 255, 255, .2); }',
        '.night .mfk-settings-shortcut-combo:hover { border-color: rgba(255, 255, 255, .5); }',
        '.night .mfk-settings-shortcut-combo.mfk-settings-capturing {',
        '    border-color: #dadada; color: rgba(255, 255, 255, .45); }',
        '.night .mfk-settings-warn { color: #e89; }',
        '/* night theme */',
        '.night .mfk-settings-panel { background: #1a1d21; color: #dadada; }',
        '.night .mfk-settings-close { color: rgba(255, 255, 255, .45); }',
        '.night .mfk-settings-close:hover { color: #dadada; }',
        '.night .mfk-settings-sub { color: rgba(255, 255, 255, .45); }',
        '.night .mfk-settings-row input[type="range"] { accent-color: #dadada; }',
        '.night .mfk-settings-row input[type="number"] {',
        '    border-color: rgba(255, 255, 255, .2); }',
        '.night .mfk-settings-unit { color: rgba(255, 255, 255, .45); }',
        '.night .mfk-settings-label { color: rgba(255, 255, 255, .54); }',
        '.night .mfk-settings-notes-actions button { color: rgba(255, 255, 255, .54); }',
        '.night .mfk-settings-notes-actions button:hover { color: #dadada; }',
        '.night .mfk-settings-bounds { color: rgba(255, 255, 255, .35); }',
        '.night .mfk-settings-preview { color: rgba(255, 255, 255, .45); }',
        '.night .mfk-settings-preview i { background: rgba(255, 255, 255, .4); }',
        '.night .mfk-settings-saved { color: rgba(255, 255, 255, .45); }',
        '@media (prefers-reduced-motion: reduce) {',
        '    .mfk-settings-panel, .mfk-settings-preview i { transition: none !important; }',
        '}'
    ].join('\n');
    document.head.appendChild(style);
};

Mindful.prototype.buildSettingsPanel = function(){
    this.ensureSettingsStyles();
    var panel = document.createElement('aside');
    panel.className = 'mfk-settings-panel';
    panel.setAttribute('aria-label', 'Settings');
    panel.innerHTML =
        '<div class="mfk-settings-card">' +
            '<div class="mfk-settings-head">' +
                '<h1>Settings</h1>' +
                '<span class="mfk-settings-close" title="Close" role="button" aria-label="Close settings">×</span>' +
            '</div>' +
            '<section>' +
                '<h2>Editor layout</h2>' +
                '<p class="mfk-settings-sub">How wide the writing column is relative to the window.</p>' +
                '<div class="mfk-settings-row">' +
                    '<input type="range" class="mfk-settings-width" min="30" max="90" step="5" value="80" aria-label="Editor width percent">' +
                    '<input type="number" class="mfk-settings-width-num" min="30" max="90" step="1" value="80" aria-label="Editor width percent">' +
                    '<span class="mfk-settings-unit">%</span>' +
                '</div>' +
                '<div class="mfk-settings-bounds"><span>30%</span><span>90%</span></div>' +
                '<div class="mfk-settings-preview"><i></i></div>' +
            '</section>' +
            '<section>' +
                '<h2>Security</h2>' +
                '<p class="mfk-settings-sub">Auto-lock the notes after idle minutes, and whether new tabs demand the passphrase again (strict mode keeps the key out of session storage).</p>' +
                '<div class="mfk-settings-row">' +
                    '<label class="mfk-settings-label" for="mfk-autolock">Auto-lock after</label>' +
                    '<input type="number" class="mfk-settings-autolock" id="mfk-autolock" min="1" max="720" step="1" value="15" aria-label="Auto-lock idle minutes">' +
                    '<span class="mfk-settings-unit">min</span>' +
                '</div>' +
                '<div class="mfk-settings-row mfk-settings-row-tight">' +
                    '<label class="mfk-settings-label" for="mfk-strict">Strict unlock (passphrase in every new tab)</label>' +
                    '<input type="checkbox" class="mfk-settings-strict" id="mfk-strict" aria-label="Strict unlock mode">' +
                '</div>' +
            '</section>' +
            '<section>' +
                '<h2>Sync</h2>' +
                '<p class="mfk-settings-sub">How often the encrypted notes replicate to Chrome sync (local saves are never throttled).</p>' +
                '<div class="mfk-settings-row">' +
                    '<label class="mfk-settings-label" for="mfk-syncinterval">Replicate every</label>' +
                    '<input type="number" class="mfk-settings-syncinterval" id="mfk-syncinterval" min="10" max="600" step="10" value="10" aria-label="Sync interval seconds">' +
                    '<span class="mfk-settings-unit">sec</span>' +
                '</div>' +
            '</section>' +
            '<section>' +
                '<h2>Notes file</h2>' +
                '<p class="mfk-settings-sub">Export your notes as a file, or import from .md / .html (sanitized).</p>' +
                '<div class="mfk-settings-notes-actions"></div>' +
            '</section>' +
            '<section>' +
                '<h2>Shortcuts</h2>' +
                '<p class="mfk-settings-sub">Remap the editor commands: click a binding, then press the new combination. Chrome-reserved keys and duplicates are rejected. Escape cancels.</p>' +
                '<div class="mfk-settings-shortcuts"></div>' +
            '</section>' +
        '</div>';

    var self = this;
    var slider = panel.querySelector('.mfk-settings-width');
    var num = panel.querySelector('.mfk-settings-width-num');
    var bar = panel.querySelector('.mfk-settings-preview i');
    var savedFlash = null;

    function readWidth() {
        var v = parseInt(localStorage.getItem('editorwidth'), 10);
        return (v >= 30 && v <= 90) ? v : 80;
    }
    function render(value) {
        slider.value = value;
        num.value = value;
        bar.style.width = value + '%';
    }
    function save(value) {
        localStorage.setItem('editorwidth', String(value));
        render(value);
        self.applyEditorWidth();
        if (!savedFlash) {
            savedFlash = document.createElement('span');
            savedFlash.className = 'mfk-settings-saved';
            savedFlash.textContent = 'saved';
            panel.querySelector('.mfk-settings-head').appendChild(savedFlash);
        }
        savedFlash.classList.add('mfk-settings-saved-show');
        clearTimeout(self._savedTimer);
        self._savedTimer = setTimeout(() =>
            savedFlash.classList.remove('mfk-settings-saved-show'), 1200);
    }

    slider.addEventListener('input', () => save(parseInt(slider.value, 10)));
    num.addEventListener('change', () => {
        var v = parseInt(num.value, 10);
        if (isNaN(v) || v < 30) v = 30;
        if (v > 90) v = 90;
        save(v);
    });
    panel.querySelector('.mfk-settings-close')
        .addEventListener('click', () => this.toggleSettingsPanel());
    document.addEventListener('keydown', function onEscape(ev) {
        if (ev.keyCode === 27 && panel.classList.contains('mfk-settings-open')) {
            self.toggleSettingsPanel();
        }
    });

    // F-settings: Security — auto-lock minutes (the vault re-reads the
    // key on every arm) and strict unlock (the vault watches the storage
    // event and clears its session key mirror when strict turns on)
    var autolockInput = panel.querySelector('.mfk-settings-autolock');
    autolockInput.value = parseInt(localStorage.getItem('autolock'), 10) || 15;
    autolockInput.addEventListener('change', () => {
        var v = parseInt(autolockInput.value, 10);
        if (isNaN(v) || v < 1) v = 1;
        if (v > 720) v = 720;
        autolockInput.value = v;
        localStorage.setItem('autolock', String(v));
    });

    var strictInput = panel.querySelector('.mfk-settings-strict');
    strictInput.checked = localStorage.getItem('strictunlock') === '1';
    strictInput.addEventListener('change', () => {
        localStorage.setItem('strictunlock', strictInput.checked ? '1' : '0');
        // the vault listens for this storage event and clears its session
        // key mirror when strict turns on
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'strictunlock',
            newValue: strictInput.checked ? '1' : '0',
            oldValue: strictInput.checked ? '0' : '1',
        }));
    });

    // F-settings: Sync — replicate interval seconds (the vault reads it
    // per save)
    var syncInput = panel.querySelector('.mfk-settings-syncinterval');
    syncInput.value = parseInt(localStorage.getItem('syncinterval'), 10) || 10;
    syncInput.addEventListener('change', () => {
        var v = parseInt(syncInput.value, 10);
        if (isNaN(v) || v < 10) v = 10;
        if (v > 600) v = 600;
        syncInput.value = v;
        localStorage.setItem('syncinterval', String(v));
    });

    render(readWidth());
    this.settingsPanel = panel;
    document.body.appendChild(panel);

    // F-shortcuts: the remap rows (built from the shortcuts registry)
    var shortcutsHost = panel.querySelector('.mfk-settings-shortcuts');
    var captureCommand = null;
    function renderShortcutRows() {
        shortcutsHost.innerHTML = '';
        var map = shortcuts.activeMapAll();
        Object.keys(map).forEach(function (command) {
            var row = document.createElement('div');
            row.className = 'mfk-settings-shortcut-row';
            var label = document.createElement('span');
            label.className = 'mfk-settings-shortcut-label';
            label.textContent = shortcuts.label(command);
            var combo = document.createElement('button');
            combo.type = 'button';
            combo.className = 'mfk-settings-shortcut-combo';
            combo.setAttribute('aria-label', 'Change shortcut for ' + shortcuts.label(command));
            combo.textContent = shortcuts.comboLabel(command);
            combo.addEventListener('click', function () {
                if (captureCommand === command) { exitCapture(); renderShortcutRows(); return; }
                exitCapture();
                captureCommand = command;
                combo.classList.add('mfk-settings-capturing');
                combo.textContent = 'press keys…';
            });
            row.appendChild(label);
            row.appendChild(combo);
            shortcutsHost.appendChild(row);
        });
    }
    function exitCapture() {
        captureCommand = null;
        var cap = shortcutsHost.querySelector('.mfk-settings-capturing');
        cap && cap.classList.remove('mfk-settings-capturing');
    }
    // the panel can close from the gear, click-outside or Escape — all go
    // through toggleSettingsPanel, which calls this on the way out
    this._exitShortcutCapture = exitCapture;
    function onCaptureKeydown(ev) {
        if (!captureCommand) return;
        if (ev.keyCode === 27) {   // Escape cancels capture
            exitCapture(); renderShortcutRows();
            ev.preventDefault();
            ev.stopPropagation();
            return;
        }
        // bare modifier press (incl. right-Cmd 93, CapsLock 20) — wait
        // for the full combo
        if ([16, 17, 18, 20, 91, 93].indexOf(ev.keyCode) !== -1) {
            return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        var combo = { meta: !!ev.metaKey, ctrl: !!ev.ctrlKey, alt: !!ev.altKey, shift: !!ev.shiftKey, key: shortcuts.keyFromCode(ev.keyCode) };
        var reason = shortcuts.validate(captureCommand, combo);
        if (reason) {
            var old = shortcutsHost.querySelector('.mfk-settings-warn');
            old && old.remove();
            var warn = document.createElement('p');
            warn.className = 'mfk-settings-warn';
            warn.textContent = reason;
            shortcutsHost.appendChild(warn);
            setTimeout(() => warn.remove(), 2500);
            return;
        }
        shortcuts.setOverride(captureCommand, combo);
        exitCapture();
        renderShortcutRows();
    }
    document.addEventListener('keydown', onCaptureKeydown, true);
    renderShortcutRows();
};

Mindful.prototype.setHideMode = function(){
    document.documentElement.classList.remove('hide', 'show');
    document.documentElement.classList.add(localStorage.getItem('hidemode') || 'show');
};
Mindful.prototype.bindNightDayModeListeners = function(){
    // both buttons of a pair toggle to the OTHER mode — the handler reads
    // the current state, so which button was hit does not matter
    var toggleNightDay = ()=>{
        localStorage.setItem('daymode', document.documentElement.classList.contains('night') ? 'day' : 'night');
        this.setNightMode();
    };
    this.nightMode.addEventListener('click', toggleNightDay);
    this.sunMode.addEventListener('click', toggleNightDay);
    var toggleHideShow = ()=>{
        localStorage.setItem('hidemode', document.documentElement.classList.contains('show') ? 'hide' : 'show');
        this.setHideMode();
    };
    this.showMode.addEventListener('click', toggleHideShow);
    this.hideMode.addEventListener('click', toggleHideShow);
};

module.exports = Mindful;
