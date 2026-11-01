/**
 * Pill design-parity gate: the selection bubble (B/I/S/link on selected
 * text) must render with the EXACT same pill design as the empty-line
 * flow-menu (H1/H2/quote/lists under the dots) — same capsule, same
 * glass, same button circles, same theme behavior, day and night.
 *
 * The test opens both paths, captures computed styles of the container
 * and a plain button on each (each captured WHILE OPEN and settled),
 * and asserts equality on every shared visual property. Positioning
 * mechanics (top/left/z-index) and natural width (different button
 * counts) are excluded on purpose.
 *
 * Run: npx playwright test tests/pill.spec.js
 */
const { test, expect } = require('playwright/test');

// Visual identity properties — these must be IDENTICAL on both hosts.
const CONTAINER_PROPS = [
    'background-color', 'border-top-width', 'border-top-style', 'border-top-color',
    'border-bottom-left-radius', 'border-top-right-radius',
    'box-shadow', 'backdrop-filter', '-webkit-backdrop-filter',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'color', 'opacity', 'transform', 'height',
];
const BUTTON_PROPS = [
    'width', 'height', 'border-top-width', 'border-top-style', 'border-top-color',
    'border-bottom-left-radius', 'border-top-right-radius',
    'margin-top', 'margin-left', 'margin-right',
    'line-height', 'font-size', 'background-color', 'color', 'opacity',
];

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
    // Suite-proven recipe: empty block + selection inside it + Space.
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
    const button = page.locator('.fk-ui-inlineMenu .fk-button--inlineMenu').first();
    await expect(button).toBeVisible({ timeout: 4000 });
    await page.waitForFunction(() =>
        [...document.querySelectorAll('.fk-ui-inlineMenu [data-icon]')]
            .filter(el => el.querySelector('svg') || el.querySelector('.fk-icon-text')).length >= 7,
        null, { timeout: 4000 });
}

async function openSelectionBubble(page) {
    // Suite-proven recipe: triple-click the h2 → partial selection bubble.
    await page.click('article.fk-editable h2', { clickCount: 3 });
    const bubble = page.locator('.fk-bubble');
    await expect(bubble).toBeVisible({ timeout: 4000 });
    await expect(bubble).toHaveClass(/fk-bubble--visible/);
    await page.waitForFunction(() =>
        [...document.querySelectorAll('.fk-bubble [data-icon]')]
            .filter(el => el.querySelector('svg') || el.querySelector('.fk-icon-text')).length >= 3,
        null, { timeout: 4000 });
}

// Wait out the entrance transition so computed styles are the settled
// visible-state values, not mid-fade samples. The container fade plus
// the per-button stagger take ~400ms; a fixed settle keeps captures
// deterministic.
async function settleVisible(page, selector) {
    await page.waitForFunction(
        sel => {
            const el = document.querySelector(sel);
            return el && getComputedStyle(el).opacity === '1';
        }, selector, { timeout: 4000 });
    await page.waitForTimeout(500);
}

// Matrix values can carry mid-animation float residue (e.g. 8.7e-07);
// round matrix components so settled states compare equal.
function normalize(value) {
    if (/^matrix\(/.test(value)) {
        return value.replace(/-?\d+\.?\d*(e-\d+)?/g, n => String(Math.round(parseFloat(n) * 1000) / 1000));
    }
    return value;
}

async function captureHost(page, host) {
    return page.evaluate(([containerProps, buttonProps, which]) => {
        const pick = (el, props) => {
            if (!el) throw new Error(`captureHost: ${which} container missing`);
            const cs = getComputedStyle(el);
            return Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p)]));
        };
        if (which === 'pill') {
            const menu = document.querySelector('.fk-ui-inlineMenu');
            const button = [...menu.querySelectorAll('.fk-button--inlineMenu')]
                .find(el => !el.classList.contains('fk-button--focused') &&
                            !el.classList.contains('fk-button--active'));
            return { container: pick(menu, containerProps), button: pick(button, buttonProps) };
        }
        const bubble = document.querySelector('.fk-bubble');
        const button = [...bubble.querySelectorAll('.fk-button')]
            .find(el => !el.classList.contains('fk-button--active'));
        return { container: pick(bubble, containerProps), button: pick(button, buttonProps) };
    }, [CONTAINER_PROPS, BUTTON_PROPS, host]).then(captured => {
        for (const group of ['container', 'button']) {
            for (const prop of Object.keys(captured[group])) {
                captured[group][prop] = normalize(captured[group][prop]);
            }
        }
        return captured;
    });
}

function styleDiff(pill, bubble) {
    const diff = [];
    for (const group of ['container', 'button']) {
        for (const [prop, pillValue] of Object.entries(pill[group])) {
            const bubbleValue = bubble[group][prop];
            if (pillValue !== bubbleValue) {
                diff.push(`  ${group}.${prop}: pill=${pillValue}  bubble=${bubbleValue}`);
            }
        }
    }
    return diff;
}

async function assertParity(page, phase) {
    await openFlowMenu(page);
    await settleVisible(page, '.fk-ui-inlineMenu');
    const pill = await captureHost(page, 'pill');
    await page.screenshot({ path: `test-results/pill-${phase}-flowmenu.png` });

    await page.keyboard.press('a');
    await openSelectionBubble(page);
    await settleVisible(page, '.fk-bubble');
    const bubble = await captureHost(page, 'bubble');
    await page.screenshot({ path: `test-results/pill-${phase}-bubble.png` });

    const diff = styleDiff(pill, bubble);
    if (diff.length) {
        throw new Error(`Pill/bubble style mismatch (${phase}):\n` + diff.join('\n'));
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

test.describe('pill design parity', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(String(err)));
        await INIT(page);
    });

    test('selection bubble matches the flow-menu pill (day)', async ({ page }) => {
        await assertParity(page, 'day');
        expect(pageErrors).toEqual([]);
    });

    test('selection bubble matches the flow-menu pill (night)', async ({ page }) => {
        await page.locator('.fk-icon-nightmode').dispatchEvent('click');
        await assertParity(page, 'night');
        expect(pageErrors).toEqual([]);
    });
});
