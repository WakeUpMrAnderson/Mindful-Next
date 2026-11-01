var setHTML = require('../dom/set-html');

module.exports = {
    formatBlock: {
        execute: function (tagName) {
            var oldEl = this.context.closestElementWithRules;
            var newEl = document.createElement(tagName);
            setHTML(newEl, oldEl.innerHTML.length ? oldEl.innerHTML : oldEl.innerHTML+'<br/>', this.properties);
            this.dom.replaceElement(oldEl, newEl);

            return newEl;
        },
        queryState: function (tagName) {
            // TODO: Use queryState from buttons?
            return this.context.closestElementWithRules.toLowerCase() === tagName.toLowerCase();
        }
    }
}
