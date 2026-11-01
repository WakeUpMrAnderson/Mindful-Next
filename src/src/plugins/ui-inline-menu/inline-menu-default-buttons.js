'use strict';

var defaultButtons = [];

defaultButtons.push({
    name: 'createH1',
    title: 'Create H1',
    icon: 'h1',
    command: function (currentComponent, editor) {
        return editor.commands.execute('formatBlock', 'h1');
    }
});

defaultButtons.push({
    name: 'createH2',
    title: 'Create H2',
    icon: 'h2',
    command: function (currentComponent, editor) {
        return editor.commands.execute('formatBlock', 'h2');
    }
});

defaultButtons.push({
    name: 'createBlockquote',
    title: 'Create Blockquote',
    icon: 'blockquote',
    command: function (currentComponent, editor) {
        return editor.commands.execute('formatBlock', 'blockquote');
    }
});

defaultButtons.push({
    name: 'insertOrderedList',
    title: 'Create Unordered List',
    icon: 'orderedlist',
    command: function (currentComponent, editor) {
        return editor.commands.execute('insertOrderedList');
    }
});

defaultButtons.push({
    name: 'insertUnorderedList',
    title: 'Create Ordered List',
    icon: 'unorderedlist',
    command: function (currentComponent, editor) {
        return editor.commands.execute('insertUnorderedList');
    }
});


defaultButtons.push({
    name: 'insertChecklist',
    title: 'Create a check list',
    icon: 'checkbox',
    command: function (currentComponent, editor) {
        return editor.commands.execute('insertChecklist');
    }
});

defaultButtons.push({
    name: 'insertHr',
    title: 'Insert line / hr',
    icon: 'hr',
    command: function (currentComponent, editor) {
        return editor.commands.execute('insertHr');
    }
});

module.exports = defaultButtons;
