/**
 * An ordered set of functions with convenience methods to insert new functions at the start/end
 * of the set or before/after other functions.
 */
class FunctionSet {
    /**
     * @param functions {Function[]|null}
     */
    constructor(functions = []) {
        /**
         * The set of functions
         * @type {Array}
         */
        this.functions = [];

        /**
         * The names of the functions in the set
         * @type {Array}
         */
        this.functionNames = [];
    }

    /**
     * Factory method
     * @returns {FunctionSet}
     */
    static create() {
        return new FunctionSet();
    }

    /**
     * Adds a new function to the set
     *
     * @param {string} fnName - The name of a function
     * @param {function} fn - A named function to add to the set
     * @param {Object} position
     * @param {string} position.at - Possible options: 'start', 'end'
     * @param {string} position.after - The name of the function that should precede the registered function
     * @param {string} position.before - The name of the function that should follow the registered function (n.b. this
     *                                   parameter is ignored when `position.after` is set)
     * @returns {FunctionSet}
     */
    add(fnName, fn, position = {at: "end"}) {
        if (this.functionNames.indexOf(fnName) !== -1) {
            console.warn('%s function already exists in the set', fnName);
            return this;
        }
        let beforeOrAfterFn = position.after || position.before;
        if (beforeOrAfterFn) {
            let index = this.functionNames.indexOf(beforeOrAfterFn);
            if (index !== -1) {
                if (position.after) {
                    index += 1;
                }
                this.functions.splice(index, 0, fn);
                this.functionNames.splice(index, 0, fnName);
                return this;
            }
        }

        if (position.at === 'start') {
            this.functions.unshift(fn);
            this.functionNames.unshift(fnName);
            return this;
        }
        this.functions.push(fn);
        this.functionNames.push(fnName);
        return this;
    }


    /**
     * Remove a function from the set
     * @param {string} fnName - The name of the function to remove from the set
     * @returns {FunctionSet}
     */
    remove(fnName) {
        let index = this.functionNames.indexOf(fnName);
        if (index === -1) {
            console.warn('%s does not exist in this set', fnName);
            return this;
        }
        this.functions.splice(index, 1);
        this.functionNames.splice(index, 1);
        return this;
    }

}

export default FunctionSet;
