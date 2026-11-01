var defer = require('lodash/defer');
var scrollIntoView = require('../window/scroll-into-view');

/**
 * `Behavior#deleteMediaItem()`
 *
 * @param {Event} ev
 * @param {Element} currentElement
 * @param {Object} editor
 * @public
 */
function deleteMediaItem( ev, currentElement, editor ){
    ev.preventDefault();

    var p = document.createElement('p');
    p.innerHTML = '<br>';
    editor.dom.insertBefore( p, editor.context.ancestorElement );
    editor.selection.placeCaret( p, {at:'start'});
    editor.updateContext( p );

    // fine tune scroll position to cursor location
    defer(function(){
        scrollIntoView( p );
    });
    // If the component has a wrapper, delete it
    var wrapper = editor.dom.getAncestorElement( currentElement );
    if ( wrapper ) return editor.dom.removeElement( wrapper );

    currentElement.remove();

    return false;
}

module.exports = deleteMediaItem;
