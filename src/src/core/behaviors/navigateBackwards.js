var defer = require('lodash/defer');
var scrollIntoView = require('../window/scroll-into-view');

function navigateBackwards( ev, currentElement, editor ){
    var prev = editor.dom.getPrevCursorTarget( currentElement );
    ev.preventDefault();

    if ( !prev){ return false; }

    editor.updateContext( prev );

    // set cursor position if it's not another media component
    if ( !editor.dom.hidesCursor( prev ) ){
        editor.selection.update();
        editor.selection.placeCaret( prev, {at:'end'});
        defer(function(){
            scrollIntoView( prev );
        });
    }
}

module.exports = navigateBackwards;
