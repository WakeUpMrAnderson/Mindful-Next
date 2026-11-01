/**
 * Minimal replacement for webpack's style-loader: appends the CSS text of a
 * module to <head> exactly once per module id. The original 2016 build used
 * css-loader + style-loader; the readable rebuild injects the identical CSS
 * without loader machinery.
 */

const injected = new Set();

export default function injectStyle(id, css) {
    if (injected.has(id)) return;
    injected.add(id);
    const el = document.createElement('style');
    el.setAttribute('data-frontkit-module', id);
    el.textContent = css;
    document.head.appendChild(el);
}
