/**
 * Returns a `#document-fragment` containing all the children of
 * a given node by "moving" all the childNodes of `sourceNode` to
 * `frag`.
 *
 * @param {Node} node - DOM node to check
 */
function nodeToFragment( node ){
    var frag = document.createDocumentFragment();
    while(node.firstChild){
        frag.appendChild( node.firstChild );
    }
    return frag;
}

module.exports = nodeToFragment;
