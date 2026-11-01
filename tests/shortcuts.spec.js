/**
 * Keyboard-shortcut registry gates (F-shortcuts):
 *
 * - platform defaults deliver through the resolver: bold on Ctrl+B,
 *   strikethrough on Alt+Shift+5 (the Windows default — Ctrl+5 is
 *   Chrome-reserved); every delivery assertion targets a FRESHLY created
 *   paragraph so the demo article's pre-existing <strong>/<s> markup
 *   cannot make it vacuous
 * - remapping bold via the settings panel really moves the binding: the
 *   new combo executes, the old Ctrl+B is dead (native browser bold is
 *   suppressed), and both survive a fresh page on the same localStorage
 * - Chrome-reserved combos and duplicate assignments are rejected with
 *   a visible reason; Escape cancels capture
 * - the advertised-but-dead checkbox tick now actually executes
 *
 * Run: npx playwright test tests/shortcuts.spec.js
 */
const { test, expect } = require('playwright/test');

async function unlockVault(page) {
    await page.waitForFunction(() => window._editor);
    await page.waitForTimeout(120);
    if (await page.locator('#vault-setup').count()) {
        await page.fill('#vault-pass', 'test-passphrase');
        await page.fill('#vault-pass2', 'test-passphrase');
        await page.click('#vault-setup');
    } else if (await page.locator('#vault-unlock').count()) {
        await page.fill('#vault-pass', 'test-passphrase');
        await page.click('#vault-unlock');
    }
    await page.waitForFunction(() => !document.querySelector('.vault-overlay'));
}

async function openPanel(page) {
    await page.locator('.fk-icon-settings').dispatchEvent('click');
    await page.waitForFunction(() =>
        document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'),
        null, { timeout: 3000 });
    await page.waitForTimeout(150);
}

async function clickComboRow(page, labelText) {
    await page.evaluate((label) => {
        const rows = [...document.querySelectorAll('.mfk-settings-shortcut-row')];
        const row = rows.find(r =>
            r.querySelector('.mfk-settings-shortcut-label').textContent === label);
        row.querySelector('.mfk-settings-shortcut-combo').click();
    }, labelText);
}

// create a fresh paragraph with unique text and select its contents —
// later assertions target THAT paragraph, never the demo markup
async function selectFreshParagraph(page, text) {
    await page.evaluate((t) => {
        const ed = window._editor;
        const article = document.querySelector('article.fk-editable');
        const p = document.createElement('p');
        p.textContent = t;
        article.appendChild(p);
        const s = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(p);
        s.removeAllRanges();
        s.addRange(range);
        ed.selection.update();
        ed.updateContext(p);
    }, text);
    // let the observer's normalization churn settle — a keypress during
    // churn races the selection (same discipline as insert-line.spec)
    await page.waitForFunction(() =>
        window._editor.mutationObserver.pending.length === 0, null, { timeout: 3000 });
}

// does the paragraph whose text is exactly `text` contain `selector`?
// null means the paragraph vanished — always a failure
async function paragraphHas(page, text, selector) {
    return page.evaluate(({ t, sel }) => {
        const ps = [...document.querySelectorAll('article.fk-editable p')];
        const p = ps.find(el => el.textContent === t);
        return p ? !!p.querySelector(sel) : null;
    }, { t: text, sel: selector });
}

const INIT = async page => {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('hidemode', 'show');
        window.chrome = {
            runtime: { getManifest: () => ({ version: '1.0.0' }) },
            storage: {
                sync: { get: (k, cb) => cb && cb({}), set: (i, cb) => cb && cb(), remove: (k, cb) => cb && cb() },
                local: { get: (k, cb) => cb && cb({}), set: (i, cb) => cb && cb(), remove: (k, cb) => cb && cb() },
                session: { get: (k, cb) => cb && cb({}), set: (i, cb) => cb && cb(), remove: (k, cb) => cb && cb() },
                onChanged: { addListener: () => {} },
            },
        };
    });
    await page.goto('/dist/index.html');
    await unlockVault(page);
};

test.describe('keyboard shortcuts', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(String(err)));
        await INIT(page);
    });

    test('bold delivers via Ctrl+B on a fresh paragraph', async ({ page }) => {
        await page.click('article.fk-editable p');
        await selectFreshParagraph(page, 'boldme');
        await page.keyboard.press('Control+b');
        await page.waitForTimeout(120);
        expect(await paragraphHas(page, 'boldme', 'strong')).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test('strikethrough delivers via Alt+Shift+5 (the Windows default)', async ({ page }) => {
        await page.click('article.fk-editable p');
        await selectFreshParagraph(page, 'strike me');
        await page.keyboard.press('Alt+Shift+5');
        await page.waitForTimeout(120);
        expect(await paragraphHas(page, 'strike me', 's')).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test('remapping bold to Ctrl+Shift+U: new combo works, old Ctrl+B dead', async ({ page }) => {
        await openPanel(page);
        await clickComboRow(page, 'Bold');
        await page.keyboard.press('Control+Shift+U');
        await page.waitForTimeout(200);

        const stored = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('shortcutmap') || '{}'));
        expect(stored.bold).toBeTruthy();
        expect(stored.bold.key).toBe('U');
        expect(stored.bold.ctrl).toBe(true);

        await page.keyboard.press('Escape');   // close the panel (capture already done)
        await page.waitForTimeout(100);

        // the new combo executes bold
        await page.click('article.fk-editable p');
        await selectFreshParagraph(page, 'remapped');
        await page.keyboard.press('Control+Shift+U');
        await page.waitForTimeout(120);
        expect(await paragraphHas(page, 'remapped', 'strong')).toBe(true);

        // the old Ctrl+B is dead — no native browser bold either
        await selectFreshParagraph(page, 'stillplain');
        await page.keyboard.press('Control+b');
        await page.waitForTimeout(120);
        expect(await paragraphHas(page, 'stillplain', 'strong')).toBe(false);
        expect(await paragraphHas(page, 'stillplain', 'b')).toBe(false);
        expect(pageErrors).toEqual([]);
    });

    test('override survives a fresh page on the same localStorage', async ({ page }) => {
        await openPanel(page);
        await clickComboRow(page, 'Bold');
        await page.keyboard.press('Control+Shift+U');
        await page.waitForTimeout(200);

        // chrome mock + hidemode WITHOUT the localStorage.clear, applied at
        // context level so the next page keeps 'shortcutmap'
        await page.context().addInitScript(() => {
            localStorage.setItem('hidemode', 'show');
            window.chrome = {
                runtime: { getManifest: () => ({ version: '1.0.0' }) },
                storage: {
                    sync: { get: (k, cb) => cb && cb({}), set: (i, cb) => cb && cb(), remove: (k, cb) => cb && cb() },
                    local: { get: (k, cb) => cb && cb({}), set: (i, cb) => cb && cb(), remove: (k, cb) => cb && cb() },
                    session: { get: (k, cb) => cb && cb({}), set: (i, cb) => cb && cb(), remove: (k, cb) => cb && cb() },
                    onChanged: { addListener: () => {} },
                },
            };
        });
        const page2 = await page.context().newPage();
        page2.on('pageerror', err => pageErrors.push(String(err)));
        await page2.goto('/dist/index.html');
        await unlockVault(page2);

        await page2.click('article.fk-editable p');
        await selectFreshParagraph(page2, 'persisted');
        await page2.keyboard.press('Control+Shift+U');
        await page2.waitForTimeout(120);
        expect(await paragraphHas(page2, 'persisted', 'strong')).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test('reserved and duplicate combos are rejected with a reason', async ({ page }) => {
        await openPanel(page);
        // reserved: remap Bold → Ctrl+T
        await clickComboRow(page, 'Bold');
        await page.keyboard.press('Control+t');
        await page.waitForTimeout(150);
        const afterReserved = await page.evaluate(() => ({
            warn: document.querySelector('.mfk-settings-warn') &&
                document.querySelector('.mfk-settings-warn').textContent,
            stillOpen: document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'),
        }));
        expect(afterReserved.warn).toContain('Reserved');
        expect(afterReserved.stillOpen).toBe(true);   // capture continues

        // duplicate: remap Italic → Bold's active combo (Ctrl+B)
        await clickComboRow(page, 'Italic');
        await page.keyboard.press('Control+b');
        await page.waitForTimeout(150);
        const dup = await page.evaluate(() => {
            const warn = document.querySelector('.mfk-settings-warn');
            return warn && warn.textContent;
        });
        expect(dup).toMatch(/Already used for/i);

        // Escape cancels capture; nothing was persisted
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        const map = await page.evaluate(() => localStorage.getItem('shortcutmap'));
        expect(map === null || map === '{}').toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test('capture disarms when the panel closes — typing keeps working', async ({ page }) => {
        await openPanel(page);
        await clickComboRow(page, 'Bold');   // arm capture ("press keys…")
        await page.waitForTimeout(100);

        // click outside the panel — the panel (and the capture) must close
        await page.click('article.fk-editable p');
        await page.waitForTimeout(150);
        const panelClosed = await page.evaluate(() =>
            !document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'));
        expect(panelClosed).toBe(true);

        // the page-wide swallow must be gone: plain typing lands, and
        // Ctrl+B still executes bold (no capture in the way)
        await page.keyboard.type('typing works');
        await page.waitForTimeout(100);
        const typed = await page.evaluate(() =>
            [...document.querySelectorAll('article.fk-editable p')]
                .some(p => p.textContent.indexOf('typing works') !== -1));
        expect(typed).toBe(true);

        await selectFreshParagraph(page, 'afterclose');
        await page.keyboard.press('Control+b');
        await page.waitForTimeout(120);
        expect(await paragraphHas(page, 'afterclose', 'strong')).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test('checkbox tick executes via Ctrl+period (the advertised binding, now real)', async ({ page }) => {
        // build a checklist item through the flow-menu
        await page.click('article.fk-editable');
        await page.evaluate(() => {
            const ed = window._editor;
            const article = document.querySelector('article.fk-editable');
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            article.appendChild(p);
            const s = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            s.removeAllRanges();
            s.addRange(range);
            ed.selection.update();
            ed.updateContext(p);
        });
        await page.keyboard.press('Space');
        await page.locator('.fk-ui-inlineMenu [data-icon="checkbox"]').click();
        await page.waitForFunction(() =>
            document.querySelector('article.fk-editable ul.checklist'), null, { timeout: 4000 });
        await page.keyboard.type('tick me');

        // place the caret in the text, then Ctrl+. — the advertised tick
        await page.evaluate(() => {
            const ed = window._editor;
            const text = document.querySelector('article.fk-editable .checklist__item__text');
            ed.focus();
            ed.selection.placeCaret(text, { at: 'start' });
            ed.updateContext(text);
        });
        await page.keyboard.press('Control+.');
        await page.waitForTimeout(200);
        const ticked = await page.evaluate(() =>
            !!document.querySelector('article.fk-editable .checklist__item--checked'));
        expect(ticked).toBe(true);
        expect(pageErrors).toEqual([]);
    });
});
