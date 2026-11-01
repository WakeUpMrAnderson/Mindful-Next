'use strict';

var isEmptyNode = require('./is-empty-node');
/**
 * It traverses up the DOM until it finds the first element
 * that isn't wrapping empty nodes and deletes it.
 * returns false if no element was replaced otherwise
 * the last element.
 *
 * @param {Node} node - DOM node to check
 */
function deleteUpperMostEmptyNode( node ){
    var sc = node;
    while(isEmptyNode( sc )){
        var parent = sc.parentNode;
        sc.parentNode.removeChild( sc );
        sc = parent;
    }
    return sc === node ? false : sc;
}

module.exports = deleteUpperMostEmptyNode;
