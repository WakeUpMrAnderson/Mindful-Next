'use strict';

/**
 * Returns `True` if it's IE11 Browser.
 *
 * @return {Boolean}
 */
function isIE11(){
    return Object.hasOwnProperty.call(window, 'ActiveXObject') && !window.ActiveXObject;
}

module.exports = isIE11;
