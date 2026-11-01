/**
 * Returns `True` if the editor runs on a phone-sized touch device.
 *
 * F10: the 2016 `typeof window.orientation !== 'undefined'` check was a
 * deprecated-era signal that misclassified touch laptops; modern pointer
 * capability + hover + screen width is the reliable combination.
 */
function isMobile(){
    if (!window.matchMedia) return false;
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    var noHover = window.matchMedia('(hover: none)').matches;
    var small = window.innerWidth <= 820;
    return !!(coarse && noHover && small);
}

module.exports = isMobile;
