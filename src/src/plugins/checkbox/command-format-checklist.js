var formatChecklist = {
    execute: function () {
        var wrapper = document.createElement('ul');
        wrapper.classList.add('checklist');

        if(this.context.ancestorElement.classList.contains('checklist')){
            return;
        }

        [].slice.call(this.context.ancestorElement.children).forEach((el)=>{
            var li = document.createElement('li');
            li.className = 'checklist__item ' + el.className;
            li.innerHTML = '<span contenteditable="false" class="checklist__item__box"></span><div class="checklist__item__text">'+el.innerHTML+'</div>';
            wrapper.appendChild(li);
        });
        this.dom.replaceElement(this.context.ancestorElement, wrapper);
        return wrapper;
    },
    queryState: function () {
        return this.context.ancestorElement.classList.contains('checklist');
    }
}

module.exports = formatChecklist;
