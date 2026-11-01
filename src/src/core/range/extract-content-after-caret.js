/**
* Gets all the content after the current caret within
* a given `Element`.
*
* @method getContentAfterCaret
* @param  {Element} el
* @param  {Boolean} return range instead of string
* @param  {Range} range - an optional range to process
*/
function extractContentsAfterCaret ( el, getRange, range ){
    var sel = window.getSelection();
    if ( range || sel.rangeCount > 0 ) {
        var range = range || sel.getRangeAt(0);
        var elRange = document.createRange();
        elRange.selectNodeContents( el );
        elRange.setStart( range.endContainer, range.endOffset );

        var html = document.createElement('div');
        html.appendChild( elRange.extractContents() );

        // attach #document-fragment to div
        return getRange ? elRange : html.innerHTML;
    }
    return false;
};

module.exports = extractContentsAfterCaret;
