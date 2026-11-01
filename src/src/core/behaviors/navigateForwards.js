var defer = require('lodash/defer');
var scrollIntoView = require('../window/scroll-into-view');

/**
 * `Behavior#navigateForwards()`
 *
 * @param {Event} ev
 * @param {Element} currentElement
 * @param {Object} editor
 * @public
 */

function navigateForwards( ev, currentElement, editor ){
    var next = editor.dom.getNextCursorTarget( currentElement );
    ev.preventDefault();

    if ( !next ){ return false; }

    editor.updateContext( next );

    // set cursor position if it's not another media component
    if ( !editor.dom.hidesCursor( next ) ){
        editor.selection.update();
        editor.selection.placeCaret( next, {at:'start'});
        defer(function(){
            scrollIntoView( next );
        });
    }
}

module.exports = navigateForwards;
