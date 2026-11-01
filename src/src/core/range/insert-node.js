var isEmptyTextNode = require('./../dom/is-empty-text-node');
var isEmptyElement = require('./../dom/is-empty-element-node');
var isIE11  = require('./../window/is-ie11');
var voidElements = [];
for ( var key in require('void-elements') ){
    voidElements.push( key );
}
import debug from 'debug';
const log = debug('Range:insertNode');
/**
 * Inserts a point at a given point in a `Range` Object
 *
 * @param {Range} range - a range object
 * @param {Node} node - DOM node to insert
 * @param {Boolean} atEnd - specifies where the node should be inserted (before/after)
 */

function insertNode( range, node, atEnd ){
    var isDocumentFragment = node.nodeType === 11; /* Node.DOCUMENT_FRAGMENT_NODE */
    var nodes = {
        start: isDocumentFragment ? node.firstChild : node,
        end: isDocumentFragment ? node.lastChild : node
    };

    if ( atEnd ){
        var range = range.cloneRange();
        range.collapse(false);
        range.insertNode(node);
    } else {
        range.insertNode( node );
        range.collapse(true);
    }
    // remove bogus nodes
    for( var position in nodes ){
        var node = position === 'start' ? nodes[position].previousSibling : nodes[position].nextSibling;
        if ( node && !isIE11() ){
            // TODO: Rewrite!
            if ((isEmptyElement( node ) && ['BR', 'IMG', 'HR', 'IFRAME', 'TEXTAREA', 'INPUT'].indexOf( node.tagName ) < 0 &&
                !node.classList.contains('selection-marker') && !node.classList.contains('checklist__item__box')) || isEmptyTextNode( node )){
                // to do: clean up!! this needs to integrate with element properties
                node.parentNode.removeChild( node );
            }
        }
    }
};

module.exports = insertNode;
