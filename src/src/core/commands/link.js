import shortcuts from '../shortcuts/shortcuts.js';

module.exports = {
    openLinkPrompt: {
        shortcut(ev){
            return shortcuts.matches('openLinkPrompt', ev);
        },
        execute(){
            this.emit('ui.bubble.toggleButton', 'addLink');
        }
    },
    link: {
        execute: function (value) {
            let params = value ? {href: value, "class":""} : {"class": 'fk-selected-link'};
            return this.selection.wrap('a', params);
        },
        queryState: function () {
            if (this.selection.range) {

                var closestA = this.selection.endElement.closest('a')
                    || this.selection.startElement.closest('a');

                if (closestA) {
                    return closestA.href;
                }
            }
            return false;
        }
    },
    unlink: {
        execute: function () {
            this.selection.unwrap('a');
        }
    }
}
