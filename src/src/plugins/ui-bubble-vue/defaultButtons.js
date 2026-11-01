import unwrap from '../../core/dom/unwrap';

let defaultButtons = [];

defaultButtons.push({
    name: 'formatH1',
    title: 'Formate as title',
    icon: 'h1',
    isActive: function (editor) {
        return editor.context.closestElementWithRules.tagName === 'H1';
    },
    command: 'formatBlock:h1'
});

defaultButtons.push({
    name: 'formatH2',
    title: 'Format as subtitle',
    icon: 'h2',
    isActive: function (editor) {
        return editor.context.closestElementWithRules.tagName === 'H2';
    },
    command: 'formatBlock:h2'
});


defaultButtons.push({
    name: 'formatBlockquote',
    title: 'Format as blockquote',
    icon: 'blockquote',
    isActive: function (editor) {
        return editor.context.closestElementWithRules.tagName === 'BLOCKQUOTE';
    },
    command: function (editor) {
        editor.commands.execute('formatBlock', 'blockquote');
    }
});

defaultButtons.push({
    name: 'formatParagraph',
    title: 'Format as paragraph',
    icon: 'p',
    isActive: function (editor) {
        return editor.context.closestElementWithRules.tagName === 'p';
    },
    command: function (editor) {
        editor.commands.execute('formatBlock', 'p');
    }
});


defaultButtons.push({
    name: 'formatBold',
    selectionType: ['partial', 'full'],
    title: 'Bold',
    icon: 'bold',
    isVisible: function (context) {
        return context.properties.allowedTags.indexOf('strong') !== -1;
    },
    isActive: function (editor) {
        return editor.commands.queryState('bold');
    },
    command: 'bold'
});

defaultButtons.push({
    name: 'formatItalic',
    title: 'Italic',
    icon: 'italic',
    selectionType: ['partial', 'full'],
    isVisible: function (context) {
        return context.properties.allowedTags.indexOf('em') !== -1;

    },
    isActive: function (editor) {
        return editor.commands.queryState('italic');
    },
    command: 'italic'
});


defaultButtons.push({
    name: 'formatStrikethrough',
    title: 'Strike-through',
    icon: 'strikethrough',
    selectionType: ['partial', 'full'],
    isVisible: function (context) {
        return context.properties.allowedTags.indexOf('s') !== -1;

    },
    isActive: function (editor) {
        return editor.commands.queryState('strikethrough');
    },
    command: 'strikethrough'
});

defaultButtons.push({
    name: 'alignLeft',
    selectionType: ['full'],
    title: 'Align Left',
    icon: 'alignleft',
    isActive: function (editor) {
        return editor.commands.queryState('alignMediaLeft');
    },
    command: 'alignMediaLeft'
});

defaultButtons.push({
    name: 'alignCenter',
    selectionType: ['full'],
    title: 'Align Outbound',
    icon: 'aligncenter',
    isActive: function (editor) {
        return editor.commands.queryState('alignMediaCenter');
    },
    command: 'alignMediaCenter'
});

defaultButtons.push({
    name: 'alignRight',
    selectionType: ['full'],
    title: 'Align Right',
    icon: 'alignright',
    isActive: function (editor) {
        return editor.commands.queryState('alignMediaRight');
    },
    command: 'alignMediaRight'
});

defaultButtons.push({
    name: 'addCaption',
    selectionType: ['full'],
    title: 'Toggle Image Caption',
    icon: 'caption',
    isActive: function (editor) {
        return editor.commands.queryState('toggleCaption');
    },
    command: 'toggleCaption'
});

defaultButtons.push({
    name: 'addLink',
    selectionType: ['full', 'partial'],
    type: 'link-prompt',
    title: 'Add Link',
    icon: 'link',
    isActive: function (editor) {
        return this.getValue(editor);
    },
    getValue: function (editor) {
        return editor.commands.queryState('link');
    },
    onExpand: function (editor) {
        if (!this.getValue(editor)) {
            editor.commands.execute('link');
        }
    },
    command: function (editor, value) {
        editor.commands.execute('unlink');
        if (typeof value === 'string' && value.length) {
            if (!value.match("^(http|https)://")) {
                value = "http://" + value;
            }
            return editor.commands.execute('link', value);
        }
    },
    onCollapse: function (editor, value) {
        if (typeof value === 'string' && value === '') {
            return editor.commands.execute('unlink');
        }
        [].forEach.call(document.querySelectorAll('.fk-selected-link'), unwrap);
    }
});


defaultButtons.push({
    name: 'formatUl',
    selectionType: 'full',
    title: 'Format as an unordered list',
    icon: 'unorderedlist',
    isVisible: function (context) {
        var tagName = context.ancestorElement.tagName;
        return tagName === 'UL' || tagName === 'OL' || context.ancestorElement.classList.contains('checklist');
    },
    isActive: function (editor) {
        return editor.commands.queryState('formatUnorderedList');
    },
    command: 'formatUnorderedList'
});

defaultButtons.push({
    name: 'formatOl',
    selectionType: 'full',
    title: 'Format as an ordered list',
    icon: 'orderedlist',
    isVisible: function (context) {
        var tagName = context.ancestorElement.tagName;
        return tagName === 'UL' || tagName === 'OL' || context.ancestorElement.classList.contains('checklist');
    },
    isActive: function (editor) {
        return editor.commands.queryState('formatOrderedList');    },
    command: 'formatOrderedList'
});

defaultButtons.push({
    name: 'formatChecklist',
    selectionType: 'full',
    title: 'Format as a check list',
    icon: 'checkbox',
    isVisible: function (context) {
        var tagName = context.ancestorElement.tagName;
        return tagName === 'UL' || tagName === 'OL' || context.ancestorElement.classList.contains('checklist');
    },
    isActive: function (editor) {
        return editor.commands.queryState('formatChecklist');
    },
    command: 'formatChecklist'
});

defaultButtons.push({
    name: 'formatChecklist',
    selectionType: 'full',
    title: 'Remove all checked items',
    icon: 'checkboxbulk',
    isVisible: function (context) {
        var tagName = context.ancestorElement.tagName;
        return context.ancestorElement.querySelector('.checklist__item--checked:not(.checklist__item--hide)');
    },
    isActive: function (editor) {
        return false;
    },
    command: 'removeCheckedItems'
});

export default defaultButtons;
