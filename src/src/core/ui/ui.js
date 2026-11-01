var extend = require('lodash/extend');

require('./ui.scss');

class UI {
    constructor(document) {
        this.document = document;
        this.appendEl();
    }

    appendEl() {
        const fkUI = document.querySelector('.fk-ui');
        if (!fkUI) {
            this.el = document.createElement('div');
            this.el.classList.add('fk-ui');
            document.body.appendChild(this.el);
        } else {
            this.el = fkUI;
        }
    }
}

UI.prototype.focusComponent = function (element) {
    const editor = this.document.lastActiveEditor;
    var closestElementWithRules = editor.dom.getClosestElementWithRules(element);
    editor.focus();
    editor.selection.placeCaret(element, {at: 'start'});
    editor.updateContext(element);
};


UI.prototype.extend = function (name, obj) {
    /**
     *   Inspired by Backbone. Without using event delegation
     *   but a simple one time rendering event binding.
     */
    var uiComponent = extend({
        document: this.document,
        ui: this,
        tagName: 'div',
        className: 'rofl',
        initialize: function () {
        },
        events: {},
        render: function () {
        }
    }, obj);

    /**
     *   Create Element
     */
    uiComponent.el = document.createElement(uiComponent.tagName);
    if (uiComponent.className) {
        uiComponent.el.setAttribute('class', uiComponent.className);
    }

    this[name] = uiComponent;
    this[name].initialize.apply(uiComponent);

    /**
     *   Bind all events to element template.
     */
    Object.keys(uiComponent.events).forEach(function (key) {
        var eventName = key.split(/\s/)[0];
        var selector = key.substr(eventName.length + 1);
        if (selector) {
            return [].forEach.call(uiComponent.el.querySelectorAll(selector), function (el) {
                el.addEventListener(eventName, uiComponent[uiComponent.events[key]].bind(uiComponent));
            }, false);
        }
        return uiComponent.el.addEventListener(eventName, uiComponent[uiComponent.events[key]].bind(uiComponent));
    });

    return uiComponent;

};

export default UI;
