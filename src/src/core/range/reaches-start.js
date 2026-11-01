'use strict';
var nodeContains = require('node-contains');
var normalizeRange = require('../range/normalize');

/*
* Returns `Boolean` indicating whether the current selection `Range` reaches
* the start of the element
* @method reachesStart
* @param  {Node} el - DOM node
*/
function reachesStart( el ){
    var sel = window.getSelection();

    /*
     * Don't even continue if the node is physically not part of the document anymore
     */
    if(!el.parentNode){
        return false;
    }

    if ( sel.rangeCount ){
        var range = sel.getRangeAt(0);
        var elRange = document.createRange();
        elRange.selectNodeContents( el );
        normalizeRange( elRange );
        return range.compareBoundaryPoints( range.START_TO_START, elRange) <= 0;
    }
    return false;
};

module.exports = reachesStart;
