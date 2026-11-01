module.exports = {
    undo: {
        shortcut: function (ev) {
            var modKey = (ev.metaKey || ev.ctrlKey );
            var char = String.fromCharCode(ev.keyCode).toUpperCase();
            return modKey && !ev.shiftKey && char === 'Z';
        },
        execute: function () {
            if(this.history.canUndo()){
                this.history.disable();
                try {
                    this.el.innerHTML = this.history.undo();
                    this.el.focus();
                    this.selection.restoreSelection();
                } finally {
                    // a throwing restore must never leave history disabled
                    // (undo/redo would silently die for the whole session)
                    this.history.enable();
                }
                this.emit('history.undo', this.history);
            }
        },
        queryState: function () { }
    },
    redo: {
        shortcut: function (ev) {
            var modKey = (ev.metaKey || ev.ctrlKey );
            var char = String.fromCharCode(ev.keyCode).toUpperCase();
            return modKey && ((!ev.shiftKey && char === 'Y') || (ev.shiftKey && char === 'Z'));
        },
        execute: function () {
            if(this.history.canRedo()){
                this.history.disable();
                try {
                    this.el.innerHTML = this.history.redo();
                    this.el.focus();
                    this.selection.restoreSelection();
                } finally {
                    this.history.enable();
                }
                this.emit('history.redo', this.history);
            }
        },
        queryState: function () { }
    }
};
