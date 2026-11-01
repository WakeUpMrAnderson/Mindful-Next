import each from 'lodash/each';

/**
 * Simple behavior manager object
 */
class Behaviors {
    constructor(editor) {
        this.editor = editor;
        this.__behaviorsRegistry__ = {};
    }
    /**
     * Registers a new behavior
     * @param behaviorName
     * @param fn A function that returns a boolean
     */
    register (behaviorName, fn) {
        this.__behaviorsRegistry__[behaviorName] = fn;
    }
    /**
     * Triggers one or more behaviors
     * @param behaviors
     * @param ev
     * @param currentElement
     * @returns {*}
     */
    trigger(behaviors, ev, currentElement) {
        if (behaviors.constructor === Array) {
            // n.b. we're using lodash's each, which terminates the iteration when false is returned
            return each(behaviors, behavior => this.trigger(behavior, ev, currentElement) );
        }

        if (typeof this.__behaviorsRegistry__[behaviors] === 'undefined') {
            console.warn('Based on your editor rules, the “%s” behavior should be called now. ' +
                'However, it wasn’t loaded with the current editor instance. ' +
                'Perhaps you forgot to load the plugin that provides it?', behaviors);
            return true; // Necessary to avoid breaking the `each` iteration
        }
        return this.__behaviorsRegistry__[behaviors].apply(this, [ev, currentElement, this.editor]);
    };
}

export default Behaviors;
