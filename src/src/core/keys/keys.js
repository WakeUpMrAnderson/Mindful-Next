var Keys = {
    enter: 13,
    space: 32,
    backspace: 8,
    escape: 27,
    ctrl: 17,
    tab: 9,
    arrowLeft: 37,
    arrowRight: 39,
    arrowUp: 38,
    arrowDown: 40,
    'delete': 46,

    /**
     * Checks whether the current input is potentially changing content
     * @method affectsContent
     * @param  { jQueryEvent } the jQuery wrapped event object.
     */
    affectsContent: function (ev) {
        var w = /[^\w\s]|/g.test(String.fromCharCode(ev.keyCode));
        var m = this.isModKey(ev);
        var a = this.isArrowKey(ev);
        var t = ev.keyCode === this.tab;
        var b = ev.keyCode === this.backspace;
        var d = ev.keyCode === this['delete'];

        return ( w || b || d ) && !m && !a && !t;
    },

    isArrowKey: function (ev) {
        var k = ev.keyCode;
        var u = this.arrowUp;
        var d = this.arrowDown;
        var r = this.arrowRight;
        var l = this.arrowLeft;
        return ( k === u || k === d || k === r || k === l );
    },

    /**
     * Checks whether the current arrow key is an
     * arrow key that moves the caret forwards
     * @method isArrowForwards
     * @param  { jQueryEvent } the jQuery wrapped event object.
     */
    isArrowForwards: function (ev) {
        var k = ev.keyCode;
        var d = this.arrowDown;
        var r = this.arrowRight;
        return ( k === d || k === r );
    },

    /**
     * Checks whether the current arrow key is an
     * arrow key that moves the caret forwards
     * @method isArrowForwards
     * @param  { jQueryEvent } the jQuery wrapped event object.
     */
    isArrowBackwards: function (ev) {
        var k = ev.keyCode;
        var u = this.arrowUp;
        var l = this.arrowLeft;
        return ( k === u || k === l );
    },

    /**
     * Checks whether the current keycode is just a modifier
     * key.
     * @method isModKey
     * @param  { jQueryEvent } the jQuery wrapped event object.
     */
    isModKey: function (ev) {
        var kc = ev.keyCode;
        var modKeys = [17, 16, 27, 20, 18, 91];
        return modKeys.indexOf(kc) >= 0;
    },

    /**
     * Checks whether the current keycode is possibily changing
     * the caret coordinates.
     * @method changesCaretPosition
     * @param  { jQueryEvent } the jQuery wrapped event object.
     */
    changesCaretPosition: function (ev) {
        var k = ev.keyCode;
        return this.isArrowKey(ev) || k === this.backspace || k === this.enter || k === this['delete'];
    },

    /**
     * Gets the key name by keyCode
     *
     * @method getKeyByCode
     * @param  { keyCode } the events keyCode
     */
    getKeyByCode: function (keyCode) {
        for (var prop in this) {
            if (this.hasOwnProperty(prop)) {
                if (this[prop] === keyCode) {
                    return prop;
                }
            }
        }
    }
};
module.exports = Keys;
