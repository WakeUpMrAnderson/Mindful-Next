'use strict';
/**
 * Returns `Boolean` indicating whether the node is an
 * empty element node.
 *
 * @param {Node} node - DOM node to check
 */
function isEmptyElementNode( node ){
    return node && node.nodeType === Node.ELEMENT_NODE && !node.innerHTML.length;
}
module.exports = isEmptyElementNode;
