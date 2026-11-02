/**
 * Settings side-panel gates (F-options, drawer edition):
 *
 * - the panel opens from the settings gear and slides in from the right
 * - the width slider + mini input apply the body width LIVE (smooth: the
 *   body has a width/max-width transition) and persist to
 *   localStorage editorwidth (30-90); the slider steps 5%, the input
 *   clamps
 * - a stored editorwidth applies on boot; the default (no key) leaves
 *   the 2016 layout untouched, with the minimum 24px side gaps
 * - night theme follows the shared daymode key
 *
 * Run: npx playwright test tests/settings-panel.spec.js
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
        // chrome.storage.session survives page reloads within a browser
        // session — back it with a localStorage bag so the strict /
        // silent-restore tests can observe cross-navigation behavior.
        // local/sync stay in-memory and reset per navigation.
        const bag = localStorage.getItem('__mockSessionBag');
        localStorage.clear();
        if (bag !== null) localStorage.setItem('__mockSessionBag', bag);
        localStorage.setItem('hidemode', 'show');
        const mem = { local: {}, sync: {}, session: null };
        try { mem.session = JSON.parse(localStorage.getItem('__mockSessionBag') || '{}') || {}; } catch (e) { mem.session = {}; }
        if (typeof mem.session !== 'object' || mem.session === null) mem.session = {};
        const persistSession = () => localStorage.setItem('__mockSessionBag', JSON.stringify(mem.session));
        const area = name => ({
            get: (keys, cb) => {
                const out = {};
                (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in mem[name]) out[k] = mem[name][k]; });
                cb && cb(out);
            },
            set: (items, cb) => { Object.assign(mem[name], items); if (name === 'session') persistSession(); cb && cb(); },
            remove: (keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete mem[name][k]); if (name === 'session') persistSession(); cb && cb(); },
        });
        window.chrome = {
            __mem: mem,
            runtime: { getManifest: () => ({ version: '0.9.8210' }) },
            storage: {
                sync: area('sync'), local: area('local'), session: area('session'),
                onChanged: { addListener: () => {} },
            },
        };
    });
    await page.goto('/dist/index.html');
    await unlockVault(page);
};

test.describe('settings side panel', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(String(err)));
        await INIT(page);
    });

    test('default: no editorwidth key leaves the 2016 layout untouched, with minimum side gaps', async ({ page }) => {
        const state = await page.evaluate(() => {
            const body = document.body.getBoundingClientRect();
            return {
                width: Math.round(body.width),
                viewport: window.innerWidth,
            };
        });
        // 80% of 1280 = 1024 capped at min(688, 1280-48) = 688
        expect(Math.abs(state.width - 688)).toBeLessThanOrEqual(2);
        expect(pageErrors).toEqual([]);
    });

    test('the panel opens from the gear, slides in, and the width applies live', async ({ page }) => {
        await page.locator('.fk-icon-settings').dispatchEvent('click');
        await page.waitForFunction(() =>
            document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'),
            null, { timeout: 3000 });
        await page.waitForTimeout(350);   // the .25s slide — settled capture, never mid-animation
        const open = await page.evaluate(() => {
            const p = document.querySelector('.mfk-settings-panel');
            const cs = getComputedStyle(p);
            return {
                transform: cs.transform,
                slides: cs.transitionProperty.includes('transform') &&
                    parseFloat(cs.transitionDuration) > 0,
            };
        });
        expect(open.transform).toBe('none');          // slid fully in
        expect(open.slides).toBe(true);               // smooth slide

        // width change applies live and smoothly (body transition present)
        await page.evaluate(() => {
            const s = document.querySelector('.mfk-settings-width');
            s.value = '55';
            s.dispatchEvent(new Event('input'));
        });
        await page.waitForTimeout(350);   // the .25s body transition
        const state = await page.evaluate(() => {
            const body = document.body.getBoundingClientRect();
            const bodyTransition = getComputedStyle(document.body).transition;
            return {
                width: Math.round(body.width),
                viewport: window.innerWidth,
                stored: localStorage.getItem('editorwidth'),
                smooth: bodyTransition.includes('width'),
            };
        });
        expect(Math.abs(state.width - state.viewport * 0.55)).toBeLessThanOrEqual(2);
        expect(state.stored).toBe('55');
        expect(state.smooth).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test('the mini input clamps and a stored width applies on boot', async ({ page }) => {
        await page.locator('.fk-icon-settings').dispatchEvent('click');
        await page.waitForFunction(() =>
            document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'),
            null, { timeout: 3000 });
        await page.evaluate(() => {
            const n = document.querySelector('.mfk-settings-width-num');
            n.value = '150';
            n.dispatchEvent(new Event('change'));
        });
        await page.waitForTimeout(100);
        const clamped = await page.evaluate(() => localStorage.getItem('editorwidth'));
        expect(clamped).toBe('90');

        // a stored width applies on boot — NOTE: the init script clears
        // localStorage on every navigation (harness artifact; real usage
        // persists), so re-seed the value for the reloaded page
        await page.addInitScript(w => localStorage.setItem('editorwidth', w), '90');
        await page.reload();
        await unlockVault(page);
        await page.waitForTimeout(200);
        const state = await page.evaluate(() => {
            const body = document.body.getBoundingClientRect();
            return { width: Math.round(body.width), viewport: window.innerWidth };
        });
        expect(Math.abs(state.width - state.viewport * 0.9)).toBeLessThanOrEqual(2);
        expect(pageErrors).toEqual([]);
    });


    test('Security section: auto-lock minutes persist and the strict toggle clears the session key', async ({ page }) => {
        await page.locator('.fk-icon-settings').dispatchEvent('click');
        await page.waitForFunction(() =>
            document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'),
            null, { timeout: 3000 });

        // auto-lock: 30 minutes persists (the vault re-reads it on every arm)
        await page.evaluate(() => {
            const n = document.querySelector('.mfk-settings-autolock');
            n.value = '30';
            n.dispatchEvent(new Event('change'));
        });
        const autolock = await page.evaluate(() => localStorage.getItem('autolock'));
        expect(autolock).toBe('30');

        // strict unlock: toggling it on clears the session key mirror
        // (the vault's storage listener) and persists the preference
        await page.evaluate(() => {
            const c = document.querySelector('.mfk-settings-strict');
            c.checked = true;
            c.dispatchEvent(new Event('change'));
        });
        await page.waitForTimeout(150);
        const strict = await page.evaluate(() => ({
            stored: localStorage.getItem('strictunlock'),
            sessionKey: window.chrome.__mem.session['vault.key'] || null,
        }));
        expect(strict.stored).toBe('1');
        expect(strict.sessionKey).toBe(null);

        // with strict on, a reload demands the passphrase again — assert the
        // settled overlay BEFORE any unlock helper runs (the helper unlocks
        // by design, so anything it touches first cannot prove the lock
        // appeared). The exact screen is a mock artifact (fresh empty
        // chrome.storage → #vault-setup, state 'unset'); the INVARIANT is:
        // overlay present, vault NOT unlocked — no silent session restore.
        await page.reload();
        await page.waitForFunction(() =>
            window._vault && !!document.querySelector('.vault-overlay') &&
            window._vault.state !== 'unlocked',
            null, { timeout: 5000 });
        const afterReload = await page.evaluate(() => ({
            state: window._vault.state,
            overlay: !!document.querySelector('.vault-overlay'),
        }));
        expect(afterReload.overlay).toBe(true);
        expect(afterReload.state).not.toBe('unlocked');

        // turning strict OFF re-enables the session restore path
        await page.evaluate(() => {
            localStorage.setItem('strictunlock', '0');
        });
        await page.evaluate(() => {
            const c = document.querySelector('.mfk-settings-strict');
            c.checked = false;
            c.dispatchEvent(new Event('change'));
        });
        // unlock once (fresh mock → setup screen) → the key is mirrored
        // again → a reload restores silently
        await page.fill('#vault-pass', 'test-passphrase');
        await page.fill('#vault-pass2', 'test-passphrase');
        await page.click('#vault-setup');
        await page.waitForFunction(() => !document.querySelector('.vault-overlay'));
        await page.reload();
        await page.waitForFunction(() => window._vault && window._vault.state === 'unlocked');
        const silent = await page.evaluate(() => !document.querySelector('.vault-overlay'));
        expect(silent).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test('Sync section: the interval persists and the vault uses it', async ({ page }) => {
        await page.locator('.fk-icon-settings').dispatchEvent('click');
        await page.waitForFunction(() =>
            document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'),
            null, { timeout: 3000 });
        await page.evaluate(() => {
            const n = document.querySelector('.mfk-settings-syncinterval');
            n.value = '60';
            n.dispatchEvent(new Event('change'));
        });
        const interval = await page.evaluate(() => ({
            stored: localStorage.getItem('syncinterval'),
            used: window._vault.syncMinIntervalMs(),
        }));
        expect(interval.stored).toBe('60');
        expect(interval.used).toBe(60000);
        expect(pageErrors).toEqual([]);
    });

    test('Notes file section: export/import controls render inside the panel', async ({ page }) => {
        await page.click('article.fk-editable');
        await page.keyboard.type('export me');
        await page.waitForTimeout(700);
        await page.locator('.fk-icon-settings').dispatchEvent('click');
        await page.waitForFunction(() =>
            document.querySelector('.vault-actions'), null, { timeout: 3000 });
        const actions = await page.evaluate(() => {
            const bar = document.querySelector('.vault-actions');
            const panel = document.querySelector('.mfk-settings-panel');
            return {
                insidePanel: panel.contains(bar),
                buttons: [...bar.querySelectorAll('button')].map(b => b.dataset.vaultAction),
            };
        });
        expect(actions.insidePanel).toBe(true);
        expect(actions.buttons).toEqual(['export-md', 'export-html', 'import']);
        expect(pageErrors).toEqual([]);
    });

    test('close works (× button) and the panel follows the night theme', async ({ page }) => {
        await page.locator('.fk-icon-settings').dispatchEvent('click');
        await page.waitForFunction(() =>
            document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'),
            null, { timeout: 3000 });
        await page.waitForTimeout(450);   // let the slide-in settle
        await page.evaluate(() => document.querySelector('.mfk-settings-close').click());
        await page.waitForTimeout(450);   // let the slide-out run
        const closed = await page.evaluate(() =>
            !document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'));
        expect(closed).toBe(true);

        // night theme follows daymode
        await page.evaluate(() => {
            localStorage.setItem('daymode', 'night');
            document.documentElement.classList.remove('day');
            document.documentElement.classList.add('night');
        });
        await page.locator('.fk-icon-settings').dispatchEvent('click');
        await page.waitForFunction(() =>
            document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'),
            null, { timeout: 3000 });
        const night = await page.evaluate(() => {
            const p = document.querySelector('.mfk-settings-panel');
            return getComputedStyle(p).backgroundColor;
        });
        expect(night).toBe('rgb(26, 29, 33)');
        expect(pageErrors).toEqual([]);
    });

    test('steppers step, clamp and persist through the inputs change handlers', async ({ page }) => {
        await INIT(page);
        await page.locator('.fk-icon-settings').dispatchEvent('click');
        await page.waitForFunction(() =>
            document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'),
            null, { timeout: 3000 });
        const out = await page.evaluate(() => {
            const num = document.querySelector('.mfk-settings-autolock');
            const btns = num.closest('.mfk-stepper').querySelectorAll('.mfk-stepper-btn');
            btns[0].click();   // up is on top now
            btns[0].click();
            const afterUp = { shown: num.value, stored: localStorage.getItem('autolock') };
            num.value = '2';
            btns[1].click();   // down
            return { afterUp: afterUp, clamped: num.value, stored: localStorage.getItem('autolock') };
        });
        expect(out.afterUp.stored).toBe('17');
        expect(out.clamped).toBe('1');
        expect(out.stored).toBe('1');
        expect(pageErrors).toEqual([]);
    });

    test('preferences import applies whitelisted settings; junk is rejected', async ({ page }) => {
        await INIT(page);
        await page.locator('.fk-icon-settings').dispatchEvent('click');
        await page.waitForFunction(() =>
            document.querySelector('.mfk-settings-panel').classList.contains('mfk-settings-open'),
            null, { timeout: 3000 });
        const payload = {
            app: 'mindful-next', kind: 'settings', version: 1,
            settings: {
                editorwidth: '55', autolock: '90', daymode: 'night',
                bogus: 'injected',
            },
        };
        const applied = await page.evaluate(payload => new Promise(res => {
            const file = new File([JSON.stringify(payload)], 'settings.json', { type: 'application/json' });
            const dt = new DataTransfer();
            dt.items.add(file);
            const input = document.querySelector('.mfk-pref-file');
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(() => res({
                width: localStorage.getItem('editorwidth'),
                autolock: localStorage.getItem('autolock'),
                bogus: localStorage.getItem('bogus'),
                night: document.documentElement.classList.contains('night'),
                numShown: document.querySelector('.mfk-settings-autolock').value,
                status: document.querySelector('.mfk-pref-status').textContent,
            }), 300);
        }), payload);
        expect(applied.width).toBe('55');
        expect(applied.autolock).toBe('90');
        expect(applied.bogus).toBe(null);
        expect(applied.night).toBe(true);
        expect(applied.numShown).toBe('90');
        expect(applied.status).toBe('imported');

        await page.evaluate(() => new Promise(res => {
            const file = new File(['{"kind":"nope"}'], 'x.json', { type: 'application/json' });
            const dt = new DataTransfer();
            dt.items.add(file);
            const input = document.querySelector('.mfk-pref-file');
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(() => res(document.querySelector('.mfk-pref-status').textContent), 300);
        }));
        const status = await page.evaluate(() => document.querySelector('.mfk-pref-status').textContent);
        expect(status).toBe('invalid file');
        expect(pageErrors).toEqual([]);
    });
});