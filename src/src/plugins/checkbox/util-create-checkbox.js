/*
 * Creates a checkbox that can be inserted
 */
let createCheckbox = function(){
    let chk = document.createElement('span');
    chk.className = 'checklist__item__box';
    chk.contentEditable = false;
    return chk;
}

module.exports = createCheckbox;
