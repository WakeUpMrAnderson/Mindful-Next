import defer from 'lodash/defer';

/**
 * Class that polyfills `selectionchange` and triggers a new
 * `selectionchange.end` event, used by some UI components
 */
class SelectionObserver {

    /**
     * @param callbacks {Object}
     * @param callbacks.selectionChange {Function}
     * @param callbacks.selectionChangeEnd {Function}
     */
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.supportsSelectionChange = typeof document.onselectionchange !== 'undefined';
        this.oldRange = document.createRange();
        this.mousePressed = false;
        this.bindEvents();
    }

    /**
     * Bind the different events that are needed to detect selection changes in an editor
     * @return void
     */
    bindEvents() {
        if (this.supportsSelectionChange) {
            let handleSelectionChange = this.triggerSelectionChange.bind(this);
            document.addEventListener('selectionchange', handleSelectionChange);
        } else {
            document.addEventListener('mousedown', this.startObserving.bind(this));
            document.addEventListener('mouseup', this.stopObserving.bind(this));
            document.addEventListener('keyup', this.triggerSelectionChange.bind(this));
        }
        document.addEventListener('keyup', this.triggerSelectionChangeEnd.bind(this));
        document.addEventListener('mouseup', this.triggerSelectionChangeEnd.bind(this));
        document.body.addEventListener('touchend', this.triggerSelectionChangeEnd.bind(this));
    }

    /**
     * Start listening for mouvemove events when the mouse was pressed inside an editor
     * @param ev
     */
    startObserving(ev) {
        if (ev.target.closest('[contenteditable].fk-editable')) {
            this.mouveMoveListener = this.triggerSelectionChange.bind(this);
            document.addEventListener('mousemove', this.mouveMoveListener);
        }
    }

    /**
     * Stop listening for mouvemove events
     * @param ev
     */
    stopObserving(ev) {
        defer(() => this.triggerSelectionChange(ev) ); // Trigger a deferred selection change for Firefox (issue #75)
        document.removeEventListener('mousemove', this.mouveMoveListener);
    }

    /**
     * Get the current selection or an empty object (useful for comparisons)
     * @return {*}
     */
    getRange() {
        var sel = window.getSelection();
        return sel.rangeCount ? sel.getRangeAt(0) : {};
    }

    /**
     * Compare two different ranges
     * @param rangeA {Range}
     * @param rangeB {Range}
     * @return boolean
     */
    sameRange(rangeA, rangeB) {
        return ['startContainer', 'startOffset',
            'endContainer', 'endOffset'].every((prop) => {
            return rangeA[prop] === rangeB[prop];
        });
    }

    /**
     * Run the callback for the `selectionchange` event
     * n.b. deferred since the `range.collapsed` isn't set correctly otherwise
     * @param ev
     */
    triggerSelectionChange(ev) {
        let newRange = this.getRange();
        if (!this.sameRange(newRange, this.oldRange)) {
            this.oldRange = newRange;
            this.callbacks.selectionChange(ev, newRange);
        }
    }

    /**
     * Runs the callback for the `selectionchange.end` event
     * n.b. deferred since the `range.collapsed` isn't set correctly otherwise
     * @param ev
     */
    triggerSelectionChangeEnd(ev) {
        let newRange = this.getRange();
        this.callbacks.selectionChangeEnd(ev, newRange);
    }

}

export default SelectionObserver;
