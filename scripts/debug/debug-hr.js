/* Real-extension insert-line (hr) probe: loads dist as a genuine unpacked
   MV3 extension (CSP enforced, real chrome.storage) and exercises the
   flow-menu "insert line" button the way long-term testing does:
   empty line → dots → menu → hr, then typing / Enter / undo / redo and a
   second insertion. Reports page errors and the resulting article DOM. */
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
    const errors = [];
    page.on('pageerror', e => errors.push('[pageerror] ' + String(e).split('\n')[0]));
    page.on('console', m => {
        if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 160));
    });
    await page.goto(`chrome-extension://${extId}/index.html`);

    await page.waitForFunction(() => document.querySelector('#vault-setup'));
    await page.fill('#vault-pass', 'probe-passphrase-9');
    await page.fill('#vault-pass2', 'probe-passphrase-9');
    await page.click('#vault-setup');
    await page.waitForFunction(() => !document.querySelector('.vault-overlay'));
    console.log('1. vault created and unlocked');

    const dom = label => page.evaluate(lab => {
        const a = document.querySelector('article.fk-editable');
        return `${lab}: ` + [...a.children].map(c =>
            c.tagName + (c.classList.length ? '.' + [...c.classList].join('.') : '') +
            (c.textContent.trim() ? `("${c.textContent.trim().slice(0, 22)}")` : '')
        ).join(' | ');
    }, label);

    // empty line at the end, flow-menu via Space, click the hr button
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
    await page.waitForFunction(() =>
        [...document.querySelectorAll('.fk-ui-inlineMenu [data-icon]')]
            .filter(el => el.querySelector('svg') || el.querySelector('.fk-icon-text')).length >= 7,
        null, { timeout: 5000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/hr-real-menu.png' });
    await page.locator('.fk-ui-inlineMenu [data-icon="hr"]').click();
    await page.waitForFunction(() =>
        document.querySelector('article.fk-editable hr'), null, { timeout: 5000 });
    await page.waitForTimeout(400);
    console.log('2. hr inserted:', await dom('   '));
    await page.screenshot({ path: 'test-results/hr-real-inserted.png' });

    await page.keyboard.type('below the line');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second para');
    await page.waitForTimeout(300);
    console.log('3. typed + Enter:', await dom('   '));

    // undo / redo across the hr (editor history, not the vault)
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    console.log('4. undo:', await dom('   '));
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(300);
    console.log('5. redo:', await dom('   '));

    // caret visual: is the smooth caret present in the paragraph after hr?
    const caret = await page.evaluate(() => {
        const c = document.querySelector('.mfk-caret');
        if (!c) return { present: false };
        const r = c.getBoundingClientRect();
        return { present: true, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), opacity: getComputedStyle(c).opacity };
    });
    console.log('6. caret overlay:', JSON.stringify(caret));

    // arrow-key walk across the hr: from the paragraph BELOW the hr,
    // ArrowUp must land in the paragraph ABOVE it (not the article start)
    const blockText = () => page.evaluate(() => {
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        const n = sel.getRangeAt(0).startContainer;
        const block = (n.nodeType === Node.TEXT_NODE ? n.parentElement : n)
            && (n.nodeType === Node.TEXT_NODE ? n.parentElement : n).closest('p, h1, h2, h3, blockquote, li');
        return block ? block.textContent.slice(0, 24) : null;
    });
    await page.evaluate(() => {
        const ed = window._editor;
        const hr = document.querySelector('article.fk-editable hr');
        const below = hr.nextElementSibling;
        ed.focus();
        ed.selection.placeCaret(below, { at: 'start' });
        ed.updateContext(below);
    });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(250);
    const upBlock = await blockText();
    console.log('7. ArrowUp from below hr lands in:', JSON.stringify(upBlock),
        /writing/.test(upBlock || '') ? 'OK' : 'BUG');

    console.log('8. page errors:', errors.length ? errors.slice(0, 8) : 'none');
    await page.screenshot({ path: 'test-results/hr-real-final.png' });
    await context.close();
})();
