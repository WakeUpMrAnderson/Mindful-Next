/**
 * `Behavior#deleteCheckbox()`
 *
 * @param {Event} ev
 * @param {Element} currentElement
 * @param {Object} editor
 * @public
 */
function deleteCheckbox(ev, currentElement, editor) {
    if(currentElement.textContent.length === 0 || editor.selection.isFirstCharacter(currentElement)){
        ev.preventDefault();

        var ul = currentElement.closest('ul');
        var li = currentElement.closest('li');
        var prev = li.previousElementSibling;
        var prevText = prev && prev.querySelector('.checklist__item__text');

        var contentAfter = editor.selection.extractContentAfterCaret(currentElement);
        contentAfter = contentAfter.length ? contentAfter : '';

        if(li.matches(':first-child')){
            ul.removeChild(li);

            var p = document.createElement('p');
            p.innerHTML = contentAfter;

            editor.dom.insertBefore(p, ul);
            editor.selection.placeCaret(p, {at:'start'});

            if(ul.childElementCount === 0){
                ul.parentNode.removeChild(ul);
            }

            return editor.updateContext(p);
        }

        // append text to last element
        if(prevText){
            if(prevText.innerHTML === '<br>'){
                prev.removeChild(prev.firstElementChild);
            }
            editor.selection.placeCaret(prevText, {at:'end'});
            // we can't use innerHTML because we want to keep cursor position…
            let text = document.createElement('div');
            text.innerHTML = contentAfter.replace('<br>', '');
            while(text.firstChild){
                prevText.appendChild(text.firstChild);
            }
            ul.removeChild(li);
            return editor.updateContext(prevText);
        }
    }
}

module.exports = deleteCheckbox;
