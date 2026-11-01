/* Reproduce the new-tab bugs: (1) all text selected after opening a new
   tab, (2) caret overlay blinking at editor start while the omnibox has
   focus. Session 1: setup vault. Session 2: open a SECOND new tab in the
   same browser session (session key still valid) and observe. A
   selection-API trap logs every selection manipulation with stacks. */
const path = require('path');
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');

const dist = path.resolve(__dirname, '..', '..', 'dist');
const MARKER = 'newtab probe content';

function agentDir() { return path.join(os.tmpdir(), 'mindful-newtab-agent'); }

async function launch() {
    return chromium.launchPersistentContext(agentDir(), {
        headless: false,
        viewport: { width: 1100, height: 760 },
        args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-first-run'],
    });
}

async function extId(context) {
    const boot = await context.newPage();
    await boot.goto('chrome://extensions/');
    await boot.waitForTimeout(3000);
    const id = await boot.evaluate(() => {
        const list = document.querySelector('extensions-manager').shadowRoot
            .querySelector('extensions-item-list').shadowRoot;
        return [...list.querySelectorAll('extensions-item')][0].id;
    });
    await boot.close();
    return id;
}

async function openNewTab(context, id) {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/index.html`);
    return page;
}

(async () => {
    fs.rmSync(agentDir(), { recursive: true, force: true });

    // ---- session 1: set up the vault, type content; browser stays open ----
    const context = await launch();
    // selection-API trap: log every selection manipulation with stacks
    await context.addInitScript(() => {
        window.__selLog = [];
        const ar = Selection.prototype.addRange;
        Selection.prototype.addRange = function (range) {
            window.__selLog.push({ api: 'addRange', text: String(range).slice(0, 40),
                stack: new Error().stack.split('\n').slice(2, 5).join(' | ').slice(0, 220) });
            return ar.call(this, range);
        };
        const sac = Selection.prototype.selectAllChildren;
        Selection.prototype.selectAllChildren = function (el) {
            window.__selLog.push({ api: 'selectAllChildren', target: el.tagName,
                stack: new Error().stack.split('\n').slice(2, 5).join(' | ').slice(0, 220) });
            return sac.call(this, el);
        };
    });
    const id = await extId(context);
    let page = await openNewTab(context, id);
    await page.waitForFunction(() => document.querySelector('#vault-setup'));
    await page.fill('#vault-pass', 'newtab-probe-pass');
    await page.fill('#vault-pass2', 'newtab-probe-pass');
    await page.click('#vault-setup');
    await page.waitForFunction(() => !document.querySelector('.vault-overlay'));
    await page.click('article.fk-editable');
    await page.keyboard.type(MARKER);
    await page.waitForTimeout(11000);   // wait out the trailing sync write

    // ---- tab 2: second new tab, same browser session ----
    page = await openNewTab(context, id);
    await page.waitForFunction(() => window._vault && window._vault.state === 'unlocked');
    await page.waitForTimeout(1200);

    const boot = await page.evaluate((marker) => {
        const article = document.querySelector('article.fk-editable');
        const s = window.getSelection();
        const sel = { rangeCount: s.rangeCount };
        if (s.rangeCount) {
            const r = s.getRangeAt(0);
            sel.collapsed = r.collapsed;
            sel.inArticle = article.contains(r.startContainer);
            sel.selectsAll = article.contains(r.commonAncestorContainer) && !r.collapsed &&
                r.toString().length > 10;
            sel.text = String(r).slice(0, 50);
        }
        const caret = document.querySelector('.mfk-caret');
        return {
            hasFocus: document.hasFocus(),
            activeElement: document.activeElement.tagName + '.' + String(document.activeElement.className).slice(0, 24),
            sel,
            caretVisible: !!caret && !caret.classList.contains('mfk-caret--hidden'),
            overlayActive: document.documentElement.classList.contains('mfk-overlay-active'),
            contentRestored: article.textContent.includes(marker),
        };
    }, MARKER);
    console.log('tab2 boot:', JSON.stringify(boot, null, 1));
    console.log('selection log:', JSON.stringify(await page.evaluate(() => window.__selLog || []), null, 1));

    // ---- simulate the user clicking the omnibox: the page loses focus ----
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(400);
    const afterBlur = await page.evaluate(() => ({
        caretVisible: !!document.querySelector('.mfk-caret') &&
            !document.querySelector('.mfk-caret').classList.contains('mfk-caret--hidden'),
        overlayActive: document.documentElement.classList.contains('mfk-overlay-active'),
        activeElement: document.activeElement.tagName,
    }));
    console.log('after window blur:', JSON.stringify(afterBlur));

    await page.screenshot({ path: './probe-shots/newtab-bug-state.png' });
    await context.close();
    console.log('done');
})().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1); });
