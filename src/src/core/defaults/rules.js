const rules = {
    'h1,h2,h3,h4,h5,h6,p,blockquote': {
        blockElement: true,
        allowedCommands: ['formatH1', 'formatH2', 'formatBlockquote'],
        onBackspace: ['detectVoidElement'],
        onSpace: ['markdownShortcuts'],
        onDelete: ['normalizeDeleteKey'],
        // guards: only take over when the move crosses a void element
        // (hr); plain line-walking stays native
        onArrowUp: ['navigateUpAcrossVoid'],
        onArrowDown: ['navigateDownAcrossVoid']
    },
    'h1,h2,blockquote': {
        allowedCommands: ['formatH1', 'formatH2', 'formatBlockquote', 'formatParagraph', 'addLink'],
    },
    'blockquote': {
        allowedCommands: ['formatH1', 'formatH2', 'formatBlockquote', 'formatParagraph', 'formatItalic', 'formatBold'],
        onEnter: ['addParagraphAfterAncestor'],
        'p': {
            onEnter: ['addParagraphAfterAncestor']
        }
    },
    'h1,h2':{
        allowedTags: ['a']

    },
    'ul.checklist': {
        allowedCommands: ['formatOl', 'formatUl', 'formatChecklist'],
        isFocusable: false,
        allowedTags: ['li'],
        allowedAttributes: ['class'],
        '.checklist__item__text': {
            isFocusable: true,
            onTab: ['indent'],
            onDelete: ['normalizeCheckBoxDelete'],
            onArrowLeft: ['handleCheckboxBackArrowKey'],
            onArrowRight: ['handleCheckboxRightArrowKey'],
            allowedTags: ['strong', 'em', 'b', 'i', 'q', 'a', 'br'],
            onBackspace: ['deleteCheckbox'],
            onEnter: ['outdentEmptyListItem', 'createCheckbox']
        },
        '.checklist__item': {
            isFocusable: false,
            allowedCommands: [],
            allowedTags: ['div', 'span']
        },
        '.checklist__item__box': {
            isFocusable: false,
            allowedCommands: [],
            allowedAttributes: ['class', 'contenteditable', 'contentEditable']
        },
    },
    'p': {
        allowedAttributes: ['fk-placeholder'],
        allowedTags: ['strong', 'em', 'b', 'i', 'q', 'a', 's'],
        allowedCommands: ['formatH1', 'formatH2',
            'addLink', 'formatBold', 'formatItalic', 'formatStrikethrough', 'formatBlockquote', 'formatInlineQuote']
    },
    'hr': {},
    'li': {
        allowedAttributes: ['class'],
    },
    'ul, ol':{
        isFocusable: false,
        allowedCommands: ['formatOl', 'formatUl', 'formatChecklist'],
        allowedTags: ['li'],

        'li': {
            allowedCommands: ['addLink', 'formatBold', 'formatItalic', 'formatStrikethrough'],
            allowedTags: ['em', 'strong', 'a', 's'],
            allowedAttributes: ['class'],
            onEnter: ['outdentEmptyListItem'],
            onTab: ['indent']
        },
        'li:first-child':{
            onBackspace: 'restoreParagraph'
        }
    }
};

export default rules;
