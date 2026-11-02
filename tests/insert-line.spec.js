/**
 * Flow-menu / bubble icon alignment + insert-line (hr) regression gate.
 *
 * 1. Every toolbar icon (SVG or text glyph) must be centered in its
 *    button — the button is the flex-centering container, so a missing
 *    or overridden display rule shows up as icons riding high/left.
 * 2. The flow-menu "insert line" button must insert an <hr> + paragraph,
 *    place the caret in the paragraph, and leave the editor fully
 *    working (typing, deleting) with zero page errors.
 *
 * Run: npx playwright test tests/insert-line.spec.js
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

async function openFlowMenu(page) {
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
        null, { timeout: 4000 });
    // let the entrance transitions settle — a mid-flight scale(.1) collapses
    // every icon toward the button center and masks alignment bugs
    await page.waitForTimeout(600);
}

// Icon center-of-box vs button center-of-box, per button.
async function iconMetrics(page, buttonSelector) {
    return page.evaluate(sel => {
        return [...document.querySelectorAll(sel)].map(btn => {
            const b = btn.getBoundingClientRect();
            const icon = btn.querySelector('svg') || btn.querySelector('.fk-icon-text');
            if (!icon) return { icon: btn.dataset.icon || btn.className, missing: true };
            const r = icon.getBoundingClientRect();
            return {
                icon: btn.dataset.icon || icon.textContent,
                dx: Math.round(((r.left + r.width / 2) - (b.left + b.width / 2)) * 10) / 10,
                dy: Math.round(((r.top + r.height / 2) - (b.top + b.height / 2)) * 10) / 10,
            };
        });
    }, buttonSelector);
}

function assertCentered(metrics, maxOffset = 1.5) {
    const bad = metrics.filter(m => m.missing ||
        Math.abs(m.dx) > maxOffset || Math.abs(m.dy) > maxOffset);
    if (bad.length) {
        throw new Error('Off-center or missing icons: ' +
            JSON.stringify(bad));
    }
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

test.describe('toolbar icons + insert line', () => {
    let consoleErrors;
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        consoleErrors = [];
        pageErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', err => pageErrors.push(String(err)));
        await INIT(page);
    });

    test('flow-menu icons are centered in their buttons', async ({ page }) => {
        await openFlowMenu(page);
        assertCentered(await iconMetrics(page, '.fk-ui-inlineMenu .fk-button--inlineMenu'));
    });

    test('selection bubble icons are centered in their buttons', async ({ page }) => {
        await page.click('article.fk-editable h2', { clickCount: 3 });
        const bubble = page.locator('.fk-bubble');
        await expect(bubble).toBeVisible({ timeout: 4000 });
        await page.waitForFunction(() =>
            [...document.querySelectorAll('.fk-bubble [data-icon]')]
                .filter(el => el.querySelector('svg') || el.querySelector('.fk-icon-text')).length >= 3,
            null, { timeout: 4000 });
        await page.waitForTimeout(600);
        assertCentered(await iconMetrics(page, '.fk-bubble .fk-button'));
    });

    test('insert line: hr + paragraph, caret lands, editor keeps working', async ({ page }) => {
        await openFlowMenu(page);
        // data-icon sits ON the button element itself
        await page.locator('.fk-ui-inlineMenu [data-icon="hr"]').click();

        // the command runs 125ms after the click (menu hide first)
        await page.waitForFunction(() =>
            document.querySelector('article.fk-editable hr'), null, { timeout: 4000 });

        const state = await page.evaluate(() => {
            const article = document.querySelector('article.fk-editable');
            const hr = article.querySelector('hr');
            const after = hr && hr.nextElementSibling;
            const sel = window.getSelection();
            return {
                hrInArticle: !!hr,
                pAfterHr: !!after && after.tagName === 'P',
                caretInP: !!after && sel.rangeCount > 0 &&
                    after.contains(sel.getRangeAt(0).startContainer),
                articleChildren: [...article.children].map(c => c.tagName).join(','),
            };
        });
        expect(state.hrInArticle).toBe(true);
        expect(state.pAfterHr).toBe(true);
        expect(state.caretInP).toBe(true);

        // the editor must remain fully functional after the insertion
        await page.keyboard.type('after the line');
        const text = await page.evaluate(() =>
            document.querySelector('article.fk-editable hr').nextElementSibling.textContent);
        expect(text).toContain('after the line');

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
        await page.screenshot({ path: 'test-results/insert-line-after.png' });
    });

    test('arrow keys cross the hr between paragraphs', async ({ page }) => {
        // Native Chromium vertical caret movement is broken around block
        // void elements: ArrowUp from the paragraph below an hr jumps to
        // the article start instead of the paragraph above it.
        await page.evaluate(() => {
            const ed = window._editor;
            ed.setHTML('<p>above the line</p><hr><p>below the line</p>');
        });
        const caretTo = where => page.evaluate(where => {
            const ed = window._editor;
            const ps = document.querySelectorAll('article.fk-editable > p');
            const p = where === 'above' ? ps[0] : ps[1];
            ed.focus();
            ed.selection.placeCaret(p, { at: where === 'above' ? 'end' : 'start' });
            ed.updateContext(p);
        }, where);
        const caretBlockText = () => page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel.rangeCount) return null;
            const node = sel.getRangeAt(0).startContainer;
            const block = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node)
                ?.closest('p, h1, h2, h3, blockquote, li');
            return block ? block.textContent : null;
        });

        await caretTo('below');
        // let the observer queue drain (setHTML's normalizations + the
        // focus-checkpoint's marker dance land asynchronously) — a keypress
        // during churn races the context the arrow behavior reads
        await page.waitForFunction(() =>
            window._editor.mutationObserver.pending.length === 0, null, { timeout: 3000 });
        await page.keyboard.press('ArrowUp');
        // the caret move settles asynchronously after the keypress — poll
        // instead of reading once (the load-flaky assertion)
        await expect.poll(async () => await caretBlockText(), { timeout: 3000 })
            .toContain('above the line');

        await caretTo('above');
        await page.waitForFunction(() =>
            window._editor.mutationObserver.pending.length === 0, null, { timeout: 3000 });
        await page.keyboard.press('ArrowDown');
        await expect.poll(async () => await caretBlockText(), { timeout: 3000 })
            .toContain('below the line');
        expect(pageErrors).toEqual([]);
    });
});
