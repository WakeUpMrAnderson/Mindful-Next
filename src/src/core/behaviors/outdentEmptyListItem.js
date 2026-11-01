/**
 * `Behavior#outdentEmptyListItem()`
 *
 * @param {Event} ev
 * @param {HTMLElement} currentElement
 * @param {Editor} editor
 * @public
 */
 function outdentEmptyListItem( ev, currentElement, editor ){
    let el = currentElement.closest('li');
    var lvl = el.className.match(/l[0-9]/g) === null ? 0 : el.className.match(/l[0-9]/g).length;
    if(lvl > 0 && !el.textContent.length){
        ev.preventDefault();
        el.classList.remove(`l${lvl-1}`);
        return false;
    }
}

module.exports = outdentEmptyListItem;
