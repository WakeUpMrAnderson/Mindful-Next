var styles = require('./checkbox.scss');
var deleteCheckbox = require('./behavior-delete-checkbox');
var createCheckbox = require('./behavior-create-checkbox');
var handleCheckboxBackArrowKey = require('./behavior-back-arrow');
var handleCheckboxRightArrowKey = require('./behavior-next-arrow');
var normalizeCheckBoxDelete = require('./behavior-normalize-delete');

var removeCheckedItems = require('./command-remove-checked-items');
var formatChecklist = require('./command-format-checklist');
var toggleCheckbox = require('./command-toggle-checkbox');

var ensureCheckbox = require('./normalization-ensure-checkbox');
var ensureDeletedChecklist = require('./normalization-ensure-deleted-checklist');

function Checkbox( options) {
    this.options = options;
}

Checkbox.prototype.init = function(editor){
    editor.behaviors.register('deleteCheckbox', deleteCheckbox);
    editor.behaviors.register('createCheckbox', createCheckbox);
    editor.behaviors.register('handleCheckboxRightArrowKey', handleCheckboxRightArrowKey);
    editor.behaviors.register('handleCheckboxBackArrowKey', handleCheckboxBackArrowKey);
    editor.behaviors.register('normalizeCheckBoxDelete', normalizeCheckBoxDelete);

    editor.commands.register('formatChecklist', formatChecklist);
    editor.commands.register('removeCheckedItems', removeCheckedItems);
    editor.commands.register('toggleCheckbox', toggleCheckbox);

    editor.registerNormalization('addedNodes', 'ensureCheckbox', ensureCheckbox);
    editor.registerNormalization('modifiedNodes', 'ensureDeletedChecklist', ensureDeletedChecklist);

    editor.on('click', (ev)=>{
        let checkbox = ev.target.classList.contains('checklist__item__box');
        if (checkbox){
            ev.preventDefault();
            editor.commands.execute('toggleCheckbox', checkbox);
        }
    });
    editor.on('contextChange', (el)=>{
        if(el && el.tagName === "LI" && el.classList.contains('checklist__item')){
            let focusEl = el.querySelector('.checklist__item__text');
            if(focusEl){
                editor.selection.placeCaret(focusEl, {at: 'start'});
                editor.updateContext(focusEl);
            }
        }
    });
};

module.exports = Checkbox;
