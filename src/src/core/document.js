import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';
import forEach from 'lodash/forEach';
import find from 'lodash/find';
import includes from 'lodash/includes';
import {usePlugin} from './util';
import Editor from './editor';
import UI from './ui/ui';
import EventEmitter from 'eventemitter3';
import SelectionObserver from './window/selectionchange';
var tap = require('./window/tap');


import debug from 'debug';
const log = debug('Document');

// Delay for events that fire rapidly, like resize or scroll
const DEBOUNCE_DELAY = 30;

/**
 * The Document class is only instantiated once for every HTML document and it is responsible for:
 * - Keeping track of the different Editor instances on the page
 * - Listening to global events and delegating them to the active Editor
 */
class Document extends EventEmitter {
    /**
     *
     */
    constructor() {
        super();
        this.editors = [];
        this.activeEditor = null;
        this.lastActiveEditor = null;
        this.ui = new UI(this);
        this.bindEvents();
        this.detectFeatures();
        log('Created new Document instance, %o', this);
    }

    /**
     * Factory method
     * @returns {Document}
     */
    static create() {
        return new Document();
    }

    /**
     * Editor factory method
     * @param element {HTMLElement}
     * @param options {Object}
     * @returns {Editor}
     */
    createEditor(element, options) {
        let existingEditor = find(this.editors, (editor) => {
            return element === editor.el;
        });
        if (existingEditor) {
            console.warn("%o already has a FrontKit Editor instance attached to it", element);
            return existingEditor;
        }
        var editor = new Editor(element, this, options);

        this.editors.push(editor);

        return editor;
    }

    /**
     *
     * @param selectorOrElements {string|NodeList}
     * @returns {number}
     */
    destroyEditor(selectorOrElements) {
        let hostElements = selectorOrElements;
        let destroyedEditors = 0;
        if (selectorOrElements.constructor === String) {
            hostElements = document.querySelectorAll(selectorOrElements);
        }
        forEach(this.editors, function (editor) {
            if (includes(hostElements, editor.el)) {
                editor.destroy();
                // TODO: update (splice) this.editors
                destroyedEditors++;
            }
        });
        return destroyedEditors;
    }

    /**
     * Binds global events that are then delegated to the active editor instance.
     * @returns void
     */
    bindEvents() {
        let delegate = this.delegateEventToActiveEditor.bind(this);

        document.body.addEventListener('mouseup', delegate);
        window.addEventListener('click', delegate);

        // Debounced events
        window.addEventListener('resize', debounce((ev) => {
            delegate(ev);
            if(this.lastActiveEditor !== this.activeEditor){
               this.lastActiveEditor.emit('resize', ev)
            }
        }, DEBOUNCE_DELAY));

        window.addEventListener('scroll', debounce((ev) => {
            delegate(ev);
            if(this.lastActiveEditor !== this.activeEditor){
               this.lastActiveEditor.emit('scroll', ev)
            }
        }, DEBOUNCE_DELAY));


        window.addEventListener('mousemove', throttle(delegate, DEBOUNCE_DELAY));

        tap.on(window, delegate);

        let self = this;
        new SelectionObserver({
            selectionChange(ev, range){
                if (self.activeEditor) {
                    self.activeEditor.emit('selectionchange', ev, range);
                }
            },
            selectionChangeEnd(ev, range){
                if (self.activeEditor) {
                    self.activeEditor.emit('selectionchange.end', ev, range);
                }
            }
        });
    }

    /**
     * Trigger an event on the editor's EventEmitter instance
     * @param ev {Event}
     */
    delegateEventToActiveEditor(ev) {
        let eventName = ev.type;
        if (this.activeEditor) {
            this.activeEditor.emit(eventName, ev);
        }
    }

    /**
     * Update the reference to the active Editor.
     * @param editor {Editor} - The editor instance
     */
    setActiveEditor(editor) {
        this.activeEditor = editor;
        this.emit('editorChange', editor);
        if(editor){
            this.lastActiveEditor = editor;
        }
    }

    /**
     * Experiment: Add feature detection classes to the `<html>` element
     */
    detectFeatures(){
        var userAgent = window.navigator.userAgent;
        if (userAgent.match(/iPad/i) || userAgent.match(/iPhone/i)) {
            document.documentElement.classList.add('fk-touch-device-with-native-bubble');
        }
    }

    /**
     * @param pluginInstanceOrList
     * @public
     * @returns this
     */
    use(pluginInstanceOrList){
        return usePlugin(pluginInstanceOrList, this);
    }
}

export default Document;
