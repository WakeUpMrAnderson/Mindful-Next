module.exports = {
    insertOrderedList: {
        execute: function () {
            var ol = document.createElement('ol');
            var li = document.createElement('li');
            li.innerHTML = '<br>';
            ol.appendChild(li);
            this.dom.replaceElement(this.context.closestElementWithRules, ol);
            return li;
        }
    },
    insertUnorderedList: {
        execute: function () {
            var ul = document.createElement('ul');
            var li = document.createElement('li');
            li.innerHTML = '<br>';
            ul.appendChild(li);
            this.dom.replaceElement(this.context.closestElementWithRules, ul);
            return li;
        }
    },
    insertChecklist: {
        execute: function () {
            var ul = document.createElement('ul');
            ul.classList.add('checklist');

            var li = document.createRange().createContextualFragment(`<li class="checklist__item"><span contenteditable="false" class="checklist__item__box"></span><div class="checklist__item__text"><br></div></li>`);
            var textNode = li.querySelector('.checklist__item__text');
            ul.appendChild(li);

            this.dom.replaceElement(this.context.closestElementWithRules, ul);
            return textNode;
        }
    },
    insertHr: {
        execute: function () {
            var hr = document.createElement('hr');
            var p = document.createElement('p');
            p.innerHTML = '<br>';

            this.dom.replaceElement(this.context.closestElementWithRules, hr);
            this.dom.insertAfter(p, hr);

            return p;
        }
    },
    formatOrderedList: {
        execute: function () {
            var wrapper = document.createElement('ol');
            [].slice.call(this.context.ancestorElement.children).forEach((el)=>{
                var li = document.createElement('li');
                if(el.hasAttribute('class')){
                    li.classList.toggle('l0', el.classList.contains('l0'));
                    li.classList.toggle('l1', el.classList.contains('l1'));
                }
                let checklist = el.querySelector('.checklist__item__text');
                li.innerHTML = checklist ? checklist.innerHTML : el.innerHTML;
                wrapper.appendChild(li);
            });
            this.dom.replaceElement(this.context.ancestorElement, wrapper);
            return wrapper;
        },
        queryState: function () {
            let el = this.context.ancestorElement;
            return el.tagName === 'OL' && !el.classList.contains('checklist');
        }
    },
    formatUnorderedList: {
        execute: function () {
            var wrapper = document.createElement('ul');
            [].slice.call(this.context.ancestorElement.children).forEach((el)=>{
                var li = document.createElement('li');
                if(el.hasAttribute('class')){
                    li.classList.toggle('l0', el.classList.contains('l0'));
                    li.classList.toggle('l1', el.classList.contains('l1'));
                }
                let checklist = el.querySelector('.checklist__item__text');
                li.innerHTML = checklist ? checklist.innerHTML : el.innerHTML;
                wrapper.appendChild(li);
            });
            this.dom.replaceElement(this.context.ancestorElement, wrapper);
            return wrapper;
        },
        queryState: function () {
            let el = this.context.ancestorElement;
            return el.tagName === 'UL' && !el.classList.contains('checklist');
        }
    },
    'moveUp': {
        shortcut(ev){
            return (ev.altKey && (ev.metaKey || ev.ctrlKey) && ev.keyCode === 38);
        },
        execute: function () {
            let li = this.context.closestElementWithRules.closest('li');
            if(this.context.ancestorElement.matches('ul,ol,.checklist') && li.previousElementSibling){
                this.selection.saveSelection();
                if( !li.previousElementSibling.classList.contains('l0')){
                    li.classList.remove('l0');
                }
                if(!li.previousElementSibling.classList.contains('l1')){
                    li.classList.remove('l1');
                }
                this.dom.insertBefore(li, li.previousElementSibling);
                this.selection.restoreSelection();
            }
        },
        queryState: function () {}
    },
    'moveDown': {
        shortcut(ev){
            return (ev.altKey && (ev.metaKey || ev.ctrlKey) && ev.keyCode === 40);
        },
        execute: function () {
            let li = this.context.closestElementWithRules.closest('li');
            if(this.context.ancestorElement.matches('ul,ol,.checklist') && li.nextElementSibling){
                this.selection.saveSelection();
                this.dom.insertAfter(li, li.nextElementSibling);
                this.selection.restoreSelection();
            }
        },
        queryState: function () {}
    }
};
