import BubbleView from './fk-bubble';
import rect from '../../core/ui/rect';
import reduce from 'lodash/reduce'
import map from 'lodash/map'
import defaultButtons from './defaultButtons';


class BubblePlugin {
    /**
     * Constructor
     * @param {Object} options
     */
    constructor(options = {}) {
        let defaultConfig = {
            buttons: defaultButtons
        }
        this.lastTriggeredButton = false;
        this.options = {...defaultConfig, ...options};
    }

    /**
     * Initialise the plugin
     * @param {Editor} editor - The active editor instance
     */
    init(editor) {
        this.registeredButtons = this.options.buttons;
        this.editor = editor;
        this.bindEvents(editor);
        this.createHostElement(editor.document.ui.el);
        this.bubbleView = new BubbleView({
            data: {
                maxButtons: editor.context.isMobile ? 10 : 7
            },
            editor: editor,
            plugin: this,
            el: '.fk-bubble'
        });
        this.bubbleView.registeredButtons = this.registeredButtons;
        editor.on('ui.bubble.toggleButton', (button) => this.bubbleView.toggleButton(button));
    }


    /**
     * Create the bubble host element
     */
    createHostElement(uiEl) {
        this.hostElement = document.createElement('div');
        this.hostElement.className = "fk-bubble";
        uiEl.appendChild(this.hostElement);
        return this.hostElement;
    }

    /**
     * Listen to events emitted by editor
     */
    bindEvents(editor) {
        editor.on('ui.bubble.hide', this.hide.bind(this));
        editor.on('blur', this.hide.bind(this));
        editor.on('keydown', this.handleKeyDown.bind(this));
        editor.on('resize', this.updateUIPosition.bind(this));
        editor.on('ui.dots.click', this.handleSelectionchange.bind(this));
        if (editor.context.isMobile) {
            editor.on('selectionchange', this.handleSelectionchange.bind(this));
        } else {
            editor.on('selectionchange.end', this.handleSelectionchange.bind(this));
        }
        editor.on('contextChange', this.handleContextChange.bind(this));
        editor.on('commandExecuted', (ev) => {
            this.updateAvailableButtons(ev, editor.selection.range);
        });
    }



    /**
     * Allows for a tabbable bubble interface
     */
    handleKeyDown(ev){
        if(ev.keyCode === 9 && !this.editor.selection.range.collapsed){
            ev.preventDefault();
            this.bubbleView.updateIndex(ev.shiftKey ? -1 : +1);
            this.bubbleView.isInTabbedMode = true;
        }
        if(ev.keyCode === 13 && this.bubbleView.isInTabbedMode){
            let b = this.bubbleView.getFocusedButton();
            ev.preventDefault();
            if(b){
                this.lastTriggeredButton = b;
                this.bubbleView.triggerButton(b);
            }
        }
    }

    /**
     * Update the UI position when the editor context changes
     */
    handleContextChange() {
        if (this.editor.context.properties.hidesCursor) {
            this.show();
            this.updateAvailableButtons();
        }
        this.updateUIPosition();
    }

    /**
     * Show the bubble
     * @return void
     */
    show() {
        this.bubbleView.isVisible = true;
        this.updateUIPosition();
        this.editor.emit('ui.bubble.show', this);
        document.addEventListener('touchmove', this.updateUIPosition.bind(this))
    }

    /**
     * Hide the bubble
     * @return void
     */
    hide(ev) {
        if ((ev.type === 'blur'  || ev.type === 'focus') && this.bubbleView.expandedButton) {
            return;
        }


        if (this.bubbleView.expandedButton) {
            this.bubbleView.closeExpandedButton('hide');
        }

        /*
         * This part ensures the tab experience resets after
         * the bubble disappears.
         */
        this.lastTriggeredButton = false;
        this.bubbleView.isInTabbedMode = false;
        this.bubbleView.buttonIndex = -1;
        this.bubbleView.buttons.forEach((b)=>{
            b.focused = false;
        });
        this.bubbleView.render();

        this.bubbleView.isVisible = false;
        this.bubbleView.expandedButton = null;
        document.removeEventListener('touchmove', this.updateUIPosition.bind(this))
    }

    /**
     * Updates the position of the UI
     */
    updateUIPosition() {
        if (this.bubbleView.isVisible) {
            this.bubbleView.selectionCoords = this.getAnchorArea();
        }
    }

    /**
     * Returns the coordinates where the bubble should be anchored
     * @return
     */
    getAnchorArea() {
        // Retrieve the editor context
        let context = this.editor.context;

        // When the element hides the cursor, the range is collapsed. This is why we
        // need to use the element and not the range to generate an anchor point.
        let elementOrRange = context.properties.hidesCursor ?
            context.closestElementWithRules : window.getSelection().getRangeAt(0);

        if (this.bubbleView.expandedButton){
            elementOrRange = document.querySelector('.fk-selected-link');
        }
        if(elementOrRange){
            this.lastElementOrRange = elementOrRange;
        } else {
            elementOrRange = this.lastElementOrRange;
        }

        const area = rect(elementOrRange);

        // Multi-line selections: the union rect spans the full column width
        // (block selections extend to the line end), so centering on it
        // drifts the bubble toward the screen edges. Anchor above the FIRST
        // line of the selection instead — and when that line's first rect
        // is a full-width BLOCK box (selectNodeContents on a list: the
        // client rects interleave full-width line boxes with the narrow
        // text rects), anchor on the narrowest rect of the line band, i.e.
        // the selected text extent.
        if (elementOrRange instanceof Range) {
            const rects = [...elementOrRange.getClientRects()].filter(r => r.height || r.width);
            if (rects.length > 1) {
                const band = rects.filter(r => r.top - rects[0].top < rects[0].height);
                const container = elementOrRange.startContainer;
                const containerEl = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
                const blockWide = containerEl && rects[0].width >= containerEl.clientWidth - 2;
                const first = blockWide
                    ? band.reduce((a, b) => (b.width < a.width ? b : a), band[0])
                    : rects[0];
                return {
                    top: first.top + window.pageYOffset,
                    bottom: first.bottom + window.pageYOffset,
                    left: first.left + window.pageXOffset,
                    right: first.right + window.pageXOffset,
                    height: first.height,
                    width: first.width
                };
            }
        }

        return area;
    }

    /**
     * Add a button the list of registered buttons
     * @param button
     */
    registerButton(button) {
        this.registeredButtons.push(button);
        return this;
    }

    /**
     * Get the current selection or an empty object (useful for comparisons)
     * TODO: Extract into module
     * @return {*}
     */
    getRange() {
        var sel = window.getSelection();
        return sel.rangeCount ?
            sel.getRangeAt(0).cloneRange() :
            { collapsed: true };
    }

    /**
     * React to selection change events
     * @param ev
     * @param range
     * @return void
     */
    handleSelectionchange(ev) {
        this.savedRange = this.getRange();

        if (!this.savedRange.collapsed) {
            this.updateUIPosition();
        }

        // When the selection collapses, browsers will take  up to 20ms
        // (empirical value, measured in IE10) to update the `collapsed`
        // property of the range.
        setTimeout(() => {
            if (this.getRange().collapsed) {
                return this.hide(ev);
            }
            // do not update available buttons on tab key!
            if(ev.keyCode === 9 || ev.keyCode === 16) return;
            this.updateAvailableButtons(ev, this.savedRange);
        }, 20);

    }

    /**
     * Checks if two lists contain the same buttons
     * @param listA
     * @param listB
     * @param compareProp - The property to extract for the comparison
     * @returns {boolean}
     */
    sameButtons(listA, listB, compareProp = 'icon') {
        return map(listA, compareProp).join('') === map(listB, compareProp).join('');
    }

    /**
     * Restores the selection
     */
    restoreSelection() {
        if (this.savedRange) {
            let selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(this.savedRange);
        }
    }

    /**
     * Saves the selection
     */
    saveSelection() {
        var sel = window.getSelection();
        if (sel.rangeCount) {
            this.savedRange = sel.getRangeAt(0).cloneRange();
        }
    }


    /**
     * Returns the list of available buttons for current context
     * @param {Range} range
     * @returns {Array}
     */
    getAvailableButtons(range) {
        var closestElementWithRules = this.editor.context.closestElementWithRules;
        var allowedCommands = this.editor.context.properties.allowedCommands;
        this.selectionType = this.editor.context.properties.hidesCursor ?
            'full' : this.editor.selection.getType(range);

        if (!closestElementWithRules || !allowedCommands) {
            return [];
        }

        return reduce(this.registeredButtons, (buttons, button) => {
            // set initial object property to false so that funny VUE can observe it…
            button.focused = this.lastTriggeredButton === button;
            // Check if the element allows the command
            if (allowedCommands.indexOf(button.name) > -1) {
                // Check if the button supports the current selection type
                let selectionType = button.selectionType ? button.selectionType : ['full'];
                if (selectionType.indexOf(this.selectionType) > -1) {

                    // If the button doesn't have an `isVisible` predicate or, if it
                    // has one which returns true, keep it
                    if (!button.isVisible ||
                        button.isVisible && button.isVisible(this.editor.context)) {
                        // Update the `active` property while we're at it
                        button.active = !!button.isActive(this.editor);
                        buttons.push(button)
                    }
                }
            }
            return buttons;
        }, []);
    }

    /**
     * Updates the list of available buttons for the given range and hides the bubble
     * if there aren't any
     * @param ev
     * @param range
     */
    updateAvailableButtons(ev, range){
        let availableButtons = this.getAvailableButtons(range);
        if (availableButtons.length){
            if (!this.sameButtons(this.bubbleView.buttons, availableButtons)){
                this.bubbleView.buttons = availableButtons;
                this.bubbleView.startButton = 0;
            } else {
                // same buttons, but active/focused flags were just mutated
                this.bubbleView.render();
            }
            return this.show();
        } else {
            return this.hide(ev);
        }
    }

    /**
     * Update the states of the buttons
     */
    updateAvailableButtonStates(b) {
        this.bubbleView.buttons.forEach((button, i) => {
            button.active = !!button.isActive(this.editor);
            if(b === button){
                this.bubbleView.buttonIndex = i;
                button.focused = true;
            }
        });
        this.bubbleView.render();
    }
}


export default BubblePlugin;
