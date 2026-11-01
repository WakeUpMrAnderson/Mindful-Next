import shortcuts from '../../core/shortcuts/shortcuts.js';

var removeCheckedItems = {
    shortcut(ev){
        return shortcuts.matches('removeCheckedItems', ev);
    },
    execute: function () {
        /*
         * We don't even bother if it's not a checklist
         */
        if(!this.context.ancestorElement.classList.contains('checklist')){
            return;
        }

        let li = this.context.closestElementWithRules.closest('li');
        /*
         * finds the first target which is eligible for the cursor
         * after collapsing the elements.
         */
        let findTarget = function(target, next = true){
            while(next ? target.nextElementSibling : target.previousElementSibling){
                target = next ? target.nextElementSibling : target.previousElementSibling;
                if(!target.classList.contains('checklist__item--checked')){
                    return target;
                }
            }
            if(next) return findTarget(target, false);
            return false;
        }

        /*
         * When the range is collapsed, remove all checked elements and
         * find next suitable cursor target
         */
        if(this.selection.range.collapsed){
            if(!li.classList.contains('checklist__item--checked')){
                this.commands.execute('toggleCheckbox', li.querySelector('.checklist__item__box'));
            }
            let target = findTarget(li);
            if(target){
                let textField = target.querySelector('.checklist__item__text');
                this.selection.placeCaret(textField, {at: 'start'});
                this.updateContext(textField);
            }
        }

        let children = [].slice.call(this.context.ancestorElement.querySelectorAll('.checklist__item--checked'));
        children.forEach((el)=>{
            let rect = el.getBoundingClientRect();
            // provide initial height
            el.style.height = rect.height + 'px';
            // flush dom
            window.getComputedStyle(el).opacity;
            // run animation
            el.classList.add('checklist__item--hide');

            setTimeout(()=>{
                if(el.parentNode){
                    el.parentNode.removeChild(el);
                    if(el === children[children.length-1]){
                        this.emit('commandExecuted', {type: 'blur'});
                    }
                }
            } , 1000);
        });

        if(!this.context.ancestorElement.querySelector('li:not(.checklist__item--hide)')){
            var p = document.createElement('p');
            p.innerHTML = '<br>';
            this.dom.replaceElement(this.context.ancestorElement, p);
            this.emit('inlineMenuHide');
            this.updateContext(p);
        }

        return true;
    },
    queryState: function () {
        return false;
    }
}

module.exports = removeCheckedItems;
