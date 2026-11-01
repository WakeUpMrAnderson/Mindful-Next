import shortcuts from '../shortcuts/shortcuts.js';

module.exports = {
    'italic': {
        shortcut(ev){
            return shortcuts.matches('italic', ev);
        },
        execute: function () {
            this.selection.unwrap('i');
            this.selection.toggleTag('em');
        },
        queryState: function () {
            if (this.selection.range) {
                return this.selection.endElement.closest('em,i') || this.selection.startElement.closest('em,i');
            }
        }
    },
    'bold': {
        shortcut(ev){
            return shortcuts.matches('bold', ev);
        },
        execute: function () {
            this.selection.unwrap('b');
            this.selection.toggleTag('strong');
            // Notify listeners that the content has changed
            this.emit('contentChange');
        },
        queryState: function () {
            if (this.selection.range) {
                return this.selection.endElement.closest('strong,b') || this.selection.startElement.closest('strong,b');
            }
        }
    },
    'strikethrough': {
        shortcut(ev){
            return shortcuts.matches('strikethrough', ev);
        },
        execute: function () {
            this.selection.toggleTag('s');
            // Notify listeners that the content has changed
            this.emit('contentChange');
        },
        queryState: function () {
            if (this.selection.range) {
                return this.selection.endElement.closest('s') || this.selection.startElement.closest('s');
            }
        }
    }
};
