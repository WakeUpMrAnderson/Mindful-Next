var extractContentsAfterCaret = require('./../range/extract-content-after-caret');
var placeCaret = require('../range/place-caret');
var scrollIntoView = require('../window/scroll-into-view');

/**
 * `Behavior#addParagraphAfterAncestor()`
 *
 * @param {Event} ev
 * @param {Element} currentElement
 * @param {Object} editor
 * @public
 */
function addParagraphAfterAncestor( ev, currentElement, editor ){
    if ( ev.shiftKey ) return;
    ev.preventDefault();
    var p = document.createElement('p');
    p.innerHTML = extractContentsAfterCaret( currentElement );
    p.innerHTML = p.innerHTML.length ? p.innerHTML : '<br>';
    this.editor.dom.insertAfter( p, editor.context.ancestorElement );
    placeCaret( p, {at:'start'});
    scrollIntoView( p );
    return false;
}

module.exports = addParagraphAfterAncestor;
