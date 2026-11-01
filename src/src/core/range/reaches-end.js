var findWithin = require('find-within');
var normalizeRange = require('../range/normalize');
/*
* Returns `Boolean` indicating whether the the current selection `Range` reaches the
* end of a given node.
* @method reachesEnd
* @param  {Node} el - DOM Node
*/
function reachesEnd( el ){
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

        var lc = el.lastChild;
        if ( lc && lc.nodeType === 1 && lc.tagName === "BR" ){
            lc = lc.previousSibling;
            if ( lc ) elRange.setEnd(lc, lc.length);
        }
        return range.compareBoundaryPoints( range.END_TO_END, elRange) >= 0;
    }
    return false;
};

module.exports = reachesEnd;
