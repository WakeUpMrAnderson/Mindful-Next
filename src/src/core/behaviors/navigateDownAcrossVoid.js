var defer = require('lodash/defer');
var scrollIntoView = require('../window/scroll-into-view');

/**
 * True when no block text follows the caret — the caret is on the
 * block's last visual line. Geometry is deliberately not used here:
 * Chromium reports ZERO client rects for collapsed ranges anchored at
 * element boundaries.
 */
function atBlockEnd(range, block){
    var r = range.cloneRange();
    r.selectNodeContents(block);
    r.setStart(range.startContainer, range.startOffset);
    return r.toString().length === 0;
}

/**
 * `Behavior#navigateDownAcrossVoid()` — ArrowDown mirror of
 * navigateUpAcrossVoid: takes over only when the caret is on its
 * block's last line and the element below is a void one (hr).
 *
 * @param {Event} ev
 * @param {Element} currentElement
 * @param {Object} editor
 * @public
 */

function navigateDownAcrossVoid( ev, currentElement, editor ){
    if ( ev.keyCode !== 40 || !editor.selection.range.collapsed ) return;
    if ( !atBlockEnd( editor.selection.range, currentElement ) ) return;

    var next = currentElement.nextElementSibling;
    if ( !next || !editor.dom.isVoidElement( next ) ) return;

    ev.preventDefault();

    // nearest regular block below the void (skip stacked voids)
    var target = next.nextElementSibling;
    while ( target && editor.dom.isVoidElement( target ) ){
        target = target.nextElementSibling;
    }
    if ( !target ) return;

    editor.updateContext( target );
    if ( !editor.dom.hidesCursor( target ) ){
        editor.selection.placeCaret( target, {at: 'start'} );
        defer(function(){
            scrollIntoView( target );
        });
    }
}

module.exports = navigateDownAcrossVoid;
