var scrollIntoView = require('../window/scroll-into-view');

module.exports = {
    alignMediaLeft: {
        execute: function () {
            var target = this.context.ancestorElement;
            target.classList.remove('aligncenter');
            target.classList.remove('alignright');
            target.classList.toggle('alignleft');
            return this.context.closestElementWithRules;
        },
        queryState: function () {
            return this.context.closestElementWithRules.classList.contains('alignleft') || this.context.ancestorElement.classList.contains('alignleft');
        }
    },

    alignMediaRight: {
        execute: function () {
            var target = this.context.ancestorElement;
            target.classList.remove('aligncenter');
            target.classList.remove('alignleft');
            target.classList.toggle('alignright');
            return this.context.closestElementWithRules;
        },
        queryState: function () {
            return this.context.closestElementWithRules.classList.contains('alignright') || this.context.ancestorElement.classList.contains('alignright');
        }
    },

    alignMediaCenter: {
        execute: function (tagName) {
            var target = this.context.ancestorElement;
            target.classList.remove('alignright');
            target.classList.remove('alignleft');
            target.classList.toggle('aligncenter');
            return this.context.closestElementWithRules;
        },
        queryState: function () {
            return this.context.closestElementWithRules.classList.contains('aligncenter') || this.context.ancestorElement.classList.contains('aligncenter');
        }
    },
    toggleCaption: {
        execute: function (tagName) {
            var figcaption = this.context.ancestorElement.querySelector('figcaption');
            if ( figcaption ){
                figcaption.parentNode.removeChild( figcaption );
                return;
            }
            figcaption = document.createElement('figcaption');
            figcaption.innerHTML = '<br/>';
            this.context.ancestorElement.appendChild( figcaption );
            this.focus();
            this.placeCaret( figcaption, {at: 'start' });
            scrollIntoView( figcaption );
            setTimeout(function(){
                this.updateContext( figcaption );
            }.bind( this ), 1);
        },
        queryState: function () {
            return this.context.ancestorElement.querySelector('figcaption');
        }
    }
}
