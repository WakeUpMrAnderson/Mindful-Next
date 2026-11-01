/**
 * `Behavior#handleCheckboxBackArrowKey()`
 *
 * @param {Event} ev
 * @param {HTMLElement} currentElement
 * @param {Editor} editor
 * @public
 */
 function handleCheckboxBackArrowKey( ev, currentElement, editor ){
    let prev = editor.dom.getPrevCursorTarget(currentElement);
    if(prev && editor.selection.isFirstCharacter(currentElement)){
        ev.preventDefault();
        editor.selection.placeCaret(prev, {at: 'end'});
    }
}

module.exports = handleCheckboxBackArrowKey;
