import specimen from 'specimen';

/**
 * Class that enables the definition and assignment of arbitrary properties to HTML elements
 */
class CascadingPropertySet {
    /**
     * @param {Object} properties
     * @param {Object} rules
     */
    constructor(properties = {}, rules = {}) {
        this.properties = {};
        this.rules = [];
        this.resetCachedProperties();
        this.addProperties(properties);
        this.addRules(rules);
    }

    /**
     * Reset the cached lists of inherited and default value properties
     * @returns void
     */
    resetCachedProperties() {
        this.inheritedProperties = [];
        this.propertiesWithDefaultValue = [];
    }

    /**
     * Store property definitions (will override properties with the same name)
     * @param {Object} propertyDefinitions
     * @returns void
     */
    addProperties(propertyDefinitions) {
        this.resetCachedProperties();
        Object.keys(propertyDefinitions).forEach((property) => {
            const definition = propertyDefinitions[property];
            this.properties[property] = definition;
            if (definition.defaultValue) {
                this.propertiesWithDefaultValue.push(property);
            }
            if (definition.inherited) {
                this.inheritedProperties.push(property);
            }
        })
    }

    /**
     * Prepend the parent selector to each selector in the list
     * @example
     * // returns "h1 em,p em,h1 strong,p strong"
     * CascadingPropertySet.prependParentSelector('em, strong', 'h1, p')
     *
     * @param {string} selectorsStr
     * @param {string} parentSelectorsStr
     * @returns {string}
     */
    static prependParentSelector(selectorsStr, parentSelectorsStr) {
        const trim = s => s.trim();
        const selectors = selectorsStr.split(',').map(trim);
        const parentSelectors = parentSelectorsStr.split(',').map(trim);

        return selectors.map(s =>
            parentSelectors.map(ps => ps + ' ' + s).map(trim).join(',')
        ).join(',');
    }

    /**
     * Calculates and returns the specificity of a selector
     * @param selector
     * @returns {Number}
     */
    static getSelectorSpecificity(selector) {
        return parseInt(specimen(selector).join(''), 10);
    }

    /**
     * Store the rules
     * @param rules
     * @param {string} parentSelector
     */
    addRules(rules, parentSelector = '') {
        let properties = {};
        Object.keys(rules).forEach(key => {
            if (rules[key].constructor === Object) {
                // If we're dealing with a nested selector, prepend parentSelector and call addRules again.
                this.addRules(rules[key], CascadingPropertySet.prependParentSelector(key, parentSelector))
            }
            else {
                properties[key] = rules[key];
            }
        });
        if (properties && parentSelector !== '') {
            this.addRule(parentSelector, properties);
        }
    }

    /**
     * Store individual rules along with the specificity of their selector
     * @param selectors
     * @param properties
     */
    addRule(selectors, properties) {
        selectors.split(',').forEach(selector => {
            const specificity = CascadingPropertySet.getSelectorSpecificity(selector);
            if (specificity) {
                this.rules.push({selector, specificity, properties});
            }
        })
    }

    /**
     * Nicer API to retrieve the properties of an element
     * e.g. `cascadingPropertySet.forElement(domEl).property('allowedTags')`
     * @param {HTMLElement} element
     * @returns {Object}
     */
    forElement(element) {
        if (!(element instanceof HTMLElement)) {
            return console.warn('The element should be an instance of HTMLElement')
        }
        const property = (name) => this.getPropertyValue(element, name);
        const all = () => this.getAllProperties(element);
        return {property, all};
    }

    /**
     * Return the value of a property on a given element
     * @param {HTMLElement} element
     * @param {string} propertyName
     * @returns {*}
     */
    getPropertyValue(element, propertyName) {
        let match = {specificity: -1, value: null};
        this.rules.forEach(rule => {
            if (element.matches(rule.selector) && typeof rule.properties[propertyName] !== 'undefined') {
                const value = rule.properties[propertyName];
                const specificity = rule.specificity;
                // Only store the value if its specificity is higher or equal to the previous match
                if (specificity >= match.specificity) {
                    match = {specificity, value};
                }
            }
        });

        if (match.value === null) {
            const definition = this.properties[propertyName] || {};
            // If the property is inherited, look for it on the parent element
            if (definition.inherited && element.parentElement) {
                return this.getPropertyValue(element.parentElement, propertyName);
            }
            // Return the default value if it exists
            if (typeof definition.defaultValue !== 'undefined') {
                return definition.defaultValue;
            }
        }
        return match.value;
    }

    /**
     * Returns all the properties defined for an element
     * @param {HTMLElement} element
     * @param {boolean} withInherited
     * @param {boolean} withDefaultValues
     * @return {Object}
     */
    getAllProperties(element, withInherited = true, withDefaultValues = true) {
        let properties = {};
        let highestSpecificity = {} // Keep track of the highest specificity for every property

        // Iterate over all existing rules and store the properties if the element matches their selector
        this.rules.forEach(rule => {
            if (element.matches(rule.selector)) {
                const specificity = rule.specificity;
                Object.keys(rule.properties).forEach(property => {
                    if (!highestSpecificity[property] || highestSpecificity[property] <= specificity) {
                        highestSpecificity[property] = specificity;
                        properties[property] = rule.properties[property];
                    }
                });
            }
        });

        // Try to retrieve any inherited properties that weren't defined from the parent element
        if (withInherited) {
            this.inheritedProperties.forEach(property => {
                if (typeof properties[property] === 'undefined' && element.parentElement) {
                    properties[property] = this.getPropertyValue(element.parentElement, property);
                }
            });
        }

        // Lastly, iterate of the list of properties that have a default value and use it
        // if no other value exists
        if (withDefaultValues) {
            this.propertiesWithDefaultValue.forEach(property => {
                if (typeof properties[property] === 'undefined') {
                    properties[property] = this.properties[property].defaultValue;
                }
            });
        }

        return properties;
    }
}

export default CascadingPropertySet;
