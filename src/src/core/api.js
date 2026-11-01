import Document from './document';
import debug from 'debug';

/**
 * Public FrontKit API
 *
 * @param {string|HTMLElement|NodeList} selectorOrElement - Element that should be made editable
 * @param {Object} options - Editor options
 * @returns {Editor|Editor[]|boolean} - FrontKit Editor instance(s)
 */
export default function FrontKit(selectorOrElement, options) {

    FrontKit.createDocument();

    // Handle CSS selectors, NodeLists or HTMLElements
    let el;
    if (selectorOrElement.constructor === String) {
        let nodes = document.querySelectorAll(selectorOrElement);
        if(nodes.length === 0){
            console.warn("'%s' did not match any elements", selectorOrElement);
            return false;
        }
        return FrontKit(nodes, options);
    } else if (selectorOrElement instanceof NodeList) {
        if (selectorOrElement.length == 1) {
            el = selectorOrElement[0];
        } else {
            return [].map.call(selectorOrElement, function (element) {
                return FrontKit(element, options);
            });
        }
    } else {
        el = selectorOrElement;
    }
    return FrontKit.currentDocument.createEditor(el, options);
}

FrontKit.createDocument = function(){
    // Only create one Document instance per HTML document
    if(typeof FrontKit.currentDocument === 'undefined'){
        FrontKit.currentDocument = Document.create();
    }
    return FrontKit.currentDocument;
};

FrontKit.debug = debug;
window.FrontKit = FrontKit;
