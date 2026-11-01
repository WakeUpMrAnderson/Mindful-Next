'use strict';

var keys = require('./keys/keys');
var get = require('lodash/get');

import debug from 'debug';
const log = debug('Commands');

var Commands = function (editor) {
    this.editor = editor;
    this.__commandsRegistry__ = {};
};

Commands.prototype.register = function (commandName, methods) {
    this.__commandsRegistry__[commandName] = methods;
};

Commands.prototype.callMethod = function (methodName, commandName, params) {

    var method = get(this.__commandsRegistry__, [commandName, methodName]);

    if(!method){
        throw 'Method ' + methodName + ':' + commandName + ' is not defined';
    }

    var result = method.call(this.editor, params);

    if (result instanceof HTMLElement && methodName === 'execute') {
        // If the component doesn't hide the cursor, i.e. is a normal text component
        // we need to select the component BEFORE update element gets triggered
        // since all the UI components that rely on an up to date selection will
        // still have the old selection reference when componentChange event is fired.
        this.editor.selection.selectNode(result);

        // we then update the editor context...
        this.editor.updateContext(result);

    }
    return result;
};

Commands.prototype.execute = function (commandName, params) {
    log('Execute %s with params %o', commandName, params);
    // send broadcast
    this.editor.emit('commandExecuted', commandName);
    var result = this.callMethod('execute', commandName, params);
    if(result){
        return result;
    }
};

Commands.prototype.queryState = function (commandName) {
    return this.callMethod('queryState', commandName);
};

Commands.prototype.executeKeyboardShortcut = function (ev) {
    if (ev.metaKey || ev.ctrlKey) {
        // B and I are owned by the shortcut registry now — suppress the
        // browser's native contenteditable bold/italic so a remap really
        // moves the binding instead of leaving the browser's copy alive
        // (keyCode 66 = B, 73 = I)
        if ((ev.keyCode === 66 || ev.keyCode === 73) && !ev.altKey) {
            ev.preventDefault();
        }
    }
    // altKey included: the resolver can bind Alt-combos (strikethrough's
    // Windows default is Alt+Shift+5); predicates do exact modifier
    // matching, so plain typing and Shift-only events never reach here
    if (ev.metaKey || ev.ctrlKey || ev.altKey) {
        return [].some.call(Object.keys(this.__commandsRegistry__), function (commandName) {
            var shortcut = this.__commandsRegistry__[commandName].shortcut;
            if (shortcut && shortcut(ev)) {
                ev.preventDefault();
                this.execute(commandName);
                return true;
            }
        }.bind(this));
    }
};

module.exports = Commands;
