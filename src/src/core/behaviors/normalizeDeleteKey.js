/**
 * `Behavior#normalizeDeleteKey()`
 *
 * @param {Event} ev
 * @param {Element} currentElement
 * @param {Object} editor
 * @public
 */
function normalizeDeleteKey(ev, currentElement, editor) {
    if (editor.selection.isLastCharacter(currentElement)) {
        var next = editor.dom.getNextCursorTarget(currentElement);
        if (!next || editor.properties.forElement(next).property('hidesCursor')) {
            ev.preventDefault();
            editor.selection.placeCaret(next, {at:'end'});
        }
        return false;
    }
}

module.exports = normalizeDeleteKey;
