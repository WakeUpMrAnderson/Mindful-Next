import debug from 'debug';
const log = debug('History');

/**
 * Simple undo/redo implementation
 */
class History {
    /**
     * @constructor
     * @param maxStackSize {number} - The maximum number of undo and redo operations that should be remembered
     */
    constructor(maxStackSize = History.MAX_STACK_SIZE) {
        this.maxStackSize = maxStackSize;
        this.reset();
        this.enable();
    }

    /**
     * Adds an entry in the history
     * @param content {string} - The document content to add to the history
     */
    checkpoint(content) {
        if(this.disabled) {
            return;
        }

        // If the content has changed, push it onto the undo stack and clear the redo stack
        if (this.undoStack.length === 0 || content !== this.undoStack[this.undoStack.length - 1]) {
            this.undoStack.push(content);
            this.redoStack = [];

            // Truncate the undo stack if it exceeds the maximum stack size
            if (this.undoStack.length >= this.maxStackSize) {
                this.undoStack.splice(0, this.undoStack.length - this.maxStackSize)
            }
        }
    }

    /**
     * Undo operation, returns the previous state
     * @return {string}
     */
    undo() {
        // If we have more than one item in our undo stack, pop the last one and push it onto the redo stack
        if (this.undoStack.length > 1) {
            this.redoStack.push(this.undoStack.pop());
        }
        this.log('Undo');
        return this.undoStack[this.undoStack.length - 1];
    }

    /**
     * Redo operation
     * @return {string}
     */
    redo() {
        var last = this.redoStack.pop();
        this.undoStack.push(last);
        this.log('Redo');
        return last;
    }

    /**
     * Checks whether an undo operation can be performed
     * @return {Boolean}
     */
    canUndo() {
        return !this.disabled && this.undoStack.length > 1;
    }

    /**
     * Checks whether an redo operation can be performed
     * @return {Boolean}
     */
    canRedo() {
        return !this.disabled && this.redoStack.length > 0;
    }

    /**
     * Resets the history
     * @return void
     */
    reset() {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Enables the history
     * @return void
     */
    enable() {
        this.disabled = false;
    }

    /**
     * Disables the history
     * @return void
     */
    disable() {
        this.disabled = true;
    }

    /**
     * Dumps the the state of the history to the console
     * @param operation {string} The name of the operation to log
     */
    log(operation) {
        const { undoStack, redoStack } = this;
        log(operation + ' %o', {undoStack, redoStack});
    }
}

/**
 * @static
 * @type {number}
 */
History.MAX_STACK_SIZE = 50;

export default History;
