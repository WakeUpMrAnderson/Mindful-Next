/**
 * `Behavior#createCheckbox()`
 *
 * @param {Event} ev
 * @param {Element} currentElement
 * @param {Object} editor
 * @public
 */
function createCheckbox(ev, currentElement, editor) {
    var li = currentElement.closest('li');

    if(li.textContent.length){
        ev.preventDefault();

        var contentAfter = document.createElement('span');
        contentAfter.innerHTML = editor.selection.extractContentAfterCaret(currentElement);
        if(currentElement.textContent.length === 0){
            currentElement.innerHTML = '<br>';
        }
        contentAfter = contentAfter.textContent.length ? contentAfter.innerHTML : '<br>';

        var newLi = document.createElement('li');
        newLi.className = li.className;
        newLi.classList.remove('checklist__item--checked');
        newLi.innerHTML = li.innerHTML;

        var textNode = newLi.querySelector('.checklist__item__text');
        textNode.innerHTML = contentAfter;

        editor.dom.insertAfter(newLi, li);

        return setTimeout(function(){
            // F12: a fast normalization within the 30ms window can detach
            // the new item — placing a caret into it would target a
            // detached node
            if (!textNode.isConnected) return;
            editor.selection.placeCaret(textNode, {at: 'start'});
        }, 30);
    }

    ev.preventDefault();

    var p = document.createElement('p');
    p.innerHTML = '<br>';

    var newUl = document.createElement('ul');
    var newLi = li.nextElementSibling;
    newUl.classList.add('checklist');

    while(newLi){
        newUl.appendChild(newLi);
        newLi = li.nextElementSibling;
    }
    editor.dom.insertAfter(newUl, li.closest('ul'));
    editor.dom.insertAfter(p, li.closest('ul'));
    editor.selection.placeCaret(p);
    li.parentNode.removeChild(li);
}

module.exports = createCheckbox;
