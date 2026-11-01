/**
 * `Behavior#detectVoidElement()`
 *
 * @param {Event} ev
 * @param {Element} currentElement
 * @param {Object} editor
 * @public
 */

function detectVoidElement( ev, currentElement, editor ){
    // continue chaining if it's not the first char
    if ( !editor.selection.isFirstCharacter( currentElement ) ) { return true; }
    var prev = editor.dom.getPrevCursorTarget( currentElement );

    if ( prev && editor.dom.hidesCursor( prev ) && editor.selection.range.collapsed ){
        ev.preventDefault();
        editor.updateContext( prev );

        if ( !currentElement.textContent.length ){
            editor.dom.removeElement( currentElement );
        }
        return false;
    }
}

module.exports = detectVoidElement;
