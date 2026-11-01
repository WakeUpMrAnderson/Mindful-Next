var debounce = require('lodash/debounce');
var defer = require('lodash/defer');
var keys = require('../../core/keys/keys');
var InlineMenuButton = require('./inline-menu-button');
var defaultButtons = require('./inline-menu-default-buttons');
var rect = require('../../core/ui/rect');
var scrollIntoView = require('../../core/window/scroll-into-view');
// styles: styles/pill.css (shared pill design; the legacy inline-menu.scss
// webpack blob is retired — its rules live in pill.css now)

function InlineMenu(options) {
    this.options = options;
}

InlineMenu.prototype.init = function (editor) {
    this.ui = editor.document.ui;
    this.editor = editor;

    this.visible = false;
    this.selectionIndex = 0;
    this.buttons = [];

    this.el = document.createElement('div');
    this.el.classList.add('fk-ui-inlineMenu');

    this.ui.el.appendChild(this.el);

    this.editor.on('ui.dots.click', this.toggleHandler.bind(this));
    this.editor.on('keydown', this.toggleHandler.bind(this));
    this.editor.on('mouseup', this.simulateBlur.bind(this));
    this.editor.on('resize', debounce(this.updateUIPosition.bind(this), 10));

    this.registerDefaultButtons(defaultButtons);

    // register dots with UI
    this.ui.inlineMenu = this;
};

InlineMenu.prototype.registerDefaultButtons = function (defaultButtons) {
    defaultButtons.forEach(function (button) {
        this.registerButton(button.name, button);
    }.bind(this));
};

InlineMenu.prototype.simulateBlur = function (ev) {
    if (!this.ui.el.contains(ev.target) && this.visible) {
        this.hide();
    }
};

InlineMenu.prototype.updateUIPosition = function () {
    var coords = rect(this.editor.context.ancestorElement);
    this.el.style.left = coords.left + 'px';
    this.el.style.top = coords.top + 'px';
};

InlineMenu.prototype.loadCommand = function (index) {
    // F5: snapshot the CLICK-time context — the command runs 125ms later
    // and must not act on a caret/context that moved meanwhile (commands
    // like formatBlock/insertHr read editor.context at execution time)
    var snapshot = Object.assign({}, this.editor.context);
    this.generation = (this.generation || 0) + 1;
    var generation = this.generation;
    // hide menu
    this.hide();
    // we delay execution by one render cycle to make sure
    // that the UI disappears before subsequent animations
    // are rendered
    setTimeout(function () {
        if (this.generation !== generation) {
            return;   // the menu re-opened meanwhile — stale click
        }
        var live = Object.assign({}, this.editor.context);
        Object.assign(this.editor.context, snapshot);
        try {
            var focusComponent = this.buttons[index].command(snapshot.closestElementWithRules, this.editor);
            if (focusComponent instanceof HTMLElement) {
                // set cursor accordingly — focusComponent rebuilds the
                // context from the new DOM, so the snapshot swap is done
                this.ui.focusComponent(focusComponent);
            } else {
                // no caret move — put the live context back. INVARIANT: a
                // command that returns a non-HTMLElement must not have
                // rebuilt editor.context itself (updateContext) — the
                // restore here would clobber it. Element-returning
                // commands get their context rebuilt by focusComponent.
                Object.assign(this.editor.context, live);
            }
        } catch (e) {
            Object.assign(this.editor.context, live);
            throw e;
        }
    }.bind(this), 125);
};

InlineMenu.prototype.highlightPrev = function () {
    this.highlight('prev');
};

InlineMenu.prototype.highlightNext = function () {
    this.highlight('next');
};

InlineMenu.prototype.highlight = function (direction) {
    var cl = 'fk-button--focused';
    // update selection index
    this.selectionIndex = direction === 'prev' ? this.selectionIndex === 0 ? this.buttons.length - 1 : this.selectionIndex - 1 : this.selectionIndex < this.buttons.length - 1 ? this.selectionIndex + 1 : 0;
    //set new class to button
    var buttons = this.el.querySelectorAll('.fk-button--inlineMenu');
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove(cl);
    }
    this.buttons[this.selectionIndex].el.querySelector('.fk-button--inlineMenu').classList.add(cl);
};

InlineMenu.prototype.show = function () {

    // set visible to make responsive listener work
    this.visible = true;
    // F5: a re-open cancels any stale pending command execution
    this.generation = (this.generation || 0) + 1;

    this.el.classList.remove('fk-hide');
    // reset selection index to first button
    this.selectionIndex = 0;
    // highlight prev = 0
    this.renderButtons();

    // delay so it gets the new coordinates AFTER input
    defer(function () {
        scrollIntoView(this.editor.context.closestElementWithRules);
        this.editor.emit('inlineMenuToggle', true);
        document.documentElement.classList.add('fk-inline-menu');
        this.updateUIPosition();
        this.el.classList.add('fk-show');
        this.buttons[0].el.querySelector('.fk-button--inlineMenu').classList.add('fk-button--focused');
    }.bind(this));
};

InlineMenu.prototype.cancel = function () {
    this.hide();
    this.ui.focusComponent(this.editor.context.closestElementWithRules);
};

InlineMenu.prototype.hide = function () {
    // Set instance visibility variable to false
    this.visible = false;

    this.el.classList.remove('fk-show');

    // Need to make sure we get a scoped range for FIREFOX first.
    this.editor.emit('inlineMenuToggle', false);
    document.documentElement.classList.remove('fk-inline-menu');


    this.el.classList.remove('fk-show');
    this.el.classList.add('fk-hide');

    var offsetEl = document.querySelector('.fk-inlineMenu-offCanvas');
    if ( offsetEl ){
        offsetEl.classList.remove('fk-inlineMenu-offCanvas');
    }
    this.editor.emit('inlineMenuHide', this);
};

// we need to re-render buttons each single time since
// mobile-webkit :hover emulator won't take away the state anymore.
InlineMenu.prototype.renderButtons = function () {
    this.el.innerHTML = '';
    this.buttons.forEach(function (obj, index) {
        var button = new InlineMenuButton(obj, this).__initialize(index);
        this.buttons[index] = button;
        this.el.appendChild(button.el);
    }.bind(this));
};

InlineMenu.prototype.registerButton = function (name, obj) {
    obj.name = name;
    obj.icon = obj.hasOwnProperty('icon') ? obj.icon : obj.name;

    this.buttons.push(obj);
};

InlineMenu.prototype.toggleHandler = function (ev) {
    var k = ev.keyCode;

    if (this.visible) {
        switch (ev.keyCode) {
            case keys.backspace:
                ev.preventDefault();
                this.cancel();
                break;
            case keys.enter:
                ev.preventDefault();
                this.loadCommand(this.selectionIndex);
                break;
            case keys.arrowLeft:
                ev.preventDefault();
                this.highlightPrev();
                break;
            case keys.arrowRight:
                ev.preventDefault();
                this.highlightNext();
                break;
            case keys.arrowUp:
                ev.preventDefault();
                this.highlightPrev();
                break;
            case keys.arrowDown:
                ev.preventDefault();
                this.highlightNext();
                break;
            case keys.tab:
                ev.preventDefault();
                if (ev.shiftKey) {
                    return this.highlightPrev();
                }
                return this.highlightNext();
            default:
                if (!ev.shiftKey) this.cancel();
        }
    } else {
        // check if it's a space key...
        var didPressSpace = k === keys.space;
        var closestElementWithRules = this.editor.context.closestElementWithRules;

        if ((didPressSpace || ev.type === 'mousedown' || ev.type === 'touchstart') &&
            'H1,H2,H3,H4,H5,H6,P,BLOCKQUOTE'.indexOf(closestElementWithRules.tagName) > -1 &&
            closestElementWithRules.textContent.length === 0) {
            closestElementWithRules.classList.add('fk-inlineMenu-offCanvas');
            ev.preventDefault();
            this.editor.emit('inlineMenuOpen', this);
            return this.show();
        }
    }
};

module.exports = InlineMenu;
