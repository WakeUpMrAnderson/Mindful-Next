import applyRules from './applyDocumentRules';

function setHTML(target, html, props ){
    target.innerHTML = typeof html === 'string' ? html : html.innerHTML;
    applyRules( target, props );
}

module.exports = setHTML;
