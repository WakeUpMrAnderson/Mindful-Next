'use strict';

var extend = require('lodash/extend');

var InlineMenuButton = function (options, inlineMenu) {
    // The basic button markup — hand-built instead of lodash/template,
    // which compiles via `new Function` and dies under MV3's CSP.
    return extend({
        type: 'command',
        name: 'undefined',
        title: 'undefined',
        icon: 'undefined',
        command: function () {

        },
        /**
         * The initialize function takes care of event binding and
         * markup instantiation. It only runs once.
         *
         * @method initialize
         */
        __initialize: function (index) {
            this.el = document.createElement('div');

            var button = document.createElement('div');
            button.className = 'fk-button fk-button--inlineMenu';
            button.setAttribute('data-icon', this.icon);
            button.setAttribute('title', this.title);
            this.el.appendChild(button);

            // we do not want click to fire if touchstart already fired
            this.el.firstChild.addEventListener('touchstart', function (ev) {
                ev.stopPropagation();
                ev.preventDefault();
                inlineMenu.loadCommand(index);
            });
            this.el.firstChild.addEventListener('click', inlineMenu.loadCommand.bind(inlineMenu, index));

            return this;
        }
    }, options);
};

module.exports = InlineMenuButton;
