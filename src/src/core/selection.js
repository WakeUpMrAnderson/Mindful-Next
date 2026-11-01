var normalizeRange          = require('./range/normalize');

var containsNode            = require('./range/contains-node');
var createFromNode          = require('./range/create-from-node');
var extractContentAfterCaret = require('./range/extract-content-after-caret');
var rangeFullyContainsNode  = require('./range/fully-contains-node');
var insertNode              = require('./range/insert-node');
var isFirstCharacter        = require('./range/is-first-character');
var isLastCharacter         = require('./range/is-last-character');
var isWithinElement         = require('./range/is-within-element');

var placeCaret              = require('./range/place-caret');
var reachesEnd              = require('./range/reaches-end');
var reachesStart            = require('./range/reaches-start');
var saveRestoreSelection    = require('./range/save-restore');

var toggleSelectionColor    = require('./range/toggle-selection-color');
var unwrapNode              = require('./range/unwrap-node');

var wrapRange               = require('./range/wrap');
var unwrapRange             = require('./range/unwrap');

var Selection = function( editor ){
    this.editor = editor;
    this.update();
    this.editor.on('selectionchange', this.update.bind( this ));
};

Selection.prototype.containsNode = containsNode;
Selection.prototype.createFromNode = createFromNode;
Selection.prototype.extractContentAfterCaret = extractContentAfterCaret;
Selection.prototype.fullyContainsNode = rangeFullyContainsNode;
Selection.prototype.insertNode = insertNode;
Selection.prototype.isFirstCharacter = isFirstCharacter;
Selection.prototype.isLastCharacter = isLastCharacter;
Selection.prototype.isWithinElement = isWithinElement;
Selection.prototype.placeCaret = placeCaret;
Selection.prototype.reachesEnd = reachesEnd;
Selection.prototype.reachesStart = reachesStart;
Selection.prototype.toggleSelectionColor = toggleSelectionColor;
Selection.prototype.unwrapNode = unwrapNode;
Selection.prototype.wrap = wrapRange;
Selection.prototype.unwrap = unwrapRange;

Selection.prototype.update = function(){
    this.selection = document.getSelection();
    if ( this.selection.rangeCount ){
        this.range          = this.selection.rangeCount ? this.selection.getRangeAt(0) : false;
        this.normalizedRange = normalizeRange( this.range.cloneRange() );
        this.startElement   = this.normalizedRange.startContainer.nodeType === 1 ? this.normalizedRange.startContainer: this.normalizedRange.startContainer.parentNode;
        this.endElement     = this.normalizedRange.endContainer.nodeType === 1 ? this.normalizedRange.endContainer: this.normalizedRange.endContainer.parentNode;
    }
};

Selection.prototype.getType = function(){
    var adjustedRange = normalizeRange( this.range.cloneRange() );

    if ( !adjustedRange.endContainer ) return false;
    if ( adjustedRange.collapsed ) return 'cursor';
    if ( adjustedRange.commonAncestorContainer === this.editor.el ) return 'overlap';

    var fullyContainsNode = this.fullyContainsNode( this.range, this.editor.context.ancestorElement );

    if ( fullyContainsNode ){
        return 'full';
    } else {
        return 'partial'
    };
};

Selection.prototype.toggleTag = function( tagName ){
    if ( this.endElement.closest( tagName ) || this.startElement.closest( tagName ) ) {
        return this.unwrap( tagName );
    }
    this.wrap( tagName );
};

Selection.prototype.unwrap = function( tagName ){
    if ( this.range ){
        var range = unwrapRange( this.range, tagName );
        this.setSingleRange( range );
    }
};

Selection.prototype.wrap = function( tagName, attributes ){
    if ( this.range ){
        var range = wrapRange( this.range, tagName, attributes);
        this.setSingleRange( range );
    }
};

/**
* Ensures that no whitespace before or after the element is selected (Chrome)
*/
Selection.prototype.fix = function(){
    var fixedRange = this.range.cloneRange();
    normalizeRange( fixedRange );
    this.setSingleRange( fixedRange );
};

Selection.prototype.insertNode = function( node, atEnd ){
    if ( !this.range ) this.update();
    insertNode( this.range, node, atEnd );
};

// adds markers to the documents
Selection.prototype.saveSelection = function(){
    return saveRestoreSelection.save();
};

// removes all markers from the document
Selection.prototype.removeMarkers = function(){
    saveRestoreSelection.removeMarkers();
};

// removes all markers from the document
Selection.prototype.restoreSelection = function(){
    return saveRestoreSelection.restore();
};

Selection.prototype.setSingleRange = function( range ){
    this.selection.removeAllRanges();
    this.selection.addRange( range );
    this.update();
    if ( !this.editor.isActive() ){
        this.editor.el.focus();
    }
};

/**
* collapses the current selection
* @method collapse
* @param  { bool } collapse to start or end
*/
Selection.prototype.collapse =  function(start = true){
    this.range.collapse(start);
    this.setSingleRange(this.range);
};

/**
 * Gets the current element with which the user is
 * interacting in any way.
 *
 * @method getCurrentElement
 */
Selection.prototype.getCurrentElement = function(){
    var sel = window.getSelection();
    if ( sel.rangeCount ){
        var range = sel.getRangeAt(0);
        var cursorTrappedElement = this.getAdjacentVoidElement();

        if ( cursorTrappedElement instanceof HTMLElement ){
            return cursorTrappedElement;
        }

        var normalizedRange = normalizeRange( range );
        var node = normalizedRange.startContainer;
        return (node.nodeType == 3 ? node.parentNode : node);
    }
    return false;
};

/**
* Selects a node
* @param  { el } an element node
*/
Selection.prototype.selectNode =  function( el ){
    var elRange = document.createRange();
    this.editor.dom.hidesCursor( el ) ? elRange.selectNode( el ) : elRange.selectNodeContents( el );
    this.setSingleRange( elRange );
    this.editor.focus();
};

/**
 * Checks whether the cursor is immediately
 * before or after an IMG element and returns
 * the IMG.
 *
 * @method getAdjacentVoidElement
 */
Selection.prototype.getAdjacentVoidElement = function(){
    var sel = window.getSelection();
    if ( sel.rangeCount ){
        var range = sel.getRangeAt(0);
        var sc = range.startContainer;
        if(!sc){
            return false;
        }
        var ec = range.endContainer;

        // TODO: Why aren't we using range.collapsed here?
        if ( ec !== sc || !sc.lastChild) return;

        if ( sc === this.editor.el ){
            sc = sc.children[ range.startOffset ];
            ec = ec.children[ range.endOffset-1 ];
        }

        // An article-level collapsed range (empty line, selection fixing)
        // can place the offsets outside the child list or on a text node —
        // neither can host a void element, so skip instead of throwing.
        while (ec && sc && sc.lastChild &&
            sc.lastChild.nodeType === Node.ELEMENT_NODE){
            sc = sc.lastChild;
        }
        while (ec && ec.lastChild &&
            ec.lastChild.nodeType === Node.ELEMENT_NODE){
            ec = ec.lastChild;
        }
        if ( sc instanceof HTMLElement && this.editor.dom.hidesCursor( sc ) ) return sc;
        if ( ec instanceof HTMLElement && this.editor.dom.hidesCursor( ec ) ) return ec;
        return false;
    }
};

module.exports = Selection;
