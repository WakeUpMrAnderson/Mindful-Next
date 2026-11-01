var reachesEnd = require('./reaches-end');

/*
* Returns true or false whether the cursor is at the very end of
* a given `Element`.
* @method isLastCharacter
* @param  {Element} el
*/
function isLastCharacter( el ){
    var sel = window.getSelection();;
    if ( sel.isCollapsed ){
        return reachesEnd( el );
    }
    return false;
};

module.exports = isLastCharacter;
