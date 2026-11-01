
var RangeIterator               = require('./iterator');
var normalizeRange              = require('./normalize');
var wrapRange                   = require('./wrap');
var rangeSaveRestore            = require('./save-restore');
var unwrapNode                  = require('./unwrap-node');
var insertNode                  = require('./insert-node');
var isEmptyNode                 = require('./../dom/is-empty-node');
var isEmptyElementNode          = require('./../dom/is-empty-element-node');
var findWithin                  = require('find-within');
var deleteUpperMostEmptyNode    = require('./../dom/delete-upper-most-empty-node');

var blockElements       = require('block-elements');
var blockSel = ['li'].concat(blockElements).join(', ');

import debug from 'debug';
const log = debug('unwrapRange');

/**
 * Unwraps a given `Node` from a given nodeName (strong, em, q, etc.)
 * Returns the new unwrapped range in a normalized, text-selection
 * boundary form.
 *
 * based on @TooTallNate unwrap module
 *
 * @param {Range} range - Range object
 * @param {String} nodeName - NodeName to unwrap (strong, em)
 */

function unwrapRange( range, nodeName ){
    var workingRange = range.cloneRange();
    var originalRange = normalizeRange(range.cloneRange());
    var normalizedRange = normalizeRange( range.cloneRange() );
    var iterator = RangeIterator(range, function (node) {
      return node.childNodes.length === 0;
    });

    var next, prevBlock;
    var ranges = [];

    function doRange( workingRange ){
        var ancestor = workingRange.commonAncestorContainer.nodeType === 1 ?
            workingRange.commonAncestorContainer : workingRange.commonAncestorContainer.parentNode;

        var closest = ancestor.closest( nodeName );

        //if (workingRange.collapsed){
        //    return console.trace('Cannot unwrap collapsed range.');
        //}

        if ( closest ){
            // unwrap the common ancestor element, saving the Range state
            // and restoring it afterwards
            rangeSaveRestore.save();
            var outer = unwrapNode( closest );
            normalizedRange = rangeSaveRestore.restore();

            // at this point, we need to save down the Range state *again*.
            // This is somewhat a quick-fix, and more optimized logic could
            // probably be implemented
            rangeSaveRestore.save();

            // re-wrap left-hand side, if necessary
            var left = outer.cloneRange();
            left.setEnd(normalizedRange.startContainer, normalizedRange.startOffset);
            if ( left.toString().trim() ) {
                log('re-wrapping left-hand side with new %o node', nodeName);
                wrapRange( left, nodeName );
            }

            normalizedRange = rangeSaveRestore.restore();

            // re-wrap right-hand side, if necessary
            var right = outer.cloneRange();
            right.setStart(normalizedRange.endContainer, normalizedRange.endOffset);

            if (right.toString().trim() ) {
                log('re-wrapping right-hand side with new %o node', nodeName);
                wrapRange( right, nodeName );
            }

            normalizedRange = rangeSaveRestore.restore();

        } else {
            rangeSaveRestore.save();

            // since we only get a live object references that can change
            // in the meantime, we need to save the start and end nodes
            // here wo we can check for empty nodes later.
            var workingStart    = workingRange.startContainer.parentNode;
            var workingEnd      = workingRange.endContainer.parentNode;

            // Extract contents and unwrap each individual node.
            var fragment        = workingRange.extractContents();
            var nodes           = fragment.querySelectorAll( nodeName );

            for (var i = 0; i < nodes.length; i++) {
                unwrapNode( nodes[i] );
            }

            // Inserts a node while removing empty bogus nodes
            insertNode( workingRange, fragment );
            normalizedRange = rangeSaveRestore.restore();

            // delete all the empty nodes that are affecting the
            // start or endContainer of the node.
            deleteUpperMostEmptyNode( originalRange.startContainer );
            deleteUpperMostEmptyNode( originalRange.endContainer );

            if ( isEmptyElementNode( workingStart ) && workingStart.parentNode ){

                log('removing start-boundary empty element node %o', workingStart.parentNode);
                workingStart.parentNode.removeChild( workingStart );
            }
            if ( isEmptyElementNode( workingEnd ) && workingEnd.parentNode ){
                log('removing end-boundary empty element node %o', workingEnd );
                workingEnd.parentNode.removeChild( workingEnd );
            }

            // We want to make sure that the endOffset always points to a
            // text node. We recursively travel up the dom until we find
            // the nearest text node and set it to its relative endOffset.
            if ( normalizedRange.endOffset === 0 ){
                var node = normalizedRange.endContainer;
                while( node.nodeType !== Node.TEXT_NODE ){
                    var prevTextNode = findWithin( node.previousSibling, Node.TEXT_NODE );
                    node = prevTextNode && prevTextNode.nodeType === 3 ? prevTextNode : node.parentNode;
                }
                normalizedRange.setEnd( node, node.nodeValue.length );
            }
        }
    }

    // collect all block element ranges and treat them individually
    while ( next = iterator.nextNode() ) {
        var block = next.parentNode.closest( blockSel );
        if (prevBlock && prevBlock !== block) {
            workingRange.setEndAfter(prevBlock);
            ranges.push(normalizeRange(workingRange));

            // now we clone the original range again, since it has the
            // "end boundary" set up the way to need it still. But reset the
            // "start boundary" to point to the beginning of this new block
            workingRange = originalRange.cloneRange();
            workingRange.setStartBefore(block);
      }
        prevBlock = block;
    }
    ranges.push( normalizeRange( workingRange ) );
    for (var i = 0; i < ranges.length; i++) {
        doRange(ranges[i]);
    };

    return normalizedRange;
}

module.exports = unwrapRange;
