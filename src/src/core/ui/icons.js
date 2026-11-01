/**
 * First-party inline icon set — replaces the unrecoverable `frontkit`
 * icon font (its binaries 404 since 2016; see SECURITY/history).
 *
 * Icons are feather-style stroke SVGs (MIT) plus typographic text glyphs
 * (H1, B, I…) rendered in the page's own monospace font. Everything draws
 * with `currentColor`, so day/night theming keeps working.
 *
 * Usage: put `<span data-icon="name"></span>` (or the attribute on the
 * element itself) anywhere in the document, then:
 *   decorateIcons();      // fills every [data-icon] once
 *   watchIcons();         // keeps decorating as UI re-renders
 */

const stroke = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

function svg(body, size = 20) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" ${stroke} aria-hidden="true">${body}</svg>`;
}

function text(glyph, style = '') {
    return `<span class="fk-icon-text" style="${style}" aria-hidden="true">${glyph}</span>`;
}

export const ICONS = {
    // toggle rail
    info: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
    sun: svg('<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'),
    moon: svg('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
    show: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    hide: svg('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'),
    // inline menu
    h1: text('H1'),
    h2: text('H2'),
    p: text('P'),
    blockquote: text('“', 'font-size:20px;font-weight:700'),
    hr: svg('<line x1="5" y1="12" x2="19" y2="12"/>', 16),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 17),
    orderedlist: svg('<line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>', 16),
    unorderedlist: svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>', 16),
    checkbox: svg('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 16),
    // bubble
    bold: text('B', 'font-weight:700'),
    italic: text('I', 'font-style:italic'),
    strikethrough: text('S', 'text-decoration:line-through'),
    link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', 15),
    checkboxbulk: svg('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 15),
    alignleft: svg('<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>', 15),
    aligncenter: svg('<line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/>', 15),
    alignright: svg('<line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/>', 15),
    caption: svg('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>', 15),
    trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 15),
    'chevron-left': svg('<polyline points="15 18 9 12 15 6"/>', 16),
    'chevron-right': svg('<polyline points="9 18 15 12 9 6"/>', 16),
};

const STYLE_SHEET = `
    [data-icon] { display: flex; align-items: center; justify-content: center; }
    [data-icon]:before { content: none !important; }   /* kill frontkit font glyphs */
    [class^="fk-icon-"]:before, [class*=" fk-icon-"]:before,
    [class^="fk-ui-icon-"]:before, [class*=" fk-ui-icon-"]:before {
        content: none !important;   /* blanket: no frontkit glyph fallbacks anywhere */
    }
    [data-icon] svg { display: block; }
    .fk-icon-text { font-family: Menlo, 'Roboto Mono', 'Noto Sans', sans-serif;
        font-weight: 700; line-height: 1; white-space: nowrap; }
`;

export function decorateIcons(root = document) {
    // include the root itself — delta callers hand in the tightest root
    // (an added [data-icon] element is its own closest ancestor)
    const targets = root.matches && root.matches('[data-icon]')
        ? [root].concat([...root.querySelectorAll('[data-icon]')])
        : [...root.querySelectorAll('[data-icon]')];
    targets.forEach(el => {
        if (el.__iconDecorated) return;
        const name = el.dataset.icon;
        if (!ICONS[name]) return;
        el.__iconDecorated = true;
        el.appendChild((new DOMParser()).parseFromString(ICONS[name], 'text/html').body.firstChild);
    });
}

let rafPending = false;
let pendingRoots = new Set();

/**
 * Keeps every [data-icon] decorated as UI re-renders. F11: instead of
 * re-scanning the whole document on every rAF batch, the mutation records'
 * added elements (and attribute targets) are collected as DELTA roots and
 * only those subtrees are scanned — the cost follows the batch size, not
 * the document size.
 */
export function watchIcons() {
    if (document.getElementById('icon-styles') === null) {
        const style = document.createElement('style');
        style.id = 'icon-styles';
        style.textContent = STYLE_SHEET;
        document.head.appendChild(style);
    }
    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.addedNodes && m.addedNodes.length) {
                m.addedNodes.forEach(n => {
                    if (n.nodeType !== Node.ELEMENT_NODE) return;
                    // the tightest root that still contains any new
                    // [data-icon]: the node itself or its closest decorated
                    // ancestor
                    pendingRoots.add((n.closest && n.closest('[data-icon]')) || n);
                });
            } else if (m.type === 'attributes' && m.target && m.target.getAttribute &&
                m.target.getAttribute('data-icon')) {
                pendingRoots.add(m.target);
            }
        }
        if (rafPending || !pendingRoots.size) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            const roots = pendingRoots;
            pendingRoots = new Set();
            roots.forEach(root => decorateIcons(root));
        });
    });
    // attributeFilter: only data-icon writes matter here — without it every
    // class/style write in the app (fk-active toggles, bubble repositioning)
    // would generate records for the delta collection to reject
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-icon'] });
    decorateIcons(document);
}
