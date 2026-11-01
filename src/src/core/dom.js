var inlineElements  = require('inline-elements');
var blockElements   = require('block-elements');
var nodeToFragment  = require('./dom/node-to-fragment');
var map = require('lodash/map');

var voidElements = [];
for ( var key in require('void-elements') ){
    voidElements.push( key );
}

var Dom = function( editor ){
    this.root = editor.el;
    this.editor = editor;
};

// http://jsperf.com/document-vs-element-queryselectorall-performance
Dom.prototype.get = function( args ){
    var query = this.root.querySelectorAll( args );
    return [].map.call( query, function( node, i ){ return query[i]; });
};

Dom.prototype.removeElement = function ( el ){
    return el.parentNode.removeChild( el );
};

Dom.prototype.replaceElement = function( oldNode, newNode ){
    return oldNode.parentNode.replaceChild( newNode, oldNode );
};

Dom.prototype.changeTag = function( oldElement, newTag ){
    var newElement = document.createElement( newTag );
    newElement.attributes = oldElement.attributes;
    newElement.innerHTML = oldElement.innerHTML;
    this.replaceElement(oldElement, newElement);
    return newElement;
};

Dom.prototype.insertBefore = function( newNode, referenceNode ){
    return referenceNode.parentNode.insertBefore( newNode, referenceNode );
};

Dom.prototype.insertAfter = function( newNode, referenceNode ){
    if ( referenceNode.nextSibling ) {
        return referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }
    referenceNode.parentNode.appendChild( newNode );
};

Dom.prototype.getClosestElementWithRules = function (el){
    var selector = map(this.editor.properties.rules, 'selector').join(',');
    return el.closest(selector);
};

Dom.prototype.getAncestorElement = function(el, rootNode){
    if(el.parentNode && el.parentNode !== this.editor.el){
        return this.getAncestorElement(el.parentNode);
    }
    return el;
};

Dom.prototype.isInlineElement = function( el ){
    return el.matches( inlineElements.join(',') );
};

Dom.prototype.isBlockElement = function( el ){
    return el.matches( blockElements.join(',') );
};

Dom.prototype.isVoidElement = function( el ){
    return el.matches( voidElements.join(',') );
};

Dom.prototype.hidesCursor = function( el ){
    return this.editor.properties.forElement(el).property('hidesCursor');
};

Dom.prototype.getPrevCursorTarget = function( el ){
    var nodes = this.getNearestCursorTarget( el );
    return nodes.before[ nodes.before.length-1 ];
};

Dom.prototype.getNextCursorTarget = function( el ){
    var nodes = this.getNearestCursorTarget( el );
    return nodes.after[0];
};

Dom.prototype.getNearestCursorTarget = function( el ){
    // TODO: does this hold?
    if ( el.tagName === 'BR') return;

    var nodes = this.get('h1,h2,h3,h4,h5,h6,p,dt,dd,li,address,blockquote,div,fieldset,hr,th,td');
    var index = nodes.indexOf( el );

    var matchesSelector = function( el ){
        return this.editor.properties.forElement(el).property('isFocusable');
    }.bind(this);
    return {
        before: nodes.slice(0, index).filter(matchesSelector),
        after: nodes.slice(index + 1).filter(matchesSelector)
    };
};


export default Dom;

// TODO: extract into cascading props module
export function getClosestElementWithRules(properties, el){
    return el.closest(map(properties.rules, 'selector').join(','));
}

export function getAncestorElement(el){
    if(el.parentNode && !el.parentNode.hasAttribute('contenteditable')){
        return getAncestorElement(el.parentNode);
    }
    return el;
}
