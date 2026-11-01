var reachesStart = require('./reaches-start');

/**
 * Returns `Boolean` indicating if the cursor is
 * at the start of a given `Element Node`
 *
 * @param {Node} el - DOM Element node
 */
function isFirstCharacter( el ) {
    var sel = window.getSelection();
    if ( sel.isCollapsed ){
        return reachesStart( el );
    }
    return false;
};

module.exports = isFirstCharacter;
