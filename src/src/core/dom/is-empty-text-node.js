'use strict';
/**
 * Returns `Boolean` indicating whether the node is an
 * empty text node.
 *
 * @param {Node} node - DOM node to check
 */
function isEmptyTextNode( node ){
    return node && node.nodeType === Node.TEXT_NODE && node.data === '';
}
module.exports = isEmptyTextNode;
