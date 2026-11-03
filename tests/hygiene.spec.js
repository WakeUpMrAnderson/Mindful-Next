/**
 * Phase 3 hygiene gates (flakiness fixes F8/F5/F6/F12/F11):
 *
 * - F8: a throwing restoreSelection must not leave undo/redo disabled
 * - F5: flow-menu commands act on the click-time context, and a stale
 *   pending execution cancels when the menu re-opens
 * - F6: getHTML round-trips nested content verbatim (the greedy fk-ui
 *   regex is gone)
 * - F12: timed follow-ups bail out on detached nodes (no pageerror)
 * - F11: icons decorate via delta roots anywhere in the document
 *
 * Run: npx playwright test tests/hygiene.spec.js
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

test.describe('phase 3 hygiene', () => {
    let pageErrors;
    let consoleErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        consoleErrors = [];
        page.on('pageerror', err => pageErrors.push(String(err)));
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        await INIT(page);
    });

    test('F8: undo survives a throwing restoreSelection', async ({ page }) => {
        await page.click('article.fk-editable');
        await page.keyboard.type('undo target ');
        await page.waitForTimeout(700);            // checkpoint
        await page.keyboard.type('more');
        await page.waitForTimeout(700);            // second checkpoint
        await page.evaluate(() => {
            const ed = window._editor;
            ed.__origRestore = ed.selection.restoreSelection;
            ed.selection.restoreSelection = () => { throw new Error('spec boom'); };
        });
        await page.keyboard.press('Control+z');    // the swap runs, the restore throws
        const state = await page.evaluate(() => ({
            historyEnabled: !window._editor.history.disabled,
            canUndoAgain: window._editor.history.canUndo(),
        }));
        await page.evaluate(() => {
            window._editor.selection.restoreSelection = window._editor.__origRestore;
        });
        expect(state.historyEnabled).toBe(true);   // try/finally re-enabled it
        expect(state.canUndoAgain).toBe(true);     // history usable, not wedged
    });

    test('F5: flow-menu command acts on the click-time line', async ({ page }) => {
        // two empty lines; open the flow-menu on the FIRST one
        await page.click('article.fk-editable');
        await page.evaluate(() => {
            const ed = window._editor;
            const article = document.querySelector('article.fk-editable');
            const p1 = document.createElement('p');
            p1.innerHTML = '<br>';
            const p2 = document.createElement('p');
            p2.innerHTML = '<br>';
            article.appendChild(p1);
            article.appendChild(p2);
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(p1);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            ed.selection.update();
            ed.updateContext(p1);
        });
        await page.keyboard.press('Space');        // opens the menu on p1
        await page.waitForFunction(() =>
            document.querySelector('.fk-ui-inlineMenu [data-icon="hr"]'), null, { timeout: 4000 });

        // click the hr button; the command executes 125ms later — move the
        // editor context to p2 INSIDE that window
        await page.locator('.fk-ui-inlineMenu [data-icon="hr"]').click();
        await page.evaluate(() => {
            const ed = window._editor;
            const ps = document.querySelectorAll('article.fk-editable > p');
            const p2 = ps[ps.length - 1];
            ed.updateContext(p2);
        });
        await page.waitForTimeout(400);

        const state = await page.evaluate(() => {
            const article = document.querySelector('article.fk-editable');
            const hr = article.querySelector('hr');
            return {
                hrExists: !!hr,
                exactlyOne: article.querySelectorAll('hr').length === 1,
                // insertHr puts its own fresh <p><br></p> after the hr; the
                // element BEFORE the hr must be the menu's click-time line
                // (which had text — "Happy writing") — pre-fix the hr landed
                // on whichever line the context had moved to
                hrReplacedClickLine: hr && hr.previousElementSibling &&
                    hr.previousElementSibling.textContent.includes('Happy writing'),
                lastPIntact: [...article.querySelectorAll('p')].pop().innerHTML === '<br>',
            };
        });
        expect(state.hrExists).toBe(true);
        expect(state.exactlyOne).toBe(true);
        expect(state.hrReplacedClickLine).toBe(true);
        expect(state.lastPIntact).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test('F6: getHTML round-trips nested content verbatim', async ({ page }) => {
        const result = await page.evaluate(() => {
            const ed = window._editor;
            const nested = '<h1>Title</h1><div class="fk-ui-looks-alike"><p>nested div keeps its text</p></div>' +
                '<p>bold <strong>strong</strong> and <em>em</em> and <a href="https://x.example">link</a></p>';
            ed.setHTML(nested);
            const out = ed.getHTML();
            return {
                nestedKept: out.includes('nested div keeps its text'),
                strongKept: out.includes('<strong>strong</strong>'),
                linkKept: out.includes('href="https://x.example"'),
                titleKept: out.includes('<h1>Title</h1>'),
            };
        });
        expect(result).toEqual({ nestedKept: true, strongKept: true, linkKept: true, titleKept: true });
    });

    test('F12: timed follow-ups bail out on detached nodes', async ({ page }) => {
        await page.evaluate(() => {
            const ed = window._editor;
            // indent on a DETACHED li — the 50ms timer must bail out
            const ul = document.createElement('ul');
            const li = document.createElement('li');
            li.innerHTML = 'detached';
            ul.appendChild(li);
            ed.behaviors.trigger('indent', {
                keyCode: 9, shiftKey: false, preventDefault() {},
            }, li, ed);
        });
        await page.waitForTimeout(120);   // indent timer = 50ms
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('F11: icons decorate via delta roots anywhere in the document', async ({ page }) => {
        // a [data-icon] appended to an arbitrary (non-editor, non-ui) body
        // container must still be decorated by the delta collection
        await page.evaluate(() => {
            const host = document.createElement('div');
            host.id = 'spec-icon-host';
            host.innerHTML = '<span data-icon="info"></span>';
            document.body.appendChild(host);
        });
        await page.waitForFunction(() =>
            document.querySelector('#spec-icon-host [data-icon] svg'), null, { timeout: 2000 });
        expect(pageErrors).toEqual([]);
    });

    test('F10: desktop (fine pointer) stays desktop', async ({ page }) => {
        await page.click('article.fk-editable h2', { clickCount: 3 });
        await page.waitForTimeout(300);
        const desktop = await page.evaluate(() => {
            const bubblePlugin = window._editor._plugins.find(p => p.bubbleView);
            return {
                isMobile: window._editor.context.isMobile,
                maxButtons: bubblePlugin ? bubblePlugin.bubbleView.maxButtons : null,
            };
        });
        expect(desktop.isMobile).toBe(false);
        expect(desktop.maxButtons).toBe(7);   // desktop bubble, no pagination bump
    });

    test('F10: phone-sized touch device boots into mobile mode', async ({ page }) => {
        // coarse pointer + no hover + 500px viewport — the detector must
        // classify this as mobile (maxButtons 10, docked bubble path)
        const phone = await page.context().browser().newContext({
            viewport: { width: 500, height: 700 },
        });
        const p2 = await phone.newPage();
        await p2.addInitScript(() => {
            localStorage.clear();
            localStorage.setItem('hidemode', 'show');
            // emulate a coarse, hover-less primary pointer BEFORE boot
            const realMM = window.matchMedia ? window.matchMedia.bind(window) : null;
            window.matchMedia = (q) => {
                if (q.includes('pointer: coarse') || q.includes('hover: none')) {
                    return { matches: true, media: q,
                        addEventListener() {}, removeEventListener() {},
                        addListener() {}, removeListener() {} };
                }
                return realMM ? realMM(q) : { matches: false, media: q,
                    addEventListener() {}, removeEventListener() {},
                    addListener() {}, removeListener() {} };
            };
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
        await p2.goto('/dist/index.html');
        await unlockVault(p2);
        await p2.waitForTimeout(200);
        const mobile = await p2.evaluate(() => ({
            isMobile: window._editor.context.isMobile,
            maxButtons: (() => {
                const plugin = window._editor._plugins.find(p => p.bubbleView);
                return plugin ? plugin.bubbleView.maxButtons : null;
            })(),
        }));
        expect(mobile.isMobile).toBe(true);
        expect(mobile.maxButtons).toBe(10);
        await phone.close();
    });


    test('dots-flow bubble anchors on the first item text (caret at item start)', async ({ page }) => {
        // cursor at the beginning of item one + clicking the dots runs
        // selectNodeContents(OL) — its client rects interleave full-width
        // line boxes with the narrow text rects; the bubble must anchor
        // on the TEXT extent, not the column-wide line box
        await page.evaluate(() => {
            window._editor.setHTML('<ol><li>test</li><li>test</li><li>test</li></ol>');
        });
        await page.waitForTimeout(200);
        const li = page.locator('article.fk-editable ol li').first();
        const lb = await li.boundingBox();
        await page.mouse.move(lb.x + 8, lb.y + lb.height / 2);
        await page.mouse.click(lb.x + 2, lb.y + lb.height / 2);   // caret at start
        await page.waitForTimeout(150);
        const db = await page.locator('.fk-ui-dots').boundingBox();
        await page.mouse.click(db.x + db.width / 2, db.y + db.height / 2);
        await page.waitForTimeout(500);

        const state = await page.evaluate(() => {
            const bubble = document.querySelector('.fk-bubble');
            const b = bubble.getBoundingClientRect();
            const li = document.querySelector('article.fk-editable ol li');
            const liText = li.getBoundingClientRect();
            // the text extent of li1: from its left edge to its text end
            const center = b.left + b.width / 2;
            return {
                visible: bubble.classList.contains('fk-bubble--visible'),
                nearFirstItemText: center >= liText.left - 10 && center <= liText.left + 120,
                aboveFirstItem: Math.abs(b.top - (liText.top - b.height - 10)) <= 12,
            };
        });
        expect(state.visible).toBe(true);
        expect(state.nearFirstItemText).toBe(true);
        expect(state.aboveFirstItem).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test('list-selection bubble anchors above the selection first line', async ({ page }) => {
        // multi-item list selections: the union rect spans the full column
        // width, so centering on it drifts the bubble toward the screen
        // edges — it must anchor above the FIRST line of the selection
        const first = page.locator('article.fk-editable ul li').first();
        const third = page.locator('article.fk-editable ul li').nth(2);
        const fb = await first.boundingBox();
        const tb = await third.boundingBox();
        await page.mouse.move(fb.x + 30, fb.y + fb.height / 2);
        await page.mouse.down();
        await page.mouse.move(tb.x + 30, tb.y + tb.height / 2, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(600);

        const state = await page.evaluate(() => {
            const bubble = document.querySelector('.fk-bubble');
            const b = bubble.getBoundingClientRect();
            const sel = window.getSelection();
            const rects = sel.rangeCount ? sel.getRangeAt(0).getClientRects() : [];
            const first = rects[0];
            const center = b.left + b.width / 2;
            return {
                visible: bubble.classList.contains('fk-bubble--visible'),
                withinFirstLine: first &&
                    center >= first.left - b.width / 2 - 8 &&
                    center <= first.right + b.width / 2 + 8,
                aboveFirstLine: Math.abs(b.top - (first.top - b.height - 10)) <= 2,
            };
        });
        expect(state.visible).toBe(true);
        expect(state.withinFirstLine).toBe(true);
        expect(state.aboveFirstLine).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test('first run follows the OS theme; an explicit choice wins after', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        // goto, not reload: a reloaded document can read matchMedia
        // before the emulation is re-applied and bake in the wrong theme
        await page.goto('/dist/index.html');
        await page.waitForFunction(() => window._editor);
        await expect.poll(() => page.evaluate(() =>
            document.documentElement.classList.contains('night'))).toBe(true);
        // first-run only — the OS never writes the user's choice
        expect(await page.evaluate(() => localStorage.getItem('daymode'))).toBe(null);
        // the user's explicit choice — re-applied by a LATER init script
        // (INIT's localStorage.clear runs first: init scripts execute in
        // registration order), otherwise the harness would wipe it
        await page.addInitScript(() => localStorage.setItem('daymode', 'day'));
        await page.goto('/dist/index.html');
        await page.waitForFunction(() => window._editor);
        await expect.poll(() => page.evaluate(() =>
            document.documentElement.classList.contains('day'))).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test('print stylesheet strips chrome and forces paper-safe colors', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        const day = await page.evaluate(() => ({
            rail: getComputedStyle(document.querySelector('.fk-icon-settings')).display,
            bodyBg: getComputedStyle(document.body).backgroundColor,
            bodyColor: getComputedStyle(document.body).color,
            bodyMaxWidth: getComputedStyle(document.body).maxWidth,
        }));
        expect(day.rail).toBe('none');
        expect(day.bodyBg).toBe('rgb(255, 255, 255)');
        expect(day.bodyColor).toBe('rgb(0, 0, 0)');
        expect(day.bodyMaxWidth).toBe('none');
        // night theme must print paper-safe too — boot night via the OS
        // emulation (INIT clears localStorage on every navigation, so a
        // setItem+reload would be wiped)
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.goto('/dist/index.html');
        await page.waitForFunction(() => window._editor);
        await page.emulateMedia({ media: 'print' });
        const night = await page.evaluate(() => ({
            bodyBg: getComputedStyle(document.body).backgroundColor,
            h2: getComputedStyle(document.querySelector('article h2') || document.querySelector('article')).color,
        }));
        expect(night.bodyBg).toBe('rgb(255, 255, 255)');
        expect(night.h2).toBe('rgb(0, 0, 0)');
        await page.emulateMedia({ media: null });
        expect(pageErrors).toEqual([]);
    });
});