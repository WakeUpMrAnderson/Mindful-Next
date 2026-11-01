import forEach from 'lodash/forEach';
import defer from 'lodash/defer';

import debug from 'debug';
const log = debug('ElementObserver');

/**
 * Mutation observer for DOM elements
 */
class ElementObserver {

    /**
     * Constructor
     * @param el
     * @param callbacks
     * @param {RegExp} skippedClasses
     */
    constructor(el, callbacks, skippedClasses = /skipped\-class/) {
        this.el = el;
        this.skippedClasses = skippedClasses;
        this.callbacks = callbacks;
        // F1: records arriving while a batch is being processed are queued
        // here and re-dispatched on resume — never dropped
        this.pending = [];
        this.redispCount = 0;
        this.observer = this.createObserver(this.handleMutations.bind(this));
        this.connect();
    }

    /**
     * Creates a new mutation observer
     * @returns {MutationObserver}
     */
    createObserver(callback) {
        var MutationObserver =
            window.MutationObserver ||
            window.WebKitMutationObserver ||
            window.MozMutationObserver;
        return new MutationObserver(callback);
    }


    /**
     * Checks whether a node shoup be ignored
     * @returns {Boolean}
     */
    shouldSkipNode(node) {
        return node.nodeType !== Node.ELEMENT_NODE ||
            this.skippedClasses.test(node.getAttribute('class'));
    }

    /**
     * Processes the mutations
     * @param {MutationRecord[]} mutationRecords
     * @param {boolean} fromResume — true when re-dispatching queued records
     */
    handleMutations(mutationRecords, fromResume = false) {
        if (!fromResume) {
            // A fresh observer-delivered batch resets the loop guard even
            // when it arrives while paused (queued): the park warning
            // promises the parked records will be processed on the next
            // fresh input — a feed landing inside a processing window is
            // still a fresh input. Without this, a burst that swallows
            // every feed parks forever (the queued feed records are
            // consumed by the burst without re-arming the guard).
            this.redispCount = 0;
        }
        if (this.paused) {
            // F1: records consumed while paused were previously DROPPED —
            // any DOM write made during processing (by the normalizers
            // themselves, undo/redo, vault adoption, plugins) generated a
            // follow-up batch whose processing depended on macrotask
            // ordering. Queue and re-dispatch on resume instead.
            //
            // Marker-only records are the exception: the normalizer wrapper
            // (createNormalizer) wraps EVERY processed node in
            // selection.saveSelection()/restoreSelection(), which inserts
            // and removes marker spans. Queuing those would re-run the
            // wrapper for the record target, regenerating the same records
            // forever (the old drop-on-pause accidentally braked that
            // cycle). Real mutations — text, elements, attribute changes —
            // always queue.
            const meaningful = mutationRecords.filter(rec =>
                rec.type === 'attributes' ||
                [...rec.addedNodes].some(n => !this.isTransientNode(n)) ||
                [...rec.removedNodes].some(n => !this.isTransientNode(n)));
            if (meaningful.length) {
                this.pending = this.pending.concat(meaningful);
            }
            return;
        }
        if (__DEBUG__) {
            //console.time('[ElementObserver#handleMutations]');
        }
        this.paused = true;     // Pause the observer while the mutations are processed
        this.seen = [];         // Keep track of the encountered nodes
        try {
            forEach(mutationRecords, this.handleMutationRecord.bind(this));
        } finally {
            // a throwing normalizer must never wedge the observer paused
            // (paused forever = every later record piles into pending)
            this.seen = [];
            this.resume();
        }
        if (__DEBUG__) {
            //console.timeEnd('[ElementObserver#handleMutations]');
        }
    }

    /**
     * Transient-UI element check for the queue filter: elements the
     * observer should skip anyway (selection markers, UI chrome, iframe
     * wrappers). Text nodes are never transient — typing is real content.
     */
    isTransientNode(node) {
        return node.nodeType === Node.ELEMENT_NODE &&
            this.skippedClasses.test(node.getAttribute && node.getAttribute('class'));
    }

    /**
     * Un-pause on the next macrotask (the original deferral semantics) and
     * re-dispatch anything queued while the batch was processing. The
     * re-dispatch counter bounds pathological loops; when it trips, the
     * queue is PARKED (never dropped) until the next fresh observer
     * delivery resets the counter and drains it.
     */
    resume() {
        defer(() => {
            this.paused = false;
            if (this.pending.length) {
                if (this.redispCount >= 50) {
                    if (!this._parkWarned) {
                        this._parkWarned = true;
                        console.warn('[Mindful] observer: parking ' + this.pending.length +
                            ' queued mutation records — possible normalization loop; they will be processed on the next fresh input');
                    }
                    // Park watchdog: the park ends when a fresh input re-arms
                    // the counter — but that input's own resume chain must
                    // not be load-bearing: a parked queue can never depend
                    // on a single deferred callback. One idle timer re-checks
                    // each second; it dispatches only after a fresh input
                    // reset the counter (the loop bound stays intact) and
                    // the timer chain ends on its own once the queue drains.
                    setTimeout(() => this.resume(), 1000);
                    return;
                }
                this._parkWarned = false;
                this.redispCount++;
                const batch = this.pending;
                this.pending = [];
                this.handleMutations(batch, true);
            }
        });
    }

    /**
     * Extract the added/removed/modified nodes from a mutation record
     * @param {MutationRecord} mutationRecord
     */
    handleMutationRecord(mutationRecord) {
        forEach(mutationRecord.addedNodes, (node) => {
            this.processNode(node, 'addedNodes')
        });
        forEach(mutationRecord.removedNodes, (node) => {
            this.processNode(node, 'removedNodes')
        });
        if (this.seen.indexOf(mutationRecord.target) === -1) {
            this.processNode(mutationRecord.target, 'modifiedNodes');
        }
    }

    /**
     * Run the callbacks on a mutated node
     * @param node
     * @param mutationType {string}
     */
    processNode(node, mutationType) {
        if (this.seen.indexOf(node) !== -1 || this.shouldSkipNode(node)) {
            return;
        }
        this.seen.push(node);
        log('Process node (%s): %o', mutationType, node);
        this.callbacks[mutationType](node);
    }

    loadDocument() {
        this.paused = true;
        this.seen = [];
        forEach(this.el.childNodes, (node) => {
            this.processNode(node, 'loadDocument');
        });
        this.seen = [];
        // resume explicitly — previously this relied on processNode's
        // per-node deferred un-pause, so an EMPTY editor stayed paused
        // forever (no nodes → no defers → every later batch dropped)
        this.resume();
    }

    /**
     * Enable the mutation observer
     * @returns void
     */
    connect() {
        return this.observer.observe(this.el, {
            childList: true,
            subtree: true,
            attributes: true
        });
    }

    /**
     * Disables the mutation observer
     * @returns void
     */
    disconnect() {
        return this.observer.disconnect();
    }
}

export default ElementObserver;
