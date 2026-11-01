'use strict';

import unwrap from './unwrap';
import debug from 'debug';
const log = debug('DOM:applyDocumentRules')


function removeIllegalAttributes( node, whiteList ){
    if(node.getAttribute('contentEditable')){
        return; // TODO: temporary fix
    }
    var attrList = Array.prototype.slice.call( node.attributes );
    whiteList.push('alt', 'disabled', 'href', 'src', 'title');

    for (var i = 0; i < attrList.length; i++) {
        var attr = attrList[i].name.toLowerCase();
        var isEditorClass = attr === 'class' && /fk\-/.test(node.className);
        if ( whiteList.indexOf( attr ) === -1 && !isEditorClass ){
            log("Removing forbidden %o attribute", attr);
            node.removeAttribute( attr );
        }
    }
}

/**
 * Normalizes a node according to the cascading property set
 * definition.
 *
 * @param {Element} el
 * @return {Properties} a cascading property set instance
 */
export default function applyDocumentRules(elementWithRules, properties) {
    let props = properties.forElement(elementWithRules);
    let allowedTags = props.property('allowedTags');
    let whiteListAttr = props.property('allowedAttributes');

    removeIllegalAttributes( elementWithRules, whiteListAttr );

    return [].forEach.call(elementWithRules.children, function(node){
        // TODO: pass the selection-marker exclusion as a parameter!
        if(node.tagName !== 'BR' && !/selection\-marker/.test(node.className)){
            if (!allowedTags.length || !node.matches(allowedTags.join(','))) {
                if(!node.getAttribute('contentEditable')){
                    log("Unwrapping forbidden %o tag", node);
                    node = unwrap(node);
                }

            }
            applyDocumentRules( node, properties );
        }
    });
}
