'use strict';

/**
 * `Element#scrollIntoView` adaptation.
 *
 *  Scrolls a given `Element` into the viewport as soon as its
 *  not visible anymore.
 *
 * @param {Elememt} el
 * @public
 */

function scrollIntoView(el) {
    var rect = el.getBoundingClientRect();
    var x = window.pageXOffset, y = window.pageYOffset;
    // we want a higher threeshold for mobile devices since the software
    // keyboard can often not be well predicted
    var threeshold = "ontouchstart" in document.documentElement ?
    window.innerHeight - (window.innerHeight * 0.4) : window.innerHeight;

    var absoluteY = rect.top + y;

    // element is out of bottom view
    if ((rect.top + rect.height / 2) >= ( threeshold )) {
        var adjustedY = absoluteY - window.innerHeight + (window.innerHeight * 0.45) + rect.height;
        return window.scrollTo(x, adjustedY);
    }
    if ((rect.top - rect.height / 2) <= 0) {
        var adjustedY = absoluteY - rect.height / 2;
        return window.scrollTo(x, adjustedY);
    }
};

module.exports = scrollIntoView;
