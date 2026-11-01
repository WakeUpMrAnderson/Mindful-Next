/**
 * Provides the `process` global that webpack 1 automatically shimmed in the
 * original bundle (bare `process.env` references in debug/vue sources).
 * Deliberately kept empty like vendor/process/browser.js, so
 * `process.env.NODE_ENV` is undefined and Vue's development warnings stay
 * active exactly as they are in the legacy minified bundle.
 */

import p from '../process/browser.js';

export const process = p;
