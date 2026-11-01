var createCheckbox = require('./util-create-checkbox');

/**
 *  Ensures that all specified elements in the CSS property set
 *  as needs are present, otherwise we unwrap the given node
 */
function ensureCheckbox(node){
    const CHK_BOX   = 'checklist__item__box';
    const CHK_TXT   = 'checklist__item__text';
    const CHK       = 'checklist__item';

    /*
     * Ensures the right checkbox for a given element
     */
    let fixCheckboxBrBug = function(el){
        let isCheckItem = el.classList.contains(CHK);
        let isCheckList = el.parentNode && el.parentNode.classList.contains('checklist');


        // clean wrong BR's
        if(el.firstChild && el.firstChild.tagName === 'BR'){
            el.firstChild.parentNode.removeChild(el.firstChild);
        }

        // ENSURE checkbox with contentEditabe `false`
        if(isCheckItem){
            // TRANSLATE checklist to li
            if(!isCheckList){
                el.classList.remove('checklist__item');
                return;
            }
            let chk = el.querySelector(`span.${CHK_BOX}`);
            return chk ? chk.setAttribute('contentEditable', false) : el.insertBefore(createCheckbox(), el.firstChild);
        }
        // TRANSLATE li to checklist__item
        if(isCheckList && !isCheckItem){
            el.classList.add(CHK);

            var content = document.createElement('div');
            content.className = CHK_TXT;
            while(el.firstChild){
                content.appendChild(el.firstChild);
            }
            el.appendChild(createCheckbox());
            return el.appendChild(content);
        }
    }

    if(node.classList.contains('checklist')){
        let children = [].slice.call(node.querySelectorAll('li')).forEach((el)=>{
            fixCheckboxBrBug(el);
        });
    }

    // Checklist to normal translation
    if(node.tagName === 'LI'){
        fixCheckboxBrBug(node);
    }


    return;
}

module.exports = ensureCheckbox;
