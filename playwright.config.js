/**
 * A/B parity harness for the m.js rebuild.
 *
 * /dist/index.html loads the rebuilt (readable) bundle from dist/ — the exact
 * artifact Chrome loads
 * /legacy/index-legacy.html loads m.legacy.js — the original 2016 minified bundle
 *
 * Both pages must behave identically; the spec asserts the same checklist on
 * each and compares console/page errors.
 */
module.exports = {
    testDir: 'tests',
    timeout: 30000,
    // the suite has load-sensitive tail tests; CI runners are noisier
    retries: process.env.CI ? 2 : 1,
    use: {
        baseURL: 'http://127.0.0.1:8931',
        headless: true,
    },
    webServer: {
        // node static server (scripts/serve.js) — CI runners have no
        // `python` alias, and this removes the python dependency entirely
        command: 'node scripts/serve.js',
        port: 8931,
        reuseExistingServer: true,
        cwd: __dirname,
        timeout: 15000,
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
    ],
};
