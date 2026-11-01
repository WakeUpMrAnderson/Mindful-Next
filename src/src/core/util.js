import isArray from 'lodash/isArray';
import get from 'lodash/get';
import isFunction from 'lodash/isFunction';
import forEach from 'lodash/forEach';

/**
 * Initialises one or more plugins
 * @param {Object|Object[]|Function|Function[]} plugin - Plugin instance (or function) or array of plugin instances
 * @owner {Document|Editor} owner - Document or editor instance to which the plugin should be attached
 * @private
 */
export function usePlugin(plugin, owner) {
    // If we received a list of plugins, call the function on each one
    if (isArray(plugin)) {
        forEach(plugin, p => usePlugin(p, owner));
        return owner;
    }

    // If the plugin is a function, instantiate it first
    if (isFunction(plugin)) {
        return usePlugin(new plugin(), owner);
    }

    // Ensure that the plugin  has an init method
    if (!isFunction(plugin.init)) {
        console.warn("%s is missing an init method", pluginRef);
        return owner;
    }

    // Ensure that a plugin isn't attached more than once to an editor or document instance
    const pluginRef = get(plugin, 'info.name', plugin);
    if (owner._plugins !== undefined) {
        if (owner._plugins.indexOf(pluginRef) > -1) {
            console.warn("%s has already been loaded for %o", pluginRef, owner);
            return owner;
        }
        owner._plugins.push(pluginRef);
    } else {
        owner._plugins = [pluginRef];
    }
    // Isolate plugin faults: a throwing init() must not kill the editor boot
    // (and with it every downstream plugin — storage sync included).
    try {
        plugin.init(owner);
    } catch (e) {
        console.error('Plugin %o failed to initialize:', pluginRef, e);
    }
    return owner; // Return the owner instance so that calls to `.use()` can be chained
}
