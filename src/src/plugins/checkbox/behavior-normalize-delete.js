/**
 * `Behavior#normalizeCheckBoxDelete()`
 *
 * @param {Event} ev
 * @param {Element} currentElement
 * @param {Object} editor
 * @public
 */
function normalizeCheckBoxDelete(ev, currentElement, editor) {
    let next = currentElement.closest('li').nextElementSibling;
    if ((editor.selection.isLastCharacter(currentElement) || !currentElement.textContent.length) && next) {
        ev.preventDefault();
        let content = next.querySelector('.checklist__item__text');
        while(content.firstChild){
            currentElement.appendChild(content.firstChild);
        }
        let br = currentElement.querySelector('br');
        if(currentElement.textContent.length && br){
           br.parentNode.removeChild(br);
        }
        next.parentNode.removeChild(next);
    }
}

module.exports = normalizeCheckBoxDelete;
