'use strict';

var RangeIterator = require('./iterator');
var normalizeRange = require('./normalize');
var insertNode = require('./insert-node');
var unwrapNode = require('./unwrap-node');
var isEmptyNode = require('./../dom/is-empty-node');
var isEmptyElementNode = require('./../dom/is-empty-element-node');
var findWithin = require('find-within');
var deleteUpperMostEmptyNode = require('./../dom/delete-upper-most-empty-node');

var blockElements = require('block-elements');
var blockSel = ['li'].concat(blockElements).join(', ');

import debug from 'debug';
const log = debug('Range:wrapRange')

/**
 * Wraps a given `Range` with a given nodeName (strong, em, q, etc.)
 * Returns the newly wrapped range with its start and end boundaries
 * set to textNodes.
 *
 * Based on https://github.com/webmodules/wrap-range
 *
 * @param {Range} range - Range object
 * @param {String} nodeName - NodeName to wrap (strong, em)
 */

function wrapRange(range, nodeName, nodeAttributes) {
    var workingRange = range.cloneRange();
    var originalRange = normalizeRange(range.cloneRange());
    var iterator = RangeIterator(range, function (node) {
        return node.childNodes.length === 0;
    });

    var next, prevBlock, first = true;
    var ranges = [];

    function doRange(workingRange) {
        if (workingRange.collapsed){
            return log('Cannot wrap collapsed range.');
        }

        var node = document.createElement(nodeName);
        for (var attr in nodeAttributes) {
            node.setAttribute(attr, nodeAttributes[attr]);
        }
        // since we only get a live object references that can change
        // in the meantime, we need to save the start and end nodes
        // here wo we can check for empty nodes later.
        var workingStart = workingRange.startContainer.parentNode;
        var workingEnd = workingRange.endContainer.parentNode;

        log('Wrapping Range %o with new %o node', workingRange.toString(), node);
        node.appendChild(workingRange.extractContents());

        insertNode(workingRange, node);

        var duplicateNodes = node.querySelectorAll(nodeName);
        for (var i = 0; i < duplicateNodes.length; i++) {
            log('Removing duplicate childNode %o', duplicateNodes[i]);
            unwrapNode(duplicateNodes[i]);
        }

        if (first) {
            // the first Range that we process, we must re-set the
            // "start boundary" on the passed in Range instance
            originalRange.setStartBefore(node);
            first = false;
        }

        originalRange.setEndAfter(node);
    }

    // collect all block element ranges and treat them individually
    while (next = iterator.nextNode()) {
        var block = next.parentNode.closest(blockSel);
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

    ranges.push(normalizeRange(workingRange));
    for (var i = 0; i < ranges.length; i++) {
        doRange(ranges[i]);
    }
    return normalizeRange(originalRange);
}

module.exports = wrapRange;
