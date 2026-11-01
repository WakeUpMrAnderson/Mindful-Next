/**
 * Disables Object Resizing across all browsers.
 */

var disableObjectResizing = function( el ){
    try {
        document.execCommand('enableObjectResizing', false, false);
    } catch ( ie ){
        // For IE
        el.addEventListener('mscontrolselect', function( ev ){
            ev.preventDefault();
        });
        el.addEventListener('mousedown', function(ev){
            if(ev.target.tagName === 'IMG'){ ev.preventDefault(); }
        });
    }
};

module.exports = disableObjectResizing;
