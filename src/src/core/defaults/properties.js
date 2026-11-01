const propertyDefinitions = {
    /*
     * Specifies whether the element is focusable with the cursor.
     *
     * If it isn't, the component manager will recursively delegate the focus to:
     * - The element's parent element or previous sibling, when pressing
     *   backspace, [↑], [←]
     * - The element's first child or next sibling, for all other events
     * - The parent contenteditable
     */
    isFocusable: {
        defaultValue: true
    },

    /*
     * Specifies whether the matched element should hide the native cursor
     * when it is selected
     */
    hidesCursor: {
        defaultValue: false
    },

    /*
     * Specifies whether the element's ancestor container depends on this element.
     */
    isEssential: {
        defaultValue: false
    },

    /**
     * The list of tags that the matched element can contain.
     */
    allowedTags: {
        defaultValue: ['a', 'em', 'strong', 'img', 's'],
        inherited: true
    },

    /**
     * The default attributes list
     */
    allowedAttributes: {
        defaultValue: ['alt', 'disabled', 'href', 'src', 'title', 'left', 'center', 'right'],
        inherited: true
    },

    /**
     * The list of commands that can be executed within the matched element.
     */
    allowedCommands: {
        defaultValue: ['formatBold', 'formatItalic', 'addLink']
    }
};

export default propertyDefinitions;
