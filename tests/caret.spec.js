/**
 * Caret overlay regression suite (UNFINISHED item — the highest-value gap
 * left by the smooth-caret branch, whose verification script was ephemeral).
 *
 * Grounded in caret-smooth.js / caret.css:
 *  - .mfk-caret overlay on <body>; hidden via .mfk-caret--hidden
 *  - html.mfk-overlay-active gates the native caret-color suppression
 *  - visibility keyed on EDITOR FOCUS (Chromium anchors selection outside
 *    the article while typing), not on selection containment
 *  - measurement chain: range rects -> nearestTextRect walk (element-anchored
 *    collapsed selections report zero rects in Chromium) -> containing-block
 *    fallback (empty paragraphs)
 *  - typing: beforeinput adds .mfk-caret--typing for TYPING_PAUSE_MS=600
 *  - blink: mfk-blink 1.1s; typing: mfk-solid; night: #dadada; reduced
 *    motion: animation none
 *
 * Run: npm test  (serves the repo; runs against /dist/index.html)
 */
const { test, expect } = require('playwright/test');

/** Drive the vault's real first-run/unlock UI so the editor is usable. */
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

test.describe('caret overlay', () => {
    let consoleErrors;
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        consoleErrors = [];
        pageErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', err => pageErrors.push(String(err)));
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
        await page.goto('/dist/index.html');
        await ensureVaultUnlocked(page);
    });

    async function caretVisible(page) {
        // The blink animation may hold opacity at 0 — visibility here means
        // "the overlay is rendering a position", i.e. not display:none.
        return page.evaluate(() => {
            const caret = document.querySelector('.mfk-caret');
            return !!caret && !caret.classList.contains('mfk-caret--hidden');
        });
    }

    async function caretBox(page) {
        return page.evaluate(() => {
            const caret = document.querySelector('.mfk-caret');
            const r = caret.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
        });
    }

    test('exactly one overlay exists and starts hidden', async ({ page }) => {
        // The vault auto-focuses the article after unlock, so the caret is
        // legitimately visible at first — blur to reach the resting state.
        await page.evaluate(() => document.activeElement.blur());
        await page.waitForTimeout(150);
        expect(await page.locator('.mfk-caret').count()).toBe(1);
        expect(await caretVisible(page)).toBe(false);
        expect(await page.evaluate(() =>
            document.documentElement.classList.contains('mfk-overlay-active'))).toBe(false);
    });

    test('click places the overlay at the click point', async ({ page }) => {
        const target = page.locator('article.fk-editable p').nth(1);
        const box = await target.boundingBox();
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        await page.mouse.click(cx, cy);
        await page.waitForTimeout(150);

        expect(await caretVisible(page)).toBe(true);
        const caret = await caretBox(page);
        // Caret sits at the text boundary nearest the click, and on the
        // clicked line — tolerance covers word boundaries and line height.
        expect(Math.abs(caret.x - cx)).toBeLessThan(60);
        expect(Math.abs(caret.y - cy)).toBeLessThan(30);
        expect(await page.evaluate(() =>
            document.documentElement.classList.contains('mfk-overlay-active'))).toBe(true);
    });

    test('element-anchored collapsed selection still places the caret (nearestTextRect walk)', async ({ page }) => {
        // Chromium quirk: a collapsed range anchored to an ELEMENT reports
        // zero client rects — the caret must recover via the synthetic-range
        // nearest-text lookup.
        await page.evaluate(() => {
            const p = document.querySelector('article.fk-editable p');
            const range = document.createRange();
            range.setStart(p, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            document.dispatchEvent(new Event('selectionchange'));
        });
        await page.waitForTimeout(150);

        expect(await caretVisible(page)).toBe(true);
        const pBox = await page.locator('article.fk-editable p').first().boundingBox();
        const caret = await caretBox(page);
        expect(caret.x).toBeGreaterThanOrEqual(pBox.x - 2);
        expect(caret.x).toBeLessThan(pBox.x + pBox.width);
        expect(Math.abs(caret.y - pBox.y)).toBeLessThan(30);
    });

    test('typing keeps the caret solid for 600ms, then blinking resumes', async ({ page }) => {
        await page.click('article.fk-editable');
        await page.waitForTimeout(150);
        await page.keyboard.type('a');

        const anim = await page.evaluate(() =>
            getComputedStyle(document.querySelector('.mfk-caret')).animationName);
        expect(anim).toBe('mfk-solid');

        // TYPING_PAUSE_MS = 600
        await page.waitForTimeout(1000);
        expect(await page.evaluate(() =>
            getComputedStyle(document.querySelector('.mfk-caret')).animationName)).toBe('mfk-blink');
    });

    test('caret advances with typing and glides via the 80ms transform transition', async ({ page }) => {
        await page.click('article.fk-editable');
        await page.waitForTimeout(150);
        const before = (await caretBox(page)).x;

        await page.keyboard.type('word');
        await page.waitForTimeout(150);
        const after = (await caretBox(page)).x;
        expect(after).toBeGreaterThan(before);

        const transition = await page.evaluate(() => {
            const cs = getComputedStyle(document.querySelector('.mfk-caret'));
            return { duration: cs.transitionDuration, prop: cs.transitionProperty };
        });
        expect(transition.duration).toContain('0.08s');
        expect(transition.prop).toContain('transform');
    });

    test('ranged selection hides the overlay and restores the native caret', async ({ page }) => {
        await page.click('article.fk-editable');
        await page.waitForTimeout(150);
        expect(await caretVisible(page)).toBe(true);

        // Triple-click a heading: a ranged selection, not a collapsed caret.
        await page.click('article.fk-editable h2', { clickCount: 3 });
        await page.waitForTimeout(150);

        expect(await caretVisible(page)).toBe(false);
        expect(await page.evaluate(() =>
            document.documentElement.classList.contains('mfk-overlay-active'))).toBe(false);
    });

    test('blur via a non-selection-changing control hides the overlay', async ({ page }) => {
        await page.click('article.fk-editable');
        await page.waitForTimeout(150);
        expect(await caretVisible(page)).toBe(true);

        // The info icon is not focusable and does not change the selection —
        // a REAL click blurs the article (synthetic clicks don't move focus),
        // which is what must hide the overlay.
        await page.locator('.fk-icon-info').click();
        await page.waitForTimeout(150);

        expect(await caretVisible(page)).toBe(false);
        expect(await page.evaluate(() =>
            document.documentElement.classList.contains('mfk-overlay-active'))).toBe(false);
    });

    test('focusin shows the overlay (the Tab-entry / refocus path)', async ({ page }) => {
        // The vault auto-focuses the article after unlock, so blur to the
        // resting state first. Any focusin on the article — a literal Tab
        // entry, alt-tab back, or script focus — must re-show the overlay
        // (the "invisible caret on Tab-entry" bug the focusin/focusout
        // listeners fixed). Literal Tab is not asserted because the vault's
        // own post-unlock focus anchors sequential navigation at the article,
        // sending the first Tab past it.
        await page.evaluate(() => document.activeElement.blur());
        await page.waitForTimeout(150);
        expect(await caretVisible(page)).toBe(false);

        await page.evaluate(() => document.querySelector('article.fk-editable').focus());
        await page.waitForTimeout(150);
        expect(await page.evaluate(() =>
            document.activeElement.classList.contains('fk-editable'))).toBe(true);
        expect(await caretVisible(page)).toBe(true);
        expect(await page.evaluate(() =>
            document.documentElement.classList.contains('mfk-overlay-active'))).toBe(true);
    });

    test('refocus with unchanged selection re-shows the overlay at the same spot', async ({ page }) => {
        await page.click('article.fk-editable');
        await page.waitForTimeout(150);
        const before = await caretBox(page);

        // Script blur: focusout hides the overlay; the selection and the
        // focus-navigation anchor both stay put.
        await page.evaluate(() => document.activeElement.blur());
        await page.waitForTimeout(150);
        expect(await caretVisible(page)).toBe(false);

        // Script refocus fires focusin -> update() re-shows the caret at the
        // unchanged selection. This is the "invisible caret on refocus" bug
        // the focusin/focusout listeners fixed.
        await page.evaluate(() => document.querySelector('article.fk-editable').focus());
        await page.waitForTimeout(150);
        expect(await caretVisible(page)).toBe(true);
        const after = await caretBox(page);
        expect(Math.abs(after.x - before.x)).toBeLessThan(2);
        expect(Math.abs(after.y - before.y)).toBeLessThan(2);
    });

    test('empty paragraph places the caret via the containing-block fallback', async ({ page }) => {
        await page.evaluate(() => {
            const article = document.querySelector('article.fk-editable');
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            article.appendChild(p);
        });
        // Select into the empty paragraph — element-anchored with no text
        // node inside, forcing the containing-block fallback path.
        await page.evaluate(() => {
            const p = document.querySelector('article.fk-editable').lastElementChild;
            const range = document.createRange();
            range.setStart(p, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            document.dispatchEvent(new Event('selectionchange'));
        });
        await page.waitForTimeout(150);

        expect(await caretVisible(page)).toBe(true);
        const pBox = await page.locator('article.fk-editable > p:last-child').boundingBox();
        const caret = await caretBox(page);
        expect(caret.x).toBeGreaterThanOrEqual(pBox.x - 2);
        expect(Math.abs(caret.y - pBox.y)).toBeLessThan(30);
        // FALLBACK/line-height height, not a collapsed zero-height rect
        expect(caret.h).toBeGreaterThan(10);
    });

    test('night mode swaps the caret color', async ({ page }) => {
        await page.click('article.fk-editable');
        await page.waitForTimeout(150);
        const day = await page.evaluate(() =>
            getComputedStyle(document.querySelector('.mfk-caret')).backgroundColor);
        expect(day).toBe('rgb(17, 17, 17)'); // #111

        await page.locator('.fk-icon-nightmode').dispatchEvent('click');
        await page.waitForTimeout(150);
        const night = await page.evaluate(() =>
            getComputedStyle(document.querySelector('.mfk-caret')).backgroundColor);
        expect(night).toBe('rgb(218, 218, 218)'); // #dadada
    });

    test('prefers-reduced-motion disables the blink and keeps the caret solid', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.click('article.fk-editable');
        await page.waitForTimeout(150);

        const cs = await page.evaluate(() => {
            const s = getComputedStyle(document.querySelector('.mfk-caret'));
            return { animation: s.animationName, opacity: s.opacity };
        });
        expect(cs.animation).toBe('none');
        expect(cs.opacity).toBe('1');
    });

    test('no page errors and no console errors', async () => {
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
