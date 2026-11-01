'use strict';
/**
 * Unwraps a given `Element` node.
 *
 * @param {Element} el
 * @return {Element}
 */

function unwrap( el ) {
    var parentNode = el.parentNode;
    if ( parentNode ){
        var frag = document.createDocumentFragment();
        while (el.firstChild) {
            frag.appendChild(el.firstChild);
        }
        parentNode.replaceChild( frag, el );
        return parentNode;
    }

}

module.exports = unwrap;
