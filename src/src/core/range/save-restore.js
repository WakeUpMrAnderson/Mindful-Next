var insertNode = require('./insert-node');

/**
 * Uses selection-marker span elements that are placed in the DOM to save
 * and restore the selection when a `Range`s content has been affected in
 * the meantime.
 *
 * TODO: credit zeditor?
 */

var saveRestoreSelection = {
    /**
     * Saves the current selection by placing markers in the DOM.
     */
    save: function(){
        // TODO: clean up any selection markers that might already exist in the document
        var sel = document.getSelection();
        if ( sel.rangeCount ){
            var range = sel.getRangeAt( 0 );

            // TODO: extract into static method so that other modules can use it
            var startMarker = document.createElement('span');
            startMarker.classList.add('selection-marker', 'start-marker');
            var endMarker = document.createElement('span');
            endMarker.classList.add('selection-marker', 'end-marker');

            insertNode( range, endMarker, true );

            // We only want to insert the start marker if the selection isn't collapsed
            if ( !range.collapsed ){
                insertNode( range, startMarker );
            } else {
                range.collapse( true );
            }
        }
        return range;
    },
    /**
     * Restores the selection by querying for .selection-marker elements.
     * Returns and directly restores the given range.
     */
    restore: function(){
        var sel;
        var markers = document.querySelectorAll( '.selection-marker' );
        if (!markers.length ) {
            sel = window.getSelection();
            if ( sel.rangeCount ){
                return sel.getRangeAt( 0 );
            }
            return false;
        }

        var newRange = document.createRange();
        newRange.setStartBefore(markers[0]);

        if (markers.length === 2) {
          newRange.setEndAfter(markers[1]);
        } else {
          // We always reset the end marker because otherwise it will just
          // use the current range’s end marker.
          newRange.setEndAfter(markers[0]);
        }

        this.removeMarkers();
        var sel = document.getSelection();
        sel.removeAllRanges();
        sel.addRange( newRange );
        return newRange;
    },
    /**
     * Removes all the selection-marker `Nodes` from the DOM.
     */
    removeMarkers: function(){
        Array.prototype.forEach.call( document.querySelectorAll('.selection-marker'), function( el ){
            var parentNode = el.parentNode;
            parentNode.removeChild( el );
            // WE DO NOT NORMALIZE THE RANGE FOR INTERNET EXPLORER 11
            // since it will shift the range by 1 index, which will break
            // the whole logic.
            if (Object.hasOwnProperty.call(window, "ActiveXObject") && !window.ActiveXObject) return;
            parentNode.normalize();
        });
    }
};

module.exports = saveRestoreSelection;
