import forEach from 'lodash/forEach';

// styles: styles/pill.css (shared pill design — same capsule and buttons
// as the flow-menu; the legacy fk-*.scss webpack blobs are retired)

/**
 * Bubble View — vanilla replacement for the original Vue 1.x component.
 *
 * Same DOM structure, class names and public surface as the Vue version:
 * the plugin assigns state directly (isVisible, buttons, selectionCoords,
 * startButton, expandedButton, buttonIndex, isInTabbedMode) and accessor
 * setters re-render/position the bubble exactly where Vue's reactivity
 * used to.
 *
 * Deviation from the original (logged): the pagination arrows are
 * functional — the original rendered every button at all times and the
 * arrows only moved an internal offset. The vanilla view renders the
 * visible page slice (startButton … startButton + maxButtons).
 */
class BubbleView {

    constructor(options) {
        this.maxButtons = (options.data && options.data.maxButtons) || 7;
        this.editor = options.editor;
        this.plugin = options.plugin;
        this.el = document.querySelector(options.el);

        // state (mirrors the original Vue data)
        this.isVisible = false;
        this.startButton = 0;
        this.buttonIndex = -1;
        this.expandedButton = null;
        this.isInTabbedMode = false;

        this.bindEvents();
        this.render();
    }

    // ---------- reactive-ish accessors ----------

    get buttons() { return this._buttons || []; }
    set buttons(list) {
        this._buttons = list || [];
        this.startButton = 0;
        this.render();
    }

    get isVisible() { return this._isVisible; }
    set isVisible(v) {
        this._isVisible = !!v;
        this.el.classList.toggle('fk-bubble--visible', this._isVisible);
    }

    get selectionCoords() { return this._selectionCoords || {}; }
    set selectionCoords(coords) {
        this._selectionCoords = coords || {};
        this.reposition();
    }

    get startButton() { return this._startButton; }
    set startButton(v) {
        this._startButton = v;
        this.render();
        this.reposition();
    }

    set expandedButton(button) {
        this._expandedButton = button;
        this.render();
        this.reposition();
    }
    get expandedButton() { return this._expandedButton; }

    // ---------- rendering ----------

    render() {
        // while a link prompt is open, never rebuild the overlay — it would
        // wipe the input's focus and typed value (Vue's granular updates
        // protected it; the full re-render does not)
        if (this.expandedButton && this.el.querySelector('.fk-bubble__link-prompt')) return;
        if (this.expandedButton) {
            this.renderExpanded();
        } else {
            this.renderButtons();
        }
    }

    visibleButtons() {
        return this.buttons.slice(this.startButton, this.startButton + this.maxButtons);
    }

    paginationDiv(kind, handler) {
        const div = document.createElement('div');
        div.className = `fk-bubble__pagination fk-bubble__pagination--${kind} fk-icon fk-icon-${kind === 'prev' ? 'left' : 'right'}-dir`;
        div.setAttribute('data-icon', kind === 'prev' ? 'chevron-left' : 'chevron-right');
        div.addEventListener('click', handler);
        return div;
    }

    buttonDiv(button) {
        const div = document.createElement('div');
        div.className = 'fk-button fk-icon-' + button.icon +
            (button.active ? ' fk-button--active' : '') +
            (button.focused ? ' fk-button--focused' : '');
        div.setAttribute('data-icon', button.icon);
        div.setAttribute('title', button.title || '');
        div.addEventListener('click', ev => {
            this.restoreSelection();
            if (button.type) {
                this.expand(button);
            } else if (button.command) {
                this.executeCommand(button);
            } else {
                console.warn('%s button is missing a command property', button.title);
            }
            ev.preventDefault();
        });
        return div;
    }

    renderButtons() {
        this.el.innerHTML = '';
        if (this.hasPrev) this.el.appendChild(this.paginationDiv('prev', () => this.prevPage()));
        this.visibleButtons().forEach(button => this.el.appendChild(this.buttonDiv(button)));
        if (this.hasNext) this.el.appendChild(this.paginationDiv('next', () => this.nextPage()));
    }

    renderExpanded() {
        this.el.innerHTML = '';
        this.el.appendChild(this.paginationDiv('prev', () => this.closeExpandedButton()));

        if (this.expandedButton.type === 'link-prompt') {
            this.el.appendChild(this.buildLinkPrompt(this.expandedButton));
        }
    }

    buildLinkPrompt(button) {
        const wrap = document.createElement('div');
        wrap.className = 'fk-bubble__link-prompt';

        if (button.datalist) {
            const datalist = document.createElement('datalist');
            datalist.id = 'fk-links';
            button.datalist.forEach(item => {
                const option = document.createElement('option');
                option.setAttribute('value', item.value || '');
                option.textContent = item.text || '';
                datalist.appendChild(option);
            });
            wrap.appendChild(datalist);
        }

        const input = document.createElement('input');
        input.className = 'fk-bubble__link-prompt__input';
        input.setAttribute('list', 'fk-links');
        input.type = 'text';
        input.placeholder = 'Enter URL...';
        wrap.appendChild(input);

        const ok = document.createElement('div');
        ok.className = 'fk-bubble__action';
        ok.setAttribute('title', 'Confirm');
        ok.textContent = 'OK';
        ok.addEventListener('click', () => this.executeCommand(button, input.value));
        wrap.appendChild(ok);

        const remove = document.createElement('div');
        remove.className = 'fk-bubble__action fk-bubble__action--icon fk-icon fk-icon-trash';
        remove.setAttribute('data-icon', 'trash');
        remove.setAttribute('title', 'Remove');
        remove.addEventListener('click', () => {
            input.value = '';
            this.executeCommand(button, '');
        });
        wrap.appendChild(remove);

        const confirm = () => this.executeCommand(button, input.value);
        const close = () => this.closeExpandedButton();
        input.addEventListener('keyup', ev => {
            if (ev.keyCode === 13) confirm();
            if (ev.keyCode === 27) close();
        });
        input.addEventListener('keydown', ev => {
            if (ev.keyCode === 8 && !input.value.length) {
                ev.preventDefault();
                input.value = '';
                this.executeCommand(button, '');
            }
            if ((ev.metaKey || ev.ctrlKey) && String.fromCharCode(ev.keyCode) === 'K') close();
        });

        setTimeout(() => {
            const value = this.getButtonValue(button);
            input.focus();
            if (value) {
                input.value = value;
                input.select();
            }
        }, 200);

        return wrap;
    }

    // ---------- positioning ----------

    reposition() {
        const bubbleEl = this.el;
        if (!bubbleEl) return;
        const bubbleCoords = bubbleEl.getBoundingClientRect();
        if (!bubbleCoords.width) return;

        const coords = this.selectionCoords;
        let left = coords.left - bubbleCoords.width / 2 + coords.width / 2;

        if (left < 0) {
            left = 0;
        } else if ((left + bubbleCoords.width) > window.innerWidth) {
            left = window.innerWidth - bubbleCoords.width;
        }

        let top;
        if (this.editor.context.isMobile) {
            top = window.scrollY;
        } else {
            top = coords.top - bubbleCoords.height - 10;
        }

        bubbleEl.style.top = top + 'px';
        bubbleEl.style.left = left + 'px';
    }

    // ---------- pagination ----------

    get hasPrev() { return this.startButton > 0; }
    get hasNext() { return this.buttons.length > (this.startButton + this.maxButtons); }

    nextPage() {
        this.startButton = Math.min(
            this.buttons.length - this.maxButtons,
            this.startButton + this.maxButtons);
    }

    prevPage() {
        this.startButton = Math.max(0, this.startButton - this.maxButtons);
    }

    // ---------- button actions ----------

    expand(button) {
        if (button.onExpand) {
            this.expandButton(button);
        }
        this.expandedButton = button;
    }

    triggerButton(button) {
        // equivalent of the old fk-button handleClick (Tab+Enter path)
        this.restoreSelection();
        if (button.type) {
            this.expand(button);
        } else if (button.command) {
            this.executeCommand(button);
        } else {
            console.warn('%s button is missing a command property', button.title);
        }
    }

    preventMouseDown($event) {
        if (!/fk-bubble__link-prompt__input/.test($event.target.className)) {
            $event.preventDefault();
        }
    }

    restoreSelection() {
        return this.plugin.restoreSelection();
    }

    saveSelection() {
        return this.plugin.saveSelection();
    }

    expandButton(button) {
        button.onExpand(this.editor);
        return this.saveSelection();
    }

    toggleButton(buttonName) {
        this.buttons.forEach(button => {
            if (button.name === buttonName) {
                if (this.expandedButton === button) {
                    this.closeExpandedButton();
                } else {
                    this.expand(button);
                }
            }
        });
    }

    getFocusedButton() {
        return this.buttons.filter(b => b.focused === true)[0];
    }

    updateIndex(index) {
        this.buttonIndex = this.buttonIndex + index;
        this.buttonIndex = this.buttonIndex >= this.buttons.length ? 0 : this.buttonIndex;
        this.buttonIndex = this.buttonIndex < 0 ? this.buttons.length - 1 : this.buttonIndex;
        this.buttons.forEach((button, i) => { button.focused = i === this.buttonIndex; });
        this.render();
    }

    getButtonValue(button) {
        return button.getValue(this.editor);
    }

    closeExpandedButton() {
        if (this.expandedButton && this.expandedButton.onCollapse) {
            const value = this.getButtonValue(this.expandedButton);
            this.restoreSelection();
            this.expandedButton.onCollapse(this.editor, value);
        }
        this.expandedButton = null;
    }

    executeCommand(button, value) {
        const editor = this.editor;
        // Place the selection back into the editor right before executing the command
        this.plugin.restoreSelection();
        if (button.command.constructor === String) {
            editor.commands.execute.apply(editor.commands, button.command.split(':'), value);
        } else {
            button.command(editor, value);
        }
        this.expandedButton = null;
        this.saveSelection();
        this.plugin.updateAvailableButtonStates(button);
    }

    // ---------- events ----------

    bindEvents() {
        this.el.addEventListener('mousedown', ev => this.preventMouseDown(ev));
    }
}

export default BubbleView;
