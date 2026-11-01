/**
 * `Behavior#indent()`
 *
 * @param {Event} ev
 * @param {HTMLElement} currentElement
 * @param {Editor} editor
 * @public
 */
 function indent( ev, currentElement, editor ){
    ev.preventDefault()
    setTimeout(()=>{
        // F12: a fast delete within the 50ms window can detach the node —
        // acting on it would silently no-op or throw
        if (!currentElement.isConnected) return;
        let el = currentElement.closest('li');
        var lvl = el.className.match(/l[0-9]/g) === null ? 0 : el.className.match(/l[0-9]/g).length;

        if(ev.shiftKey){
            return el.classList.remove(`l${lvl-1}`);
        }

        if(lvl <= 1 && (el.previousElementSibling && (lvl === 0 || el.previousElementSibling.classList.contains('l0')))) {
            el.classList.add(`l${lvl}`);
        }
    }, 50);
}

module.exports = indent;
