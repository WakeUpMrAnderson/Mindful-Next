var createRangeFromNode = require('./create-from-node');
var findWithin = require('find-within');

/**
 * Verifies if a given `Range` fully selects an `Element Node` and
 * returns true / false.
 *
 * @param {Range} range - Range Object
 * @param {Node} el - DOM Element node
 */
function rangeFullyContainsNode( range, node ){

    /*
     * Don't even continue if the node is physically not part of the document anymore
     */
    if(!node.parentNode){
        return false;
    }

    var nodeRange = createRangeFromNode( node );

    var firstTextNode = findWithin( node, Node.TEXT_NODE, true );
    var lastTextNode = findWithin( node, Node.TEXT_NODE, false );

    var lc = node.lastChild;

    do {
        if ( lc.tagName === 'BR'){
            lastTextNode = lc.previousSibling
        }
        lc = lc.tagName === 'BR' ? lc.previousSibling : lc.lastChild;
    } while ( lc && lc.nodeType === 1 )

    if ( firstTextNode && lastTextNode ) {
        nodeRange.setStart( firstTextNode, 0 );
        nodeRange.setEnd( lastTextNode, lastTextNode.length );
    } else {
        nodeRange.selectNodeContents( node );
    }

    return range.compareBoundaryPoints( Range.START_TO_START, nodeRange ) < 1 &&
        range.compareBoundaryPoints( Range.END_TO_END, nodeRange ) > -1;
}

module.exports = rangeFullyContainsNode;
