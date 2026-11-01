var scrollIntoView = require('../window/scroll-into-view');


/**
 * `Behavior#addCaption()`
 *
 * @param {Event} ev
 * @param {HTMLElement} currentElement
 * @param {Editor} editor
 * @public
 */
 function addCaption( ev, currentElement, editor ){
    if ( ev.shiftKey ) return true;
    ev.preventDefault();

    var ancestorElement =  editor.context.ancestorElement;
    var existingFigcaption = ancestorElement.querySelector('figcaption');

    if( existingFigcaption ){
        editor.selection.placeCaret( existingFigcaption, {at:'end'});
        editor.updateContext( existingFigcaption );
        return scrollIntoView( existingFigcaption );
    }

    var newNode = document.createElement('figcaption');
    newNode.innerHTML = '<br/>';
    ancestorElement.appendChild(newNode);
    editor.updateContext( newNode );

    if ( newNode ){
        scrollIntoView( newNode );
        editor.selection.placeCaret( newNode, {at:'start'});
    }
}

module.exports = addCaption;
