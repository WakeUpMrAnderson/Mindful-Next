var defer = require('lodash/defer');
var scrollIntoView = require('../window/scroll-into-view');

/**
 * True when no block text precedes the caret — the caret is on the
 * block's first visual line. Geometry is deliberately not used here:
 * Chromium reports ZERO client rects for collapsed ranges anchored at
 * element boundaries.
 */
function atBlockStart(range, block){
    var r = range.cloneRange();
    r.selectNodeContents(block);
    r.setEnd(range.startContainer, range.startOffset);
    return r.toString().length === 0;
}

/**
 * `Behavior#navigateUpAcrossVoid()` — ArrowUp guard for block void
 * elements (hr): native Chromium vertical caret movement skips them
 * badly (the caret jumps to the article start instead of the previous
 * block). Takes over only when the caret is on its block's first line
 * and the element above is a void one; otherwise native line-walking
 * continues untouched.
 *
 * @param {Event} ev
 * @param {Element} currentElement
 * @param {Object} editor
 * @public
 */

function navigateUpAcrossVoid( ev, currentElement, editor ){
    if ( ev.keyCode !== 38 || !editor.selection.range.collapsed ) return;
    if ( !atBlockStart( editor.selection.range, currentElement ) ) return;

    var prev = currentElement.previousElementSibling;
    if ( !prev || !editor.dom.isVoidElement( prev ) ) return;

    ev.preventDefault();

    // nearest regular block above the void (skip stacked voids)
    var target = prev.previousElementSibling;
    while ( target && editor.dom.isVoidElement( target ) ){
        target = target.previousElementSibling;
    }
    if ( !target ) return;

    editor.updateContext( target );
    if ( !editor.dom.hidesCursor( target ) ){
        editor.selection.placeCaret( target, {at: 'end'} );
        defer(function(){
            scrollIntoView( target );
        });
    }
}

module.exports = navigateUpAcrossVoid;
