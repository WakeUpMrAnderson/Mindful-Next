/**
 * `Behavior#restoreParagraph()`
 *
 * @param {Event} ev
 * @param {Element} currentElement
 * @param {Object} editor
 * @public
 */
function restoreParagraph( ev, currentElement, editor ){
    if (editor.selection.isFirstCharacter( currentElement ) && editor.selection.range.collapsed ){
        // get the parent ancestor element for later referencing
        var ancestor = editor.context.ancestorElement;

        // do not bubble the event to the next UI change
        ev.preventDefault();

        /*
        *   Create element and copy current content to it
        */
        var p = document.createElement('p');
        p.innerHTML = currentElement.innerHTML;

        editor.dom.insertBefore( p, ancestor );

        /*
        *   Always make sure we don't end up with an empty
        *   parent container.
        */
        if ( ancestor.childElementCount === 1) {
            editor.dom.removeElement( ancestor );
        } else {
            editor.dom.removeElement( currentElement );
        }

        editor.selection.placeCaret( p, {at:'start'});
    }
}

module.exports = restoreParagraph;
