import shortcuts from '../../core/shortcuts/shortcuts.js';

var toggleCheckbox = {
    shortcut(ev){
        return shortcuts.matches('toggleCheckbox', ev);
    },
    execute: function () {
        const CHECKED = 'checklist__item--checked';

        let getLevel = function(el){
            return el.className.match(/l[0-9]/g) === null ? -1 : el.className.match(/l[0-9]/g).length;
        }

        let findCommonAncestor = function(node, originalEl){
            let originalNode = originalEl || node;
            if(node.previousElementSibling){
                return getLevel(node.previousElementSibling) < getLevel(originalNode) ? node.previousElementSibling : findCommonAncestor(node.previousElementSibling, originalNode);
            }
            return false;
        }

        let getSiblings = function(el, prev){
            let nodes = prev || [];
            let currentLevel = getLevel(el);
            let node = el;

            while(node){
                if(node.classList.contains('l0') && currentLevel === 1 || node.classList.contains('l1') && currentLevel === 2){
                    nodes.push(node);
                    node = prev ? node.previousElementSibling : node.nextElementSibling;
                } else node = null;
            }

            if(!prev){
                nodes.join(getSiblings(el, nodes));
            }

            return nodes;
        }

        let getChildren = function(el){
            if(el.nextElementSibling && getLevel(el.nextElementSibling) > getLevel(el)){
                return getSiblings(el.nextElementSibling);
            }
            return [];
        }

        let propagateParent = function(el){
            var occurences = {i:-1, checked: -1};
            var sameLevelEls = getSiblings(el).filter((e)=>{
                return getLevel(el) === getLevel(e);
            });

            sameLevelEls.forEach((e)=>{
                occurences.i += 1;
                occurences.checked += e.classList.contains(CHECKED) ? 1:0;
            });
            if(findCommonAncestor(el)){
                findCommonAncestor(el).classList.toggle(CHECKED, occurences.i === occurences.checked);
                propagateParent(findCommonAncestor(el));
            }
        }

        if(this.context.closestElementWithRules.classList.contains('checklist__item__text') || this.context.closestElementWithRules.classList.contains('checklist__item__box')){
            var el = this.context.closestElementWithRules.closest('li');
            var isChecked = !el.classList.contains(CHECKED);
            var ul = el.parentNode;

            el.classList.toggle(CHECKED);
            propagateParent(el);
            getChildren(el).forEach((e)=>{
                e.classList.toggle(CHECKED, isChecked);
            });
        }

        return true;
    }
}

module.exports = toggleCheckbox;
