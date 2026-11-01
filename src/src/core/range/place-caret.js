'use strict';

/**
 * Places the caret either at the start or end of a given element.
 * @param  {Element} el
 * @param  {Object} pos
 */
module.exports = function placeCaret(el, pos = {at: 'start'}) {
    var selection = window.getSelection();
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(pos.at === 'start');
    selection.removeAllRanges();
    selection.addRange(range);
};
