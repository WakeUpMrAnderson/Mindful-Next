/*
* Returns the absolute position within the document of a range or element
* @method rect
* @param  { item } an element node OR range
*/
function rect( item ){
    var padding = { 'padding-left': 0, 'padding-top': 0 };
    var normalOverlow;
    if ( item instanceof HTMLElement ) {
        for (var key in padding) {
          padding[key] = parseInt(window.getComputedStyle(item , null)
              .getPropertyValue( key )
              .replace(/px/g, '')
              .split(/\s/));
        }
        normalOverlow = item.getBoundingClientRect();
        item.style.overflow = 'hidden'
    };

    var rect = item.getBoundingClientRect();

    if ( item instanceof HTMLElement ) {
        if ( rect.left !== normalOverlow.left ){
            padding['padding-left'] = 0;
        }

        item.style.removeProperty('overflow');
        if ( !item.style.length ){
            item.getAttribute("style");
            item.removeAttribute('style');
        }
    }

    return {
        top: rect.top + window.pageYOffset + padding['padding-top'],
        bottom: rect.bottom + window.pageYOffset,
        left: rect.left + window.pageXOffset + padding['padding-left'],
        right: rect.right + window.pageXOffset,
        height: rect.height,
        width: rect.width
    };
}

module.exports = rect;
