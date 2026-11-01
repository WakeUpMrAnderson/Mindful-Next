/**
 * Checks whether an `Element Node` exists within a given `Range`
 *
 * @param {Node} el - DOM Element node to check
 * @param {Range} range - the range to look for
 */
function rangeContainsNode( el, range ){
    var elRange = document.createRange();
    elRange.selectNodeContents( el );
    return range.compareBoundaryPoints( range.END_TO_START, elRange) <= 0 &&
        range.compareBoundaryPoints( range.START_TO_END, elRange ) >= 0;
};

module.exports =  rangeContainsNode;
