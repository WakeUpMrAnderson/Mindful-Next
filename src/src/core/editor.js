// Lodash dependencies
import debounce from 'lodash/debounce';
import defer from 'lodash/defer';
import forEach from 'lodash/forEach';
import upperFirst from 'lodash/upperFirst';
import EventEmitter from 'eventemitter3';
import ElementObserver from './element-observer';
import getDefaultNormalizations, {getNormalizationCallbacks} from './normalizations';
import {hideSelectionColor, restoreSelectionColor} from './range/toggle-selection-color';
import History from './history';
import Commands from './commands';
import Selection from './selection';
import Behaviors from './behaviors'; // TODO: remove
import Dom from './dom';
import keys from './keys/keys';
import CascadingPropertySet from './cascading-property-set';
import cleanWhitespace from './dom/clean-whitespace';
import isWithinElement from './range/is-within-element';
import tap from './window/tap';
import disableObjectResizing from './window/disable-object-resizing';
import defaultConfig from './defaults/config';
import isMobile from './window/is-mobile';
import {usePlugin} from './util';

let soul = [
    'Don’t be shy…',
    'Type something…',
    'What are you waiting for?',
    'What’s on your mind?',
    'Type something…',
    'You can do it…',
    'Start here…',
    '“We are all apprentices in a craft where no one ever becomes a master.” — Hemingway',
    '“The first sentence can’t be written until the final sentence is written.” — Joyce Carol Oates, WD',
    '“If it sounds like writing, I rewrite it.” — Elmore Leonard',
    '“Writers live twice.” — Natalie Goldberg',
    '“A word after a word after a word is power.” — Margaret Atwood',
    '“One day I will find the right words, and they will be simple.” — Jack Kerouac',
    '“If you don’t have time to read, you don’t have the time to write.” — Stephen King',
    '“We write to taste life twice, in the moment and in retrospect.” — Anaïs Nin',
    '“The scariest moment is always just before you start.” — Stephen King',
    '“We don’t write to be understood; We write to understand.” — Robert Day-Lewis'
];

import debug from 'debug';
const log = debug('Editor');


/**
 * The list of events captured by the editor element
 * @static
 */
const CAPTURED_EVENTS = ['keyup', 'keydown', 'mousedown', 'input', 'focus', 'blur', 'drop', 'paste'];

/**
 * The class name that is given to the active element and its ancestor node
 * @static
 */
const ACTIVE_CLASSNAME = 'fk-active';

/**
 * Class representing an editable document region
 * @extends EventEmitter
 */
class Editor extends EventEmitter {
    /**
     * Create a new editor instance
     * @public
     * @param el
     * @param currentDocument {Document}
     * @param config {Object}
     * @returns {Editor}
     */
    constructor(el, currentDocument, config = {}) {
        super();

        this.el = el;

        this.document = currentDocument;

        this.config = {...defaultConfig, ...config};

        var self = this;


        // initialize commands
        this.commands = new Commands(this);
        // set behavior class
        this.behaviors = new Behaviors(this);
        // load selection API
        this.selection = new Selection(this);

        this.properties = new CascadingPropertySet(
            this.config.properties,
            this.config.rules
        );

        // List of regular expressions to match CSS classes that the normalizer should skip.
        // The 2016 source carried literal slashes on the first/last patterns
        // ("/selection\-marker", "fk\-iframe\-wrapper/"), which made those two
        // alternatives unmatchable against real class attributes — the observer
        // processed selection markers and iframe wrappers instead of skipping
        // them (they are separately excluded downstream, which masked the bug).
        let ignoredClasses = ["selection-marker", "fk-ui.*", "fk-iframe-wrapper"];

        // default normalizations
        this.normalizations = getDefaultNormalizations(this); // TODO: retrieve normalizations from config

        this.context = {
            /**
             * Reference to the current element
             */
            element: this.el,

            /**
             * Reference to the previous sibling
             */
            previousSibling: this.el,

            /**
             * Reference to the closest element which matches a rule
             */
            closestElementWithRules: this.el,

            /**
             * Reference to the ancestor element, which will be the point
             * of reference for the UI position, serialisation opersations
             */
            ancestorElement: this.el,

            /**
             * The properties of the current block element
             */
            properties: {},

            isMobile: isMobile() // TODO: move to Document
        };

        /**
         * Load all plugins. Allow them to hook into normalizations API
         */
        if (config && config.plugins) {
            config.plugins.forEach(this.use.bind(this));
        }
        // register and lock normalizations
        this.registerNormalizations(this.normalizations, ignoredClasses.concat(this.config.ignoredClasses));

        // Scoped DOM api
        this.dom = new Dom(this);

        // Bind event event listeners on editor node
        CAPTURED_EVENTS.forEach(eventName => {
            let eventHandler = 'on' + eventName.charAt(0).toUpperCase() + eventName.slice(1);
            this.el.addEventListener(eventName, ev => {
                this.emit(eventName, ev, this);
                if (this[eventHandler])
                    this[eventHandler].call(this, ev);
            });
        });
        this.on('mouseup', this.onMouseup.bind(this));
        this.on('touchstart', this.onMousedown.bind(this));

        // Initialize history
        this.history = new History(); // TODO: pass the stack size

        var SAVE_DEBOUNCE_DURATION = 500; // TODO: retrieve this from an editor setting

        var saveState = function (cmd) {
            if(cmd && cmd === 'link') return;
            this.selection.saveSelection(); // Place selection markers
            var content = this.el.innerHTML;
            this.history.checkpoint(content);
            this.emit('history.checkpoint', this.history);
            this.selection.restoreSelection(); // Remove selection markers
        };

        // Deferring this allows us to get the initial cursor position
        this.on('focus', function () {
            return defer(saveState.bind(this));
        });

        this.on('contentChange', debounce(saveState, SAVE_DEBOUNCE_DURATION));
        this.on('commandExecuted', debounce(saveState, SAVE_DEBOUNCE_DURATION));

        // TODO: refactor
        var loadInto = function (group) {
            return function (v, k) {
                return self[group].register(k, v)
            }
        };
        // initialize document for editing
        this.prepareForEditing();

        forEach(require('./commands/formatBlock'), loadInto('commands'));
        forEach(require('./commands/insertList'), loadInto('commands'));
        forEach(require('./commands/boldItalicStrikethrough'), loadInto('commands'));
        forEach(require('./commands/link'), loadInto('commands'));
        forEach(require('./commands/alignMedia'), loadInto('commands'));
        forEach(require('./commands/undoRedo'), loadInto('commands'));
        forEach(require('./commands/blockSave'), loadInto('commands'));

        var addParagraphAfterAncestor = require('./behaviors/addParagraphAfterAncestor');
        var indent = require('./behaviors/indent');
        var outdentEmptyListItem = require('./behaviors/outdentEmptyListItem');

        var deleteMediaItem = require('./behaviors/deleteMediaItem');
        var navigateBackwards = require('./behaviors/navigateBackwards');
        var navigateForwards = require('./behaviors/navigateForwards');
        var navigateUpAcrossVoid = require('./behaviors/navigateUpAcrossVoid');
        var navigateDownAcrossVoid = require('./behaviors/navigateDownAcrossVoid');
        var detectVoidElement = require('./behaviors/detectVoidElement');
        var normalizeDeleteKey = require('./behaviors/normalizeDeleteKey');
        var restoreParagraph = require('./behaviors/restoreParagraph');
        var addCaption = require('./behaviors/addCaption');

        this.behaviors.register('indent', indent);

        this.behaviors.register('addParagraphAfterAncestor', addParagraphAfterAncestor);
        this.behaviors.register('deleteMediaItem', deleteMediaItem);
        this.behaviors.register('navigateForwards', navigateForwards);
        this.behaviors.register('navigateBackwards', navigateBackwards);
        this.behaviors.register('navigateUpAcrossVoid', navigateUpAcrossVoid);
        this.behaviors.register('navigateDownAcrossVoid', navigateDownAcrossVoid);
        this.behaviors.register('detectVoidElement', detectVoidElement);
        this.behaviors.register('normalizeDeleteKey', normalizeDeleteKey);
        this.behaviors.register('restoreParagraph', restoreParagraph);
        this.behaviors.register('addCaption', addCaption);
        this.behaviors.register('outdentEmptyListItem', outdentEmptyListItem);

        defer(() => {
            this.emit('init');
            log('Created new Editor instance', this);
        });

        return this;
    }


    /**
     * Make the element editable
     * @private
     * @return void
     */
    prepareForEditing() {
        // TODO: make static?

        // TODO: Remember the element's initial attributes
        // this.el.attributes

        // Removes whitespace text nodes at the very end or beginning of the element
        cleanWhitespace(this.el);

        // Get rid of resizing elements on Firefox and IE11.
        disableObjectResizing(this.el);

        // Set content editable and listen for basic input
        this.el.setAttribute('contentEditable', true);

        // Disable spellchecking (TODO: read from config)
        this.el.setAttribute('spellcheck', false);

        if (this.config.placeholder) {
            this.el.setAttribute('placeholder', this.config.placeholder);
        }

        // Set a class to allow CSS styling
        this.el.classList.add('fk-editable'); // TODO: rename to `fk-editor`

        this.mutationObserver.loadDocument();

    }

    /**
     * Destroys the editor instance
     * @return void
     * @public
     */
    destroy() {
        // Remove the fk-editable class
        this.el.classList.remove('fk-editable');

        // TODO: restore the element's attributes
        // TODO: Unbind all event DOM listeners

    }


    /**
     * @param pluginInstanceOrList
     * @public
     * @returns {*}
     */
    use(pluginInstanceOrList) {
        return usePlugin(pluginInstanceOrList, this);
    }

    /**
     * Focus the editor element
     * @return void
     * @public
     */
    focus() {
        // TODO: user feature detection in Document class
        let userAgent = window.navigator.userAgent;
        if (userAgent.match(/iPad/i) || userAgent.match(/iPhone/i)) {
            return this.el.focus()
        }
        // Remember scroll offset to prevent IE11 from flickering
        var x = window.pageXOffset;
        var y = window.pageYOffset;
        this.el.focus();
        window.scrollTo(x, y);
    };


    /**
     *
     * @param normalizationType
     * @param callback
     */
    registerNormalization(type, fnName, callback){
        this.normalizations[type].add(fnName, callback, {at: "start"});
    }

    /**
     *
     * @param normalizations
     * @param ignoredClasses
     */
    registerNormalizations(normalizations, patterns) {
        let callbacks = getNormalizationCallbacks(this.normalizations, this);
        let ignoredClasses = new RegExp(patterns.join('|'));
        this.mutationObserver = new ElementObserver(this.el, callbacks, ignoredClasses);
    }


    /**
     * Set the HTML content of the editor
     * @public
     * @param html
     */
    setHTML(html) {
        this.history.reset();
        this.el.innerHTML = html;
        cleanWhitespace(this.el);
        this.selection.update();
    }

    /**
     * Return the content of the editor as HTML
     * @public
     * @returns {String}
     */
    getHTML() {
        // TODO: Strip p.fk-inlineMenu-offCanvas as well!
        // NOTE: the 2016 `/<div.*fk-ui.*><\/div>/ig` strip was removed —
        // the greedy .* could eat everything from the first fk-ui div to
        // the last </div>, and UI chrome lives in ui.el outside the
        // article, so there is nothing legitimate for it to match.
        return this.el.innerHTML
            .trim()
            .replace(/\s*fk\-active\s*/g, '')
            .replace(/\s+class=""/, '');
    }


    updateContext(el) {
        if (!el) {
            return;
        }
        // TODO: Figure out who updates `this.context.element` in Firefox
        if (el !== this.context.element || el.previousSibling !== this.context.previousSibling) {
            restoreSelectionColor();

            if (el != this.el && this.el.contains(el)) {
                this.context.element = el;
                this.context.previousSibling = el.previousSibling;
                this.context.closestElementWithRules = this.dom.getClosestElementWithRules(el);
                this.context.ancestorElement = this.dom.getAncestorElement(el);
                this.context.properties = this.properties.forElement(this.context.closestElementWithRules).all();
                this.updateActiveClassName(this.context);
                this.emit('contextChange', el);
            }

            if (this.context.properties.hidesCursor) {
                this.selection.selectNode(this.context.closestElementWithRules);
                hideSelectionColor();
            }
        }
    }


    /**
     * Checks if the editor instance is the currently active editor in the document
     * @returns {boolean}
     */
    isActive() {
        return this.document.activeEditor === this;
    }


    /**
     * Set the active classname to the active element
     * @param {Object} context
     */
    updateActiveClassName(context) {
        var activeNodes = this.el.querySelectorAll('.' + ACTIVE_CLASSNAME);
        for (var i = 0; i < activeNodes.length; i++) {
            activeNodes[i].classList.remove(ACTIVE_CLASSNAME);
            if (!activeNodes[i].classList.length) {
                activeNodes[i].removeAttribute('class');
            }
        }
        if (context.closestElementWithRules) {
            context.closestElementWithRules.classList.add(ACTIVE_CLASSNAME);
            context.ancestorElement.classList.add(ACTIVE_CLASSNAME);
        }
    }

    /**
     * Keyup event handler
     * @param ev
     */
    onKeyup(ev) {
        // if it’s this editor’s instance
        if (ev.target === this.el) {
            var el = this.selection.getCurrentElement();

            if(isWithinElement(this.selection.range, el)){
                this.updateContext(el);
            }
        }
    }

    /**
     * Keydown event handler
     * @param ev
     * @returns {*}
     */
    onKeydown(ev) {

        /*
         * If a command is executed or if a behavior has already cancelled the
         * event, we do not continue execution.
         */
        if (ev.defaultPrevented || this.commands.executeKeyboardShortcut(ev)) {
            return ev.preventDefault();
        }

        /*
         * Don’t allow to kill placeholder
         */
        if((ev.keyCode === 8 || ev.keyCode === 46) && this.context.closestElementWithRules.hasAttribute('fk-placeholder')){
            return ev.preventDefault();
        }

        /*
         * If the selection is WITHIN a given element node, we can safely let the browser handle the selection.
         * Otherwise we need to fix the selection by setting the start and end boundaries (FF style).
         */
        if (isWithinElement(this.selection.range, this.context.closestElementWithRules) &&
            this.selection.range.commonAncestorContainer !== this.el) {
            var keyName = keys.getKeyByCode(ev.keyCode);
            var action = this.context.properties['on' + upperFirst(keyName)];
            var keydown = this.context.properties.onKeydown;
            var el = this.context.element;

            if (typeof keydown === 'function') {
                keydown.apply(this, [ev, el, this]);
            }
            // TODO: add a comment to explain why the repetition is necessary
            if (typeof action === 'function') {
                action.apply(this, [ev, el, this]);
            }

            else if (action) {
                return this.behaviors.trigger(action, ev, this.context.closestElementWithRules);
            }
            return;
        } else if (keys.affectsContent(ev) && this.el === ev.target) {
            return this.selection.fix();
        }

        /*
         * After the overlapping change has happened we need to make sure the `Range` is inSync and focus the
         * contentEditable if the element collapsed in the meantime.
         */
        defer((editor) => {
            if (!keys.affectsContent(ev)) {
                return;
            }
            this.selection.update();
            var el = this.selection.getCurrentElement();
            if (el) {
                this.updateContext(el);
            }
        });
    }

    /**
     * Input event handler
     */
    onInput() {
        /*
         * Ensures a lasting cursor when the whole document is deleted
         */
        defer(()=>{
            let c = this.el.firstElementChild;
            if((!this.el.innerHTML.length || (c && !c.textContent.length && !c.nextElementSibling && !this.el.textContent.length))){
                /*
                 * delete all child nodes
                 */
                while(this.el.firstElementChild){
                    this.el.removeChild(this.el.firstElementChild);
                }
                /*
                 * create p node
                 */
                let p = document.createElement('p');
                p.setAttribute('fk-placeholder', soul[Math.floor(Math.random() * soul.length)]);
                this.el.appendChild(p);
                /*
                 * delete all child nodes
                 */
                this.selection.placeCaret(this.el.firstElementChild, {at: 'start'});
                return this.updateContext(this.el.firstElementChild);
            }
            if(this.el.firstElementChild.nextElementSibling){
                this.el.firstElementChild.nextElementSibling.removeAttribute('fk-placeholder');
            }
            this.el.firstElementChild.removeAttribute('fk-placeholder');
        });

        this.emit('contentChange');
    }

    /**
     * Focus event handler
     * @param ev
     */
    onFocus(ev) {
        this.document.setActiveEditor(this);
    }

    /**
     * Blur event handler
     * @param ev
     */
    onBlur(ev) {
        this.document.setActiveEditor(null);
        restoreSelectionColor();
    };


    /**
     * Mousedown event handler
     * @param ev
     */
    onMousedown(ev) {
        if (ev.target === this.el) {
            defer(() => {
                var el = this.selection.getCurrentElement();
                return this.updateContext(el);
            });
        }

        this.focus();

        if (this.el.contains(ev.target)) {
            this.updateContext(ev.target);
        }
    }

    /**
     * Drop Event handler
     * @param ev
     */
    onDrop(ev) {
        if (ev.defaultPrevented) {
            return false;
        }

        // only allow dropping on ancestor elements
        var isAncestorDropTarget = ev.target.parentNode === this.el;
        if (!isAncestorDropTarget) {
            ev.preventDefault();
        }

        defer(() => {
            // Keep track of the current component reference
            var activeEl = document.querySelector('.' + ACTIVE_CLASSNAME);
            this.updateContext(activeEl);
            this.dom.insertAfter(activeEl, this.context.ancestorElement);
        });
    }

    /**
     * Mouseup event handler
     * @param ev
     */
    onMouseup(ev) {
        this.selection.update();
    }

}

/**
 * Alias for Editor#setHTML
 * @deprecated
 */
Editor.prototype.setContent = Editor.prototype.setHTML;

/**
 * Alias for Editor#getHTML
 * @deprecated
 */
Editor.prototype.getContent = Editor.prototype.getHTML;

export default Editor;
