/**
 * F-shortcuts: the editor's keyboard-shortcut registry.
 *
 * One place for every command combo: platform-aware defaults, user
 * overrides (localStorage `shortcutmap`), matching against keydown
 * events, label rendering for the settings UI, and validation
 * (Chrome-reserved keys, AltGr conflicts, duplicate assignments).
 *
 * Combo shape: { meta, ctrl, alt, shift, key } where `key` is the
 * unmodified key name ('B', '5', '.'); `matches` compares a keydown
 * event against the combo exactly.
 */

'use strict';

var MAC = /Mac|iP(hone|ad|od)/.test(navigator.platform || '');
var MOD = MAC ? 'meta' : 'ctrl';

// Keys must be the real registry command names (Commands.register).
var DEFAULTS = {
    bold:               MAC ? { meta: true, key: 'B' }
                            : { ctrl: true, key: 'B' },
    italic:             MAC ? { meta: true, key: 'I' }
                            : { ctrl: true, key: 'I' },
    openLinkPrompt:     MAC ? { meta: true, key: 'K' }
                            : { ctrl: true, key: 'K' },
    // Ctrl/Cmd+digit is Chrome-reserved (SelectTab N); Cmd+Shift+5 is the
    // macOS screenshot utility — strikethrough takes the Google Docs
    // conventions: Alt+Shift+5 on Windows/Linux, Cmd+Shift+X on Mac
    strikethrough:      MAC ? { meta: true, shift: true, key: 'X' }
                            : { ctrl: false, alt: true, shift: true, key: '5' },
    toggleCheckbox:     MAC ? { meta: true, key: '.' }
                            : { ctrl: true, key: '.' },
    removeCheckedItems: MAC ? { meta: true, shift: true, key: '.' }
                            : { ctrl: true, shift: true, key: '.' },
};

// Friendly names for the settings rows (fallback: the command name).
var LABELS = {
    bold:               'Bold',
    italic:             'Italic',
    strikethrough:      'Strikethrough',
    openLinkPrompt:     'Insert link',
    toggleCheckbox:     'Tick checklist item',
    removeCheckedItems: 'Remove checked items',
};

var OVERRIDES_KEY = 'shortcutmap';

var KEY_CODES = (function () {
    var codes = {};
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (var i = 0; i < letters.length; i++) {
        codes[letters[i]] = 65 + i;
    }
    for (var d = 0; d <= 9; d++) {
        codes[String(d)] = 48 + d;
    }
    codes['.'] = 190;
    codes[','] = 188;
    codes['/'] = 191;
    codes[';'] = 186;
    codes['\''] = 222;
    codes['['] = 219;
    codes[']'] = 221;
    codes['\\'] = 220;
    codes['-'] = 189;
    codes['='] = 187;
    return codes;
})();

// keyCode → key name, for capture mode (String.fromCharCode mangles
// punctuation: 190 → '¾' instead of '.')
var KEY_FROM_CODE = (function () {
    var rev = {};
    for (var name in KEY_CODES) {
        if (rev[KEY_CODES[name]] === undefined) rev[KEY_CODES[name]] = name;
    }
    return rev;
})();

function comboKey(combo) {
    return (combo.meta ? 'meta+' : '') + (combo.ctrl ? 'ctrl+' : '') +
        (combo.alt ? 'alt+' : '') + (combo.shift ? 'shift+' : '') +
        String(combo.key).toLowerCase();
}

function overrides() {
    try {
        var parsed = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}');
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
        return {};
    }
}

export default {
    MOD: MOD,

    /** Platform default for a command (what ships without overrides). */
    platformDefault: function (command) {
        return DEFAULTS[command] || null;
    },

    /** The active combo for a command: user override, else platform default. */
    active: function (command) {
        var override = overrides()[command];
        if (override && typeof override === 'object' &&
            (override.meta || override.ctrl || override.alt) &&
            KEY_CODES[override.key] !== undefined) {
            return override;
        }
        return DEFAULTS[command] || null;
    },

    /** keyCode → key name ('A', '5', '.'), or null when unsupported. */
    keyFromCode: function (code) {
        return KEY_FROM_CODE[code] || null;
    },

    /** Friendly row label for the settings UI. */
    label: function (command) {
        return LABELS[command] || command;
    },

    /** True when the keydown event matches the command's active combo. */
    matches: function (command, ev) {
        var combo = this.active(command);
        if (!combo) return false;
        var keyCode = KEY_CODES[combo.key];
        return ev.keyCode === keyCode &&
            !!ev.metaKey === !!combo.meta &&
            !!ev.ctrlKey === !!combo.ctrl &&
            !!ev.altKey === !!combo.alt &&
            !!ev.shiftKey === !!combo.shift;
    },

    /** Human label for the settings UI: "Ctrl + Shift + 5". */
    comboLabel: function (command) {
        var combo = this.active(command);
        if (!combo) return '';
        var parts = [];
        if (combo.meta) parts.push(MAC ? '⌘' : 'Win');
        if (combo.ctrl) parts.push(MAC ? '⌃' : 'Ctrl');
        if (combo.alt) parts.push(MAC ? '⌥' : 'Alt');
        if (combo.shift) parts.push(MAC ? '⇧' : 'Shift');
        parts.push(String(combo.key).toUpperCase());
        return parts.join(MAC ? ' ' : ' + ');
    },

    /**
     * Validate a candidate combo for a command. Returns null when
     * acceptable, or a human reason string for the settings UI.
     */
    validate: function (command, combo) {
        if (!combo.key || KEY_CODES[combo.key] === undefined) {
            return 'Unknown key';
        }
        if (!combo.meta && !combo.ctrl && !combo.alt) {
            return 'Needs a modifier (plain keys would eat typing)';
        }
        // Cmd and Ctrl reserve the same tab commands (Ctrl+digit =
        // SelectTab N; Cmd+Shift+T/N also reserved) — shift keeps digits
        // usable (Ctrl+Shift+5 is not a tab switch), alt does not
        if ((combo.ctrl || combo.meta) && /^[0-9]$/.test(combo.key) && !combo.shift && !combo.alt) {
            return (combo.ctrl ? 'Ctrl' : 'Cmd') + ' + digit switches Chrome tabs';
        }
        if ((combo.ctrl || combo.meta) &&
            ['T', 'W', 'N'].indexOf(combo.key.toUpperCase()) !== -1 && !combo.alt) {
            return 'Reserved by Chrome (new tab / close tab / reopen / incognito)';
        }
        if (!MAC && combo.ctrl && combo.alt) {
            return 'Ctrl + Alt is AltGr on international keyboards';
        }
        var normalized = comboKey(combo);
        var map = this.activeMapAll();
        for (var other in map) {
            if (other !== command && comboKey(map[other]) === normalized) {
                return 'Already used for ' + this.label(other);
            }
        }
        return null;
    },

    /** All active combos (defaults + overrides) — for the settings rows. */
    activeMapAll: function () {
        var map = {};
        for (var command in DEFAULTS) {
            map[command] = this.active(command);
        }
        return map;
    },

    /**
     * Persist a user override (or remove it with null). Validates before
     * writing — returns the rejection reason, or null on success.
     */
    setOverride: function (command, combo) {
        if (combo) {
            var reason = this.validate(command, combo);
            if (reason) return reason;
        }
        var map = overrides();
        if (combo) {
            map[command] = { meta: !!combo.meta, ctrl: !!combo.ctrl, alt: !!combo.alt, shift: !!combo.shift, key: combo.key };
        } else {
            delete map[command];
        }
        localStorage.setItem(OVERRIDES_KEY, JSON.stringify(map));
        return null;
    }
};
