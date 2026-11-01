var throttle        = require('lodash/throttle');
var defer           = require('lodash/defer');
var keys            = require('../../core/keys/keys');
var rect            = require('../../core/ui/rect');
var styles          = require('./dots.scss');

function Dots( options) {
    this.options = options
}

Dots.prototype.init = function(editor){
    return editor.document.ui.extend('dots', {
        className: 'fk-ui-dots fk-hide',
        visible: false,
        blockHighlight: false,
        initialize: function(){
            // prevent initial blur
            editor.preventBlur = true;

            this.editor = editor;

            /*
             *  Bind all active editor events to DOTS.
             */
            editor.on('resize',             this.updateUIPosition.bind( this ) );
            editor.on('commandExecuted',    this.updateUIPosition.bind( this ) );
            editor.on('mousemove',          throttle( this.mousemoveHandler.bind( this ), 50 ) );
            editor.on('inlineMenuOpen',     this.highlightAll.bind( this ));
            editor.on('inlineMenuHide',     this.resetHighlight.bind( this ));
            editor.on('blur',               this.hide.bind( this ));
            editor.on('focus',              this.show.bind( this ));
            editor.on('keyup',              this.handleKeyup.bind( this ));
            editor.on('selectionchange',    throttle( this.highlight.bind( this ), 100 ) );
            editor.on('contextChange',      this.updateUIPosition.bind( this ));
            /*
             *  Append DOTS to DOM
             */
            this.render();
        },
        events: {
            'touchstart': 'handleClick',
            'mousedown': 'handleClick'
        },
        handleEditorTouch: function( ev ){
            this.show();
            this.highlight();
        },
        render: function(){
            this.el.innerHTML = '<span></span><span></span><span></span>';
            this.ui.el.appendChild( this.el );
        },
        handleKeyup : function(ev){
            if(!this.editor.context.ancestorElement.textContent.length){
                return this.show();
            }
            if (ev.keyCode !== 32 && this.editor.selection.range.collapsed) this.hide();
        },
        updateState: function(){
            this.updateUIPosition();
            this.editor.context.properties.hidesCursor ?  this.highlightAll() : this.resetHighlight();
        },
        mousemoveHandler: function ( ev ){
            if ( this.editor.isActive() ) return this.show();
        },
        hide: function(){
            if ( this.visible ){
                this.el.classList.add( 'fk-hide' );
                this.el.classList.remove( 'fk-show' );
            }
            this.visible = false;
        },
        show: function(ev){
            if ( !this.visible && this.document.activeEditor && this.editor.context.closestElementWithRules ){
                this.el.classList.add( 'fk-show' );
                this.el.classList.remove( 'fk-hide' );
                this.visible = true;
            }
        },
        highlight: function( ev, range ){
            if ( this.editor.context.properties.hidesCursor ) return this.highlightAll();
            // selectionchange can be emitted without a range (e.g. when the
            // selection left the editor) — bail instead of crashing the
            // throttled handler and every listener after it.
            if ( !range ) return;
            if ( !this.blockHighlight ){
                var collapsed = range.collapsed;
                if(!range.collapsed){
                    this.show();
                }
                this.el.classList.toggle('fk-start', !collapsed && this.editor.selection.reachesStart( this.editor.context.ancestorElement ) );
                this.el.classList.toggle('fk-end', !collapsed && this.editor.selection.reachesEnd( this.editor.context.ancestorElement ) );
                this.el.classList.toggle('fk-partial', !collapsed );
            }
        },
        resetHighlight: function(){
            this.el.classList.remove( 'fk-active', 'fk-partial', 'fk-start', 'fk-end' );
        },
        highlightAll: function(){
            this.el.classList.add( 'fk-start', 'fk-end', 'fk-partial' );
        },
        handleClick: function( ev ){
            var el = this.editor.context.closestElementWithRules;
            var ancestor = this.editor.context.ancestorElement;

            // prevent click / touch to make sure selection stays in tact
            ev.preventDefault();
            this.editor.emit('ui.dots.click', ev );
            //this.editor.el.setAttribute('contentEditable', false);
            this.editor.preventBlur = true;

            // IMPORTANT NOTE: this only works because the CSS sets user-select none
            // on the dots element. TODO: check support for other browsers
            if ( this.editor.selection.getType() === 'full' ){
                editor.selection.placeCaret( el, {at: 'end'});
                return this.resetHighlight();
            }
            if (el.innerHTML !== '<br>'){
                this.editor.selection.selectNode( ancestor );
                this.editor.updateContext( ancestor );
                this.highlightAll();
            }
        },
        updateUIPosition: function(){
            if( this.editor.context.ancestorElement ){
                if(editor.context.ancestorElement.textContent.length === 0){
                    this.show();
                }
                var coords = rect( this.editor.context.properties.hidesCursor ?
                    this.editor.context.closestElementWithRules : this.editor.context.ancestorElement );

                var hidesCursor = this.editor.context.properties.hidesCursor;

                /**
                 *  Correct left-hand side out of viewport.
                 */
                coords.left = coords.left < 6 ? 6 : coords.left;

                /**
                 *  Slightly correct the bubble position by a few PX because
                 *  of the blue active indicator around void Elements.
                 */
                this.el.style.top = coords.top - (hidesCursor ? 6 : 0) + 'px';
                this.el.style.left = coords.left + 'px';
            }
        }
    });
};

module.exports = Dots;
