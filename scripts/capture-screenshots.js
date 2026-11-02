/**
 * Capture the README screenshots (docs/screenshots/) against a freshly
 * built dist/ via the local test server (python -m http.server 8931).
 *
 * Sensitive-data rules — every run must pass these before a frame is
 * written:
 *   1. Fresh browser profile per run: no persisted notes, no real user
 *      content — the article shows ONLY the demo text shipped in
 *      index.html (asserted below).
 *   2. The vault passphrase is typed into masked password fields and the
 *      lock/setup screens are NEVER captured.
 *   3. Settings are at their defaults (fresh profile = empty
 *      localStorage) — no personal configuration leaks into frames.
 *   4. No browser chrome, no URLs, no filesystem paths in frame — the
 *      shots are page-only viewports.
 *   5. The workspace path in OUT below is replaced by the repo-relative
 *      path (this script lives IN the repo and resolves it itself).
 *
 * Usage: node scripts/capture-screenshots.js   (server on :8931 running)
 */
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots') + path.sep;

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto('http://127.0.0.1:8931/dist/index.html');
    await page.waitForFunction(() => window._editor);
    await page.waitForTimeout(400);
    if (await page.locator('#vault-setup').count()) {
        await page.fill('#vault-pass', 'test-passphrase');
        await page.fill('#vault-pass2', 'test-passphrase');
        await page.click('#vault-setup');
    }
    await page.waitForFunction(() => !document.querySelector('.vault-overlay'));
    await page.waitForTimeout(600);

    // hygiene gate: demo content only, no overlays, default settings
    const hygiene = await page.evaluate(() => ({
        demoOnly: document.querySelector('article').textContent.indexOf('Welcome to Mindful') !== -1,
        noOverlay: !document.querySelector('.vault-overlay'),
        noNotice: !document.querySelector('.vault-sync-notice'),
        widthDefault: localStorage.getItem('editorwidth') === null,
    }));
    if (!hygiene.demoOnly || !hygiene.noOverlay || !hygiene.noNotice || !hygiene.widthDefault) {
        throw new Error('hygiene gate failed: ' + JSON.stringify(hygiene));
    }

    const toNight = () => page.click('.fk-icon-nightmode');   // visible button of the pair
    const toDay = () => page.click('.fk-icon-sun');

    await page.screenshot({ path: OUT + 'editor-day.png' });                       // 1
    await toNight();
    await page.waitForTimeout(500);
    await page.screenshot({ path: OUT + 'editor-night.png' });                     // 2
    await page.locator('.fk-icon-settings').dispatchEvent('click');
    await page.waitForTimeout(600);
    await page.locator('.mfk-settings-panel').screenshot({ path: OUT + 'settings-night.png' });  // 3
    await page.evaluate(() => document.querySelector('.mfk-settings-close').click());
    await page.waitForTimeout(300);
    await toDay();
    await page.waitForTimeout(500);
    await page.locator('.fk-icon-settings').dispatchEvent('click');
    await page.waitForTimeout(600);
    await page.locator('.mfk-settings-panel').screenshot({ path: OUT + 'settings-day.png' });    // 4
    await page.evaluate(() => document.querySelector('.mfk-settings-close').click());
    await page.waitForTimeout(300);
    await toNight();
    await page.waitForTimeout(400);
    await page.locator('.fk-icon-hide').dispatchEvent('click');
    await page.waitForTimeout(600);
    await page.screenshot({ path: OUT + 'mindful-mode.png' });                     // 5

    console.log('captured 5 screenshots (hygiene gate passed)');
    await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
