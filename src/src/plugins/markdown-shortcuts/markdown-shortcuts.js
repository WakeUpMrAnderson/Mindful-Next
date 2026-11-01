'use strict';

var placeCaret = require('../../core/range/place-caret');

var extend = require('lodash/extend');
var defer = require('lodash/defer');
var some = require('lodash/some');

function MarkdownShortcuts(options) {
    this.options = options;
}

MarkdownShortcuts.prototype.init = function (editor) {

    var markdownShortcutsBehavior = function (ev, currentElement) {
        var text = currentElement.textContent;
        var newElement;

        var markdownCommands = {
            '>': 'blockquote',
            '######': 'h6',
            '#####': 'h5',
            '####': 'h4',
            '###': 'h3',
            '##': 'h2',
            '---': 'hr',
            '#': 'h1',
            '1.': 'ol',
            '-': 'ul',
            '*': 'ul'
        };

        var cmd;
        some(markdownCommands, function (val, key) {
            if (text.indexOf(key) === 0) {
                cmd = {element: val, command: key};
                return true;
            }
        });

        if (!cmd) {
            return false;
        }

        var reg = new RegExp('^' + cmd.command.replace('*', '\\*'), 'gi');
        var text = text.replace(reg, '');

        if (cmd.element === 'ul' || cmd.element === 'ol') {
            newElement = editor.commands.execute(cmd.element === 'ol' ?
                'insertOrderedList' : 'insertUnorderedList');
        } else {
            newElement = document.createElement(cmd.element);
            if ( cmd.element === 'hr'){
                ev.preventDefault();
                editor.dom.insertBefore(newElement, currentElement);
                return currentElement.innerHTML = '<br>';
            } else {
                editor.dom.replaceElement(currentElement, newElement);
                editor.updateContext(newElement);
            }
        }

        ev.preventDefault();
        newElement.innerHTML = text.length ? text : '<br>';

        // set cursor
        defer(function () {
            placeCaret(newElement, {at:'start'});
        });
        return false;
    };

    // Register new behavior
    editor.behaviors.register('markdownShortcuts', markdownShortcutsBehavior);
};
module.exports = MarkdownShortcuts;
