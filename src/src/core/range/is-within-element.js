/**
 * Verifies if a given `Range` is within or exactly at
 * the boundaries of an `Element`.
 *
 * @param {Range} range - Range Object
 * @param {Element} el - DOM Element node
 */
function isWithinElement( range, el ){
    /*
     * Don't even continue if the node is physically not part of the document anymore
     */
    if(!el.parentNode || !window.getSelection().getRangeAt(0).startContainer.parentNode){
        return false;
    }
    var elRange = document.createRange();
    elRange.selectNode(el);

    return range.compareBoundaryPoints( range.START_TO_START, elRange) >= 0 &&
        range.compareBoundaryPoints( range.END_TO_END, elRange ) <= 0;
};

module.exports = isWithinElement;
