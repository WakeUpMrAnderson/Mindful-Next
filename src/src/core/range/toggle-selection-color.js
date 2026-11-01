// The class of the stylesheet that will be appended
const STYLESHEET_CLASNAME = 'fk-selection-color-fixer';

/**
 * Insert some styles that will hide the browser's native selection
 */
export function hideSelectionColor() {
    let css = document.createElement('style');
    css.className = STYLESHEET_CLASNAME;
    css.type = 'text/css';

    let styles = `
        ::selection {
            background: rgba(100,149,237,0);
        }
        ::-moz-selection {
            background: rgba(100,149,237,0);
        }
    `;

    if (css.styleSheet) {
        css.styleSheet.cssText = styles;
    }
    else {
        css.appendChild(document.createTextNode(styles));
    }

    document.body.appendChild(css);
}

/**
 * Restores the original selection color
 */
export function restoreSelectionColor() {
    [].forEach.call(document.querySelectorAll('.' + STYLESHEET_CLASNAME), (n) => n.parentNode.removeChild(n));
}
