/* Real-extension vault probe: loads dist as a genuine unpacked MV3
   extension (CSP enforced, real chrome.storage) and walks the vault flow:
   first-run setup → type → verify ciphertext-only storage → lock → unlock. */
const path = require('path');
const { chromium } = require('playwright');

const dist = path.resolve(__dirname, '..', '..', 'dist');
const MARKER = 'VAULT_PROBE_SECRET_77';

(async () => {
    const context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-first-run'],
    });
    const boot = await context.newPage();
    await boot.goto('chrome://extensions/');
    // The WebUI needs longer on a cold profile — poll until an item exists.
    let extId = null;
    for (let attempt = 0; attempt < 15 && !extId; attempt++) {
        await boot.waitForTimeout(2000);
        extId = await boot.evaluate(() => {
            const mgr = document.querySelector('extensions-manager');
            const list = mgr && mgr.shadowRoot && mgr.shadowRoot.querySelector('extensions-item-list');
            const item = list && list.shadowRoot && list.shadowRoot.querySelector('extensions-item');
            return item ? item.id : null;
        }).catch(() => null);
    }
    await boot.close();
    if (!extId) throw new Error('extension item never appeared in chrome://extensions');

    const page = await context.newPage();
    page.on('pageerror', e => console.log('[pageerror]', String(e).split('\n')[0]));
    await page.goto(`chrome-extension://${extId}/index.html`);
    await page.waitForFunction(() => document.querySelector('#vault-setup'));
    console.log('1. first-run setup screen: present');

    await page.fill('#vault-pass', 'probe-passphrase-9');
    await page.fill('#vault-pass2', 'probe-passphrase-9');
    await page.click('#vault-setup');
    await page.waitForFunction(() => !document.querySelector('.vault-overlay'));
    console.log('2. vault created and unlocked');

    await page.click('article.fk-editable');
    await page.keyboard.type(MARKER);
    // wait out the checkpoint debounce AND the 10s trailing sync write so
    // no in-flight write races the cross-tab steps below
    await page.waitForTimeout(11500);

    // The decisive check: chrome.storage (REAL areas, not stubs) must not
    // contain the marker in plaintext anywhere.
    const sweep = await page.evaluate(async (marker) => {
        let haystack = '';
        for (const area of ['local', 'sync', 'session']) {
            const dump = await new Promise(res => chrome.storage[area].get(null, r => res(r)));
            haystack += area + '=' + JSON.stringify(dump);
        }
        const ls = JSON.stringify(localStorage);
        const dom = document.querySelector('article.fk-editable').textContent;
        return {
            markerInDom: dom.includes(marker),
            markerInChromeStorage: haystack.includes(marker),
            markerInLocalStorage: ls.includes(marker),
            vaultDataPresent: !!(await new Promise(res => chrome.storage.local.get('vault.data', r => res(r['vault.data'])))),
        };
    }, MARKER);
    console.log('3. storage sweep:', JSON.stringify(sweep));

    console.log('4. lock + unlock round-trip:');
    await page.evaluate(() => window._vault.lock());
    await page.waitForFunction(() => document.querySelector('#vault-unlock'));
    console.log('   locked, article editable:',
        await page.evaluate(() => document.querySelector('article.fk-editable').getAttribute('contenteditable')));
    await page.fill('#vault-pass', 'probe-passphrase-9');
    await page.click('#vault-unlock');
    await page.waitForFunction(() => !document.querySelector('.vault-overlay'));
    const restored = await page.evaluate((marker) =>
        document.querySelector('article.fk-editable').textContent.includes(marker), MARKER);
    console.log('   unlocked, content restored:', restored);

    console.log('5. snapshot present (encrypted):', await page.evaluate(async (marker) => {
        const snaps = await new Promise(res => chrome.storage.local.get('vault.snapshots', r => res(r['vault.snapshots'] || [])));
        return snaps.length >= 1 && !JSON.stringify(snaps).includes(marker);
    }, MARKER));

    console.log('6. flow-menu opens under real CSP (the lodash/template check):');
    await page.click('article.fk-editable');
    await page.evaluate(() => {
        const ed = window._editor;
        const article = document.querySelector('article.fk-editable');
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        article.appendChild(p);
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(p);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        ed.selection.update();
        ed.updateContext(p);
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(700);
    const menu = await page.evaluate(() => ({
        fkShow: document.querySelector('.fk-ui-inlineMenu').classList.contains('fk-show'),
        buttons: document.querySelectorAll('.fk-ui-inlineMenu .fk-button--inlineMenu').length,
        icons: document.querySelectorAll('.fk-ui-inlineMenu [data-icon] svg').length,
    }));
    console.log('   flow-menu:', JSON.stringify(menu));

    console.log('6. cross-tab adoption + rollback (second page as hidden tab):');
    const page2 = await context.newPage();
    await page2.goto(`chrome-extension://${extId}/index.html`);
    await page2.waitForFunction(() => window._vault && window._vault.state === 'unlocked');
    // page2 simulates a hidden background tab (document.hidden overridden —
    // tab visibility cannot be forced reliably from the driver)
    await page2.evaluate(() => Object.defineProperty(document, 'hidden', {
        configurable: true, get: () => true }));
    // newer encrypted content arrives from "another window" via sync
    await page.evaluate((marker) => window._vault
        .encrypt('<p>cross-tab newer ' + marker + '</p>')
        .then(blob => chrome.storage.sync.set({ 'vault.data': blob })), MARKER);
    await page2.waitForTimeout(600);
    const adopted = await page2.evaluate((marker) =>
        document.querySelector('article.fk-editable').textContent.includes('cross-tab newer ' + marker), MARKER);
    console.log('   hidden tab adopted newer blob:', adopted);
    // rollback: an OLDER valid blob arrives at the hidden tab — rejected
    await page.evaluate(async () => {
        const blob = await window._vault.encrypt('<p>rolled back</p>', Date.now() - 3600000);
        chrome.storage.sync.set({ 'vault.data': blob });
    });
    await page2.waitForTimeout(600);
    // the rollback blob is older than the local mirror — the vault must
    // reject it, keep the newer local content and notify (not 'rolled back')
    const kept = await page2.evaluate((marker) => ({
        rollbackAbsent: !document.querySelector('article.fk-editable').textContent.includes('rolled back'),
        markerContentKept: document.querySelector('article.fk-editable').textContent.includes(marker),
    }), MARKER);
    console.log('   page2 kept newer content:', JSON.stringify(kept));
    const notified = await page2.evaluate(() =>
        [...document.querySelectorAll('.notification__content')]
            .some(n => n.textContent.toLowerCase().includes('rollback')));
    console.log('   page2 rejected rollback:', kept, '| notified:', notified);
    await page2.close();

    await context.close();
})().catch(e => { console.error(e); process.exit(1); });
