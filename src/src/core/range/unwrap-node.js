'use strict';
/**
 * Returns a `Range` Object whith has it's boundaries set to the
 * `node` s text content
 *
 * @param {Node} node - DOM node to check
 */

function unwrapNode( node ){
    var range = document.createRange();
    range.setStartBefore(node);
    range.setEndAfter(node);

    var start, end;

    while( node.firstChild ){
        if ( !start ) start = node.firstChild;
        end = node.firstChild;
        node.parentNode.insertBefore(node.firstChild, node);
    }

    node.parentNode.removeChild( node );

    if ( start ) range.selectNodeContents( start );
    if ( end ) {
        var endRange = document.createRange();
        endRange.selectNodeContents( end );
        range.setEnd( endRange.endContainer, endRange.endOffset );
    }
    return range;
}

module.exports = unwrapNode;
