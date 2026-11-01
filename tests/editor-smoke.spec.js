/**
 * Editor smoke suite: the rebuilt readable bundle boots, edits, toggles,
 * persists, and stays clean in the console. Optionally also runs the same
 * checklist against /legacy/index-legacy.html (the original 2016 bundle)
 * when that A/B baseline is present — a pure behavioral-parity gate for
 * private rebuild setups; the public tree ships without it.
 *
 * Run: npm test   (serves the repo via playwright.config webServer)
 */
const { test, expect } = require('playwright/test');
const fs = require('fs');
const path = require('path');

const BUNDLES = [{ name: 'rebuilt', path: '/dist/index.html' }];
// The legacy A/B baseline is an optional private fixture — skip when absent
// so the public tree runs a green suite without it.
if (fs.existsSync(path.join(__dirname, '..', 'legacy', 'index-legacy.html'))) {
    BUNDLES.push({ name: 'legacy', path: '/legacy/index-legacy.html' });
}

/**
 * The vault gates the editor behind a passphrase. Fresh test profiles hit
 * the first-run setup; later tests in the same page context would hit the
 * unlock screen. Either way, drive the real UI once so every check runs
 * against an unlocked editor.
 */
async function ensureVaultUnlocked(page) {
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
    await page.waitForFunction(() =>
        document.querySelector('article.fk-editable').getAttribute('contenteditable') === 'true');
}

for (const bundle of BUNDLES) {
    test.describe(`editor smoke — ${bundle.name}`, () => {
        let consoleErrors;
        let pageErrors;

        test.beforeEach(async ({ page }) => {
            consoleErrors = [];
            pageErrors = [];
            page.on('console', msg => {
                if (msg.type() === 'error') consoleErrors.push(msg.text());
            });
            page.on('pageerror', err => pageErrors.push(String(err)));
            // Fresh profile gotcha: default hidemode='hide' makes the
            // article unclickable.
            // The mindful plugin dereferences the `chrome` extension API at
            // init, so both bundles need a minimal stub under plain http.
            await page.addInitScript(() => {
                localStorage.clear();
                localStorage.setItem('hidemode', 'show');
                window.chrome = {
                    runtime: { getManifest: () => ({ version: '0.9.8210' }) },
                    storage: {
                        sync: {
                            get: (keys, cb) => cb && cb({}),
                            set: (items, cb) => cb && cb(),
                            remove: (keys, cb) => cb && cb(),
                        },
                        local: {
                            get: (keys, cb) => cb && cb({}),
                            set: (items, cb) => cb && cb(),
                            remove: (keys, cb) => cb && cb(),
                        },
                        session: {
                            get: (keys, cb) => cb && cb({}),
                            set: (items, cb) => cb && cb(),
                            remove: (keys, cb) => cb && cb(),
                        },
                        onChanged: { addListener: () => {} },
                    },
                };
            });
            await page.goto(bundle.path);
            await ensureVaultUnlocked(page);
        });

        test('boots: editor instance bound to a contenteditable article', async ({ page }) => {
            const boot = await page.evaluate(() => ({
                hasEditor: !!window._editor,
                editable: document.querySelector('article.fk-editable').getAttribute('contenteditable'),
                pluginCount: (window._editor._plugins || []).length,
                vaultState: window._vault && window._vault.state,
            }));
            expect(boot.hasEditor).toBe(true);
            expect(boot.editable).toBe('true');
            expect(boot.pluginCount).toBe(8);
            expect(boot.vaultState).toBe('unlocked');
        });

        test('typing reaches the editor DOM', async ({ page }) => {
            await page.click('article.fk-editable');
            await page.keyboard.type('parity check ');
            const text = await page.evaluate(() =>
                document.querySelector('article.fk-editable').textContent);
            expect(text).toContain('parity check');
        });

        test('flow-menu appears on an empty paragraph', async ({ page }) => {
            await page.click('article.fk-editable');
            // Create an empty block, move the selection into it and update the
            // editor context through its own API (the same path the editor's
            // plugins use), then send a trusted Space — the InlineMenu
            // toggleHandler opens the flow-menu in exactly that state.
            const contextTag = await page.evaluate(() => {
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
                return ed.context.closestElementWithRules ?
                    ed.context.closestElementWithRules.tagName : null;
            });
            expect(contextTag).toBe('P');
            await page.keyboard.press('Space');
            // The menu CONTAINER keeps `visibility: hidden` by design (2016
            // CSS quirk — only the buttons flip to visible via
            // `.fk-ui .fk-show .fk-button--inlineMenu`), so assert on a button.
            const menuButton = page.locator('.fk-ui-inlineMenu .fk-button--inlineMenu').first();
            await expect(menuButton).toBeVisible({ timeout: 4000 });
            // menu buttons carry inline icons (frontkit font replacement):
            // SVG icons plus typographic text glyphs (H1/H2/quote). The icon
            // decorator fills them via a rAF batch — wait for all 7.
            await page.waitForFunction(() =>
                [...document.querySelectorAll('.fk-ui-inlineMenu [data-icon]')]
                    .filter(el => el.querySelector('svg') || el.querySelector('.fk-icon-text')).length >= 7,
                null, { timeout: 4000 });

        });

        test('keys after flow-menu on an empty line do not throw', async ({ page }) => {
            // Long-term testing regression: with the flow-menu open on an
            // EMPTY line, any keyup threw `TypeError: Cannot read properties
            // of undefined (reading 'property')` from
            // getAdjacentVoidElement → Dom.hidesCursor. The editor's own
            // selection fixing (fix(), behaviors, commands) can leave a
            // collapsed range at the ARTICLE level, whose children[]
            // substitution lands on undefined/text nodes — hidesCursor then
            // runs on a non-HTMLElement and forElement returns undefined.
            // Drive exactly those states through the real keyup pipeline.
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
            const menuButton = page.locator('.fk-ui-inlineMenu .fk-button--inlineMenu').first();
            await expect(menuButton).toBeVisible({ timeout: 4000 });

            // Hazardous collapsed ranges at the article level (what the
            // editor's selection fixing can leave behind on an empty line):
            // offset 0 → ec = children[-1] = undefined; offset past the
            // child list → sc = undefined. A real keyup on each must not
            // throw.
            const hazardousOffsets = await page.evaluate(() => {
                const article = document.querySelector('article.fk-editable');
                const sel = window.getSelection();
                return [0, article.children.length].map(offset => {
                    const range = document.createRange();
                    range.setStart(article, offset);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    article.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                    return offset;
                });
            });
            expect(hazardousOffsets[0]).toBe(0);
            expect(hazardousOffsets[1]).toBeGreaterThan(0);

            await page.keyboard.press('a');
            await page.keyboard.press('ArrowLeft');
            await page.keyboard.press('Backspace');
            expect(pageErrors).toEqual([]);
        });

        test('selection shows the Vue bubble UI', async ({ page }) => {
            await page.click('article.fk-editable h2', { clickCount: 3 });
            const bubble = page.locator('.fk-bubble');
            await expect(bubble).toBeVisible({ timeout: 4000 });
            await expect(bubble).toHaveClass(/fk-bubble--visible/);
            // bubble action buttons carry inline SVG icons too
            const svgCount = await page.evaluate(() =>
                document.querySelectorAll('.fk-bubble [data-icon] svg').length);
            expect(svgCount).toBeGreaterThanOrEqual(1);
        });

        test('night-mode toggle switches html.night and back', async ({ page }) => {
            // The .mindful-toggle icons are stacked; hit-testing can land on a
            // neighbor, so dispatch the click on the bound element itself.
            await page.locator('.fk-icon-nightmode').dispatchEvent('click');
            expect(await page.evaluate(() =>
                document.documentElement.classList.contains('night'))).toBe(true);
            await page.locator('.fk-icon-nightmode').dispatchEvent('click');
            expect(await page.evaluate(() =>
                document.documentElement.classList.contains('day'))).toBe(true);
        });

        test('caret overlay places the smooth caret on click', async ({ page }) => {
            await page.click('article.fk-editable');
            const caret = page.locator('.mfk-caret');
            await expect(caret).toHaveCount(1);
            await expect(caret).toBeVisible();
        });

        test('vault owns persistence and is unlocked with a non-extractable key', async ({ page }) => {
            const vault = await page.evaluate(() => ({
                present: !!window._vault,
                state: window._vault && window._vault.state,
                keyNonExtractable: !!(window._vault && window._vault.key &&
                    window._vault.key.extractable === false),
            }));
            expect(vault.present).toBe(true);
            expect(vault.state).toBe('unlocked');
            expect(vault.keyNonExtractable).toBe(true);
        });

        test('no page errors and no console errors', async () => {
            expect(pageErrors).toEqual([]);
            expect(consoleErrors).toEqual([]);
        });
    });
}
