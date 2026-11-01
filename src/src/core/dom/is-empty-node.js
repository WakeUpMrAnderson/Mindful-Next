'use strict';
var isEmptyTextNode = require('./is-empty-text-node');
var isEmptyElementNode = require('./is-empty-element-node');
/**
 * Returns `Boolean` indicating whether the node is empty or not.
 *
 * @param {Node} node - DOM node to check
 */
function isEmptyNode( node ){
    return isEmptyTextNode( node ) || isEmptyElementNode( node );
}
module.exports = isEmptyNode;
