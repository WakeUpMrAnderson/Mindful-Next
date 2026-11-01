'use strict';

/**
 *  Event synthesizer for the tap event
 */

var Tap = (function () {
    var cachedX, cachedY;

    function verifyTap(callback, ev) {
        var cachedX, cachedY;
        // Save current pointer position for threshold measurement
        var pointer = ev.targetTouches ? ev.targetTouches[0] : ev;
        // Cache the current x & y
        cachedX = pointer.pageX;
        cachedY = pointer.pageY;
        // Detect if after 100ms the finger is still in the same position
        setTimeout(function () {
            // F12: the target can be gone by the time the tap fires
            if (!ev.target.isConnected) return;
            if ((cachedX === pointer.pageX) && (cachedY === pointer.pageY)) {
                callback(ev);
            }
        }, 100);
    }

    return {
        on: function (el, callback) {
            el.addEventListener('touchstart', verifyTap.bind(this, callback));
        }
    }
})();

module.exports = Tap;
