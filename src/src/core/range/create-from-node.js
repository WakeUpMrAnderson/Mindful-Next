'use strict';

/**
 * Creates a `Range` from an `Element Node` and returns it
 *
 * @param {Node} el - DOM Element node
 */
var createRangeFromNode = function( node ) {
    var range = document.createRange();
    try {
        range.selectNode(node);
    } catch (e) {
        range.selectNodeContents(node);
    }
    return range;
};

module.exports = createRangeFromNode;
