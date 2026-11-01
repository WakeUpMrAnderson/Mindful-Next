/* Catch the "flash": log every wholesale innerHTML replacement of the editor
   article with a stack trace, during typing and focus toggles. */
const path = require('path');
const { chromium } = require('playwright');

const dist = path.resolve(__dirname, '..', '..', 'dist');

(async () => {
    const context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-first-run'],
    });
    const boot = await context.newPage();
    await boot.goto('chrome://extensions/');
    const extId = await boot.evaluate(() => {
        const list = document.querySelector('extensions-manager').shadowRoot
            .querySelector('extensions-item-list').shadowRoot;
        return [...list.querySelectorAll('extensions-item')][0].id;
    });
    await boot.close();

    const page = await context.newPage();
    page.on('pageerror', e => console.log('[pageerror]', String(e).split('\n')[0]));
    // default hidemode='hide' makes the article unclickable
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('hidemode', 'show');
    });
    await page.goto(`chrome-extension://${extId}/index.html`);
    await page.waitForTimeout(2000);

    // spy on innerHTML writes to the article + record article-level mutations
    await page.evaluate(() => {
        const article = document.querySelector('article.fk-editable');
        window.__log = [];
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        Object.defineProperty(article, 'innerHTML', {
            get() { return descriptor.get.call(this); },
            set(v) {
                window.__log.push({
                    kind: 'innerHTML-set',
                    stack: (new Error().stack || '').split('\n').slice(1, 5).join(' | ').slice(0, 300),
                    len: String(v).length,
                });
                descriptor.set.call(this, v);
            },
            configurable: true,
        });
        const obs = new MutationObserver(records => {
            for (const r of records) {
                if (r.target === article && r.type === 'childList' &&
                    (r.addedNodes.length || r.removedNodes.length)) {
                    window.__log.push({
                        kind: 'article-childList',
                        added: r.addedNodes.length,
                        removed: r.removedNodes.length,
                    });
                }
            }
        });
        obs.observe(article, { childList: true });
    });

    console.log('--- type one char ---');
    await page.click('article.fk-editable');
    await page.keyboard.type('x');
    await page.waitForTimeout(800);
    console.log(JSON.stringify(await page.evaluate(() => window.__log.splice(0)), null, 1));

    console.log('--- blur then refocus ---');
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
    await page.waitForTimeout(600);
    await page.click('article.fk-editable');
    await page.waitForTimeout(600);
    console.log(JSON.stringify(await page.evaluate(() => window.__log.splice(0)), null, 1));

    console.log('--- selectionchange storm check (collapse selection) ---');
    await page.evaluate(() => {
        const sel = window.getSelection();
        sel.removeAllRanges();
        document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForTimeout(600);
    console.log(JSON.stringify(await page.evaluate(() => window.__log.splice(0)), null, 1));

    await context.close();
})().catch(e => { console.error(e); process.exit(1); });
