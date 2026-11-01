/**
 * `Behavior#handleCheckboxRightArrowKey()`
 *
 * @param {Event} ev
 * @param {HTMLElement} currentElement
 * @param {Editor} editor
 * @public
 */
 function handleCheckboxRightArrowKey( ev, currentElement, editor ){
    let next = editor.dom.getNextCursorTarget(currentElement);
    if(next && editor.selection.isLastCharacter(currentElement)){
        ev.preventDefault();
        editor.selection.placeCaret(next, {at: 'start'});
    }
}

module.exports = handleCheckboxRightArrowKey;
