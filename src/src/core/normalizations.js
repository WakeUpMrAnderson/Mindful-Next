import mapValues from 'lodash/mapValues';
import FunctionSet from './function-set';
import {getClosestElementWithRules} from './dom';
import {getAncestorElement} from './dom';

import applyDocumentRules from './dom/applyDocumentRules';
import debug from 'debug';

const SELECTION_MARKER = '<span class="selection-marker"></span>';

/**
 *  Ensure that there is always at least one editable element
 *  @param rootElement {HTMLElement}
 */
 export function ensureLastEditableElement(rootElement, placeholderHTML) {
    return function ensureLastEditableElement(node) {
        if (node === rootElement) {
            var content = rootElement.innerHTML.replace(/<br\s*\/?>/ig, '').trim();
            if (content !== '') {
                return;
            }
            // TODO: retrieve markup from static method in selection save/restore module
            rootElement.innerHTML = placeholderHTML;
        }
    }
}

/**
 * Creates a tag replacement function
 * @param replacements {Object} - A map with the tags to replace
 * @returns {Function}
 */
 export function replaceTags(replacements = {}) {
    /**
     * Replaces the tags specified in the replacements map
     * @param {Node} node
     */
     return function replaceTags(node) {
        let newTag = replacements[node.nodeName.toLowerCase()];
        if (newTag) {
            let newEl = document.createElement(newTag);
            newEl.innerHTML = node.innerHTML;
            return newEl;
        }
    }
}

/**
 * Ensure that all empty root level DIV nodes are converted to paragraphs.
 * @param node {Node}
 * @returns {*}
 */
 export function ensureParagraphWrapper(node) {
    if (node.tagName === 'DIV'
        && !node.textContent.trim().length
        && !node.classList.length) {
        var p = document.createElement('p');
        p.innerHTML = `<br>`;
        return p;
    }
}

/**
 * Strip span elements that are created when the browser tries to combine
 * two elements with different styling
 * @param node {Node}
 * @returns {*}
 */
 export function stripSpans(node) {
    if (node.parentNode &&
        node.hasAttribute('style') &&
        node.tagName === 'SPAN') {
        return false;
    }
}

/**
 * Reindents lists from bottom up...
 */
export function reindentList(node){
    if(node.matches('ul,ol')){
        var next = node.nextElementSibling;
        var target = next && next.nextElementSibling && next.nextElementSibling.matches('ul,ol') ? next.nextElementSibling : node;

        [].slice.call(target.children).forEach((el)=>{
            var lvl = el.className.match(/l[0-9]/g) === null ? 0 : el.className.match(/l[0-9]/g).length;
            if(el.matches(':first-child')){
                return el.classList.remove('l0', 'l1');
            }
        });
    }
}

/**
 *  Removes unnecessary BR nodes at the END of an element
 */
 export function removeBogusBr( node ){
    var lc = node.lastChild;
    if (lc && lc.tagName === 'BR' && node.textContent.length){
        node.removeChild( lc );
    }
}


/**
 *  Ensure all root level text nodes are wrapped with a p
 */
 export function ensureWrappedTextNodes( rootEl ){
    return function ensureWrappedTextNodes(node){
        [].forEach.call(node.childNodes, ( n ) => {
            if(n.parentNode === rootEl &&
                n.nodeType === Node.TEXT_NODE &&
                n.nodeValue.trim() !== ''){
                var p = document.createElement('p');
            p.innerHTML = n.nodeValue;
            n.parentElement.replaceChild(p, n);
            return p;
        }
    })
    }
}

/**
 *  Replace illegal child elements accordings to cssPropertySet
 */
 export function applyCSSRuleSet(properties){

    return function applyCSSRuleSet( node ){
        applyDocumentRules(getAncestorElement(node), properties);
        var el = getClosestElementWithRules(properties, node);

        if ( el instanceof HTMLElement ){
            applyDocumentRules(el, properties);
        } else if ( node.parentNode ){
            var p = document.createElement('p');
            while (node.firstChild){
                p.appendChild( node.firstChild );
            }
            applyDocumentRules(p, properties);
            debug('Normalizations:applyCSSRuleSet')("Unwrapping unregistered %o tag and rewrap with a `P` node", node);
            node.parentNode.replaceChild(p, node);
            return p;
        }
    }
}



/**
 *  Ensures that all specified elements in the CSS property set
 *  as needs are present, otherwise we unwrap the given node
 */
export function ensureNeededChildren(properties){
    return function ensureNeededChildren(node){
        var neededChildren = properties.forElement(node).property('needsChildren' );
        if ( neededChildren && node.parentNode ){
            var isValid = neededChildren .every(function( selector ){
                return node.querySelectorAll( selector ).length;
            });
            if ( !isValid ){
                var p = document.createElement('p');
                p.innerHTML = node.textContent || '<br>';
                p.innerHTML += SELECTION_MARKER;
                node.parentNode.replaceChild( p, node );
            }
        }
    }
}
/**
 *  Ensures that all specified elements in the CSS property set
 *  as needs are present, otherwise we unwrap the given `Node
 */
export function ensureNeededParent( properties ){
    return function ensureNeededParent(node){
        var neededParents = properties.forElement(node).property('needsParents' );
        if ( neededParents && node.parentNode ){
            neededParents.forEach(function( wrapperName ){
                if (!node.closest( wrapperName )){
                    var wrapper = document.createElement( wrapperName );
                    node.parentNode.insertBefore( wrapper, node );
                    wrapper.appendChild( node );
                    debug.log('Normalizations:ensureNeededParent')('Wrapping %o node with cloned %o node', node, wrapper );
                    return;
                }
            }.bind( this ));
        }
    }
}


export function wrapIframes(node){
    if(node.tagName === 'IFRAME'){
        // already wrapped — the wrapper re-delivers the iframe as its own
        // addedNode on every processing pass, and re-wrapping would nest
        // divs forever once the observer queues instead of dropping
        if (node.parentNode && node.parentNode.classList &&
            node.parentNode.classList.contains('fk-iframe-wrapper')) {
            return;
        }
        let div = document.createElement('div');
        div.className = 'fk-iframe-wrapper';
        node.parentNode.insertBefore(div, node);
        div.appendChild(node);
        return;
    }
}

/**
 * Returns the default normalizations in the context of the editor
 * @param editor
 * @returns {{addedNodes: FunctionSet, removedNodes: FunctionSet, modifiedNodes: FunctionSet}}
 */
 export default function getDefaultNormalizations(editor) {
    let placeholderHTML = editor.config.inline ?
        `${SELECTION_MARKER}<br/>` : `<p>${SELECTION_MARKER}<br/></p>`

    let normalizations = {
        addedNodes:     FunctionSet.create(),
        removedNodes:   FunctionSet.create(),
        modifiedNodes:  FunctionSet.create(),
        loadDocument:   FunctionSet.create(),
        exportDocument: FunctionSet.create()
    };

    normalizations.addedNodes
        .add('wrapIframes', wrapIframes)
        .add('replaceTags', replaceTags({'i': 'em', 'b': 'strong'}))
        .add('stripSpans', stripSpans)
        .add('reindentList', reindentList)
        .add('removeBogusBr', removeBogusBr)
        .add('applyCSSRuleSet', applyCSSRuleSet(editor.properties));

    normalizations.modifiedNodes
        .add('ensureLastEditableElement', ensureLastEditableElement(editor.el, placeholderHTML))
        .add('ensureNeededChildren', ensureNeededChildren(editor.properties))
        .add('ensureNeededParent', ensureNeededParent(editor.properties));

    normalizations.loadDocument
        .add('wrapIframes', wrapIframes);

    if(!editor.config.inline){
        normalizations.addedNodes.add('ensureParagraphWrapper', ensureParagraphWrapper);
        normalizations.modifiedNodes.add('ensureWrappedTextNodes', ensureWrappedTextNodes(editor.el))
    } else {
        normalizations.modifiedNodes.add('applyCSSRuleSet', applyCSSRuleSet(editor.properties));
    }

    return normalizations;
}


/**
 * Returns a normalizer that uses html-pipe
 * @param {Function[]} functions
 * @returns {Function}
 */
 export function createNormalizer(functions, editor) {

    // Simplified, non-recursive version of https://github.com/Automattic/html-pipe
    return function runNormalizer(node){
        editor.selection.saveSelection();

        let ret;
        let next = node;

        for(let i = 0; i < functions.length; i++){
            let fn = functions[i];
            ret = fn(next);
            let parent = next.parentNode;

              // Ignore, remove, unwrap, or replace depending on what is returned.
            if (undefined === ret) {
                // Ignore and continue with the rest of the transforms
                continue;
            } else if (null === ret) {
                // Once we've removed the node, skip over the other transforms
                parent.removeChild(next);
                break;
            } else if (false === ret) {
                // Once we've unwrapped the node, skip over the other transforms
                ret = unwrap(next);
                parent.replaceChild(ret, next);
                break;
            } else if (next === ret) {
                // If the node hasn't changed, skip over the other transforms
                break;
            } else if ('string' == typeof ret || 'number' == typeof ret) {
                // Replace the node with a textnode, set the current node to the replacement and continue
                ret = document.createTextNode(ret);
                parent.replaceChild(ret, next);
                next = ret;
            } else if (1 == ret.nodeType && parent) { // TODO: check for parent existence
                // Replace the node with an element set the current node to the replacement and continue
                parent.replaceChild(ret, next);
                next = ret;
            } else if (11 == ret.nodeType) {
                // Replace the node with a document fragment. set the current node to the fragment's first child and continue.
                child = ret.firstChild;
                parent.replaceChild(ret, next);
                next = child;
            }
        }

        editor.selection.restoreSelection();

    }
}


export function getNormalizationCallbacks(normalizations, editor){
    return mapValues(normalizations, (n) => createNormalizer(n.functions, editor));
}


/**
 * Unwrap an element
 *
 * @param {Element} el
 * @return {DocumentFragment} frag
 */

function unwrap(el) {
  var frag = document.createDocumentFragment();
  while (el.childNodes.length) {
    frag.appendChild(el.firstChild);
  }
  return frag;
}
