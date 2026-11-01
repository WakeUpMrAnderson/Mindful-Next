"use strict";

var rangeContainsNode   = require('./contains-node');
var normalizeRange      = require('./normalize');

/**
 * Uses the NodeIterator module to iterate over all the nodes thare are partially or fully
 * contained within a given `Range`.
 * Returns a nodeIterator function configured to start iterating.
 *
 * Adapted from: https://github.com/webmodules/range-iterator/blob/master/index.js
 *
 * @param {Range} range - Range Object
 * @param {NodeFilter} whatToShow - a NodeFilter list (NodeFilter.SHOW_ELEMENT)
 * @param {Function} el - a filter function with the current node as its callback
 */
function RangeIterator( range, whatToShow, filter ) {
    if (!range) throw new TypeError('a Range instance must be given');
    // allow the `filter` to be the 2nd parameter
    if (typeof whatToShow === 'function') {
        filter = whatToShow;
        whatToShow = NodeFilter.SHOW_ALL;
    }

    var range = normalizeRange(range.cloneRange());
    var startContainer = range.startContainer;
    var endContainer = range.endContainer;
    var ancestor = range.commonAncestorContainer;
    var start =  ancestor.nodeType === 1 ? ancestor : ancestor.parentNode;

    var acceptNode = function acceptNode(node) {
        if ( !rangeContainsNode( node, range ) ) return NodeFilter.FILTER_REJECT;
        if ( !filter ) return NodeFilter.FILTER_ACCEPT;
        return filter( node );
    }

    return document.createNodeIterator( start, whatToShow, acceptNode, true );
}

module.exports = RangeIterator;
