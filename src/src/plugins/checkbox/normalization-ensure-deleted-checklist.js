var createCheckbox = require('./util-create-checkbox');

/**
 *  Ensures that an empty / invalid checklist gets transformed to a normal UL
 *  @param ensureDeletedChecklist {HTMLElement}
 */
function ensureDeletedChecklist(node) {
    let fC = node.firstElementChild;
    if(node && node.childElementCount === 1 && !fC.textContent.length && node.classList.contains('checklist')){
        let checklistItemContent    = fC.querySelector('.checklist__item__text');
        let chechklistItemBox       = fC.querySelector('.checklist__item__box');

        if(!checklistItemContent){
            let content = document.createElement('div');
            content.classList.add('checklist__item__text');
            while(fC.firstElementChild){
                content.appendChild(fC.firstElementChild);
            }
            fC.appendChild(content);
        }
        if(!chechklistItemBox){
            fC.insertBefore(createCheckbox(), fC.firstElementChild);
        }
    }
}

module.exports = ensureDeletedChecklist;
