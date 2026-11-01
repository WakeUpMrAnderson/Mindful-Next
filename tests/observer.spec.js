/**
 * ElementObserver gates (flakiness Phase 2):
 *
 * 1. Records arriving while a batch is being processed are QUEUED and
 *    re-dispatched — previously they were silently dropped whenever the
 *    paused window swallowed them (macrotask-ordering race), which made
 *    normalizations intermittently skip work ("sometimes" bug class).
 * 2. A pathological normalizer that regenerates mutations forever is
 *    bounded: the re-dispatch loop gives up loudly after 50 cycles.
 * 3. Rapid checklist interaction stays structurally correct (the
 *    user-facing soak of the same class).
 * 4. The ignore-list actually matches the transient classes now (the 2016
 *    literal-slash bug made two of three patterns unmatchable).
 *
 * Run: npx playwright test tests/observer.spec.js
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

test.describe('element observer', () => {
    let pageErrors;
    let consoleWarnings;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        consoleWarnings = [];
        page.on('pageerror', err => pageErrors.push(String(err)));
        page.on('console', msg => {
            if (msg.type() === 'warning' && msg.text().includes('observer')) consoleWarnings.push(msg.text());
        });
        await INIT(page);
    });

    test('records queued while paused are re-dispatched, not dropped', async ({ page }) => {
        const outcome = await page.evaluate(() => {
            const mo = window._editor.mutationObserver;
            const article = document.querySelector('article.fk-editable');

            // batch A: a legal paragraph — processes synchronously and
            // leaves the observer paused until its deferred resume
            const legal = document.createElement('p');
            legal.innerHTML = 'queued batch A';
            mo.handleMutations([{ addedNodes: [legal], removedNodes: [], target: article }]);

            // now append an illegal empty DIV — its REAL MutationObserver
            // callback fires as a microtask, i.e. inside the paused window
            // (before the 1ms deferred resume). Pre-fix this record was
            // dropped; post-fix it is queued and processed on resume.
            const illegal = document.createElement('div');
            illegal.className = 'spec-div';
            article.appendChild(illegal);
            return { divInDom: article.contains(illegal) };
        });

        // the div is in the DOM unprocessed at dispatch time — after the
        // deferred resume it must be normalized (replaced by a paragraph)
        expect(outcome.divInDom).toBe(true);
        // the div's normalization may take an extra re-dispatch cycle (the
        // normalizer wrapper's own save/restore markers queue behind it) —
        // wait for the queue to drain rather than a fixed delay
        await page.waitForFunction(() =>
            window._editor.mutationObserver.pending.length === 0, null, { timeout: 3000 });
        const after = await page.evaluate(() => {
            const article = document.querySelector('article.fk-editable');
            return {
                divReplaced: !article.querySelector('.spec-div'),
                paused: window._editor.mutationObserver.paused,
            };
        });
        expect(after.divReplaced).toBe(true);        // queued record WAS processed
        expect(after.paused).toBe(false);            // observer resumed
        expect(pageErrors).toEqual([]);
    });

    test('a pathological normalizer cannot loop forever (50-cycle park guard)', async ({ page }) => {
        // HERMETIC invariants, by design. The arithmetic of this gate is
        // unforgiving: the guard burns 50 cycles × the queue's equilibrium
        // size before parking, and the editor's own normalizers churn queued
        // test nodes between bursts — so "the loop reaches its cap AFTER the
        // park" and "the queue drains to exactly zero" are scheduling races,
        // not invariants (the old assertion passed only when a race parked
        // the queue mid-loop). What the gate PROTECTS is bounded processing
        // with nothing lost, and that IS deterministic:
        //   1. the park warning fires (processing is bounded),
        //   2. records are kept, never dropped (pending > 0 after the park),
        //   3. fresh input cannot grow the queue into a runaway (bounded),
        //   4. the editor remains fully functional after the storm.
        const seeded = await page.evaluate(() => {
            window.__loopCount = 0;
            window._editor.registerNormalization('addedNodes', 'specLoopGenerator', (node) => {
                if (node.tagName === 'P' &&
                    String(node.textContent).startsWith('loop') &&
                    window.__loopCount < 600) {
                    window.__loopCount++;
                    const junk = document.createElement('p');
                    junk.innerHTML = 'loop ' + Math.random();
                    document.querySelector('article.fk-editable').appendChild(junk);
                }
            });
            const mo = window._editor.mutationObserver;
            const article = document.querySelector('article.fk-editable');
            const seed = document.createElement('p');
            seed.innerHTML = 'loop seed';
            article.appendChild(seed);
            mo.handleMutations([{ addedNodes: [seed], removedNodes: [], target: article }]);
            return true;
        });
        expect(seeded).toBe(true);

        // 1. the loop trips the guard: the queue is PARKED and the warning
        //    fires one defer cycle after the count reaches 50
        await expect.poll(() => consoleWarnings.length, { timeout: 10000 })
            .toBeGreaterThanOrEqual(1);
        const parked = await page.evaluate(() => window._editor.mutationObserver.pending.length);
        expect(parked).toBeGreaterThan(0);   // records kept, not dropped

        // 2+3. fresh input re-arms the guard and the queue keeps moving —
        //      bounded: bursts of 50 cycles, never a runaway queue
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => {
                const p = document.createElement('p');
                p.innerHTML = 'fresh ' + Math.random();
                document.querySelector('article.fk-editable').appendChild(p);
            });
            await page.waitForTimeout(250);
            const state = await page.evaluate(() => ({
                pending: window._editor.mutationObserver.pending.length,
                appended: window.__loopCount,
            }));
            expect(state.pending).toBeLessThan(50);   // bounded, never runaway
            expect(state.appended).toBeLessThanOrEqual(600);   // the cap held
        }

        // 4. the editor remains fully functional after the storm
        await page.click('article.fk-editable p');
        await page.keyboard.type('after the storm ');
        await page.waitForFunction(() =>
            [...document.querySelectorAll('article.fk-editable p')]
                .some(p => p.textContent.includes('after the storm')), null, { timeout: 5000 });
        expect(pageErrors).toEqual([]);
    });

    test('rapid checklist interaction stays structurally correct (soak)', async ({ page }) => {
        // create a checklist via the flow-menu on an empty line
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
        await page.locator('.fk-ui-inlineMenu [data-icon="checkbox"]').click();
        await page.waitForFunction(() =>
            document.querySelector('article.fk-editable ul.checklist'), null, { timeout: 4000 });

        // 20 fast Enters with words — the burst that used to expose
        // dropped-mutation flakes
        for (let i = 0; i < 10; i++) {
            await page.keyboard.type('w' + i);
            await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(700);

        const health = await page.evaluate(() => {
            const list = document.querySelector('article.fk-editable ul.checklist');
            const items = list ? [...list.querySelectorAll(':scope > li.checklist__item')] : [];
            const bareInList = list ? [...list.children].filter(c => !c.classList.contains('checklist__item')) : [];
            return {
                listExists: !!list,
                itemCount: items.length,
                bareInList: bareInList.length,
                everyItemHasTextDiv: items.every(li => !!li.querySelector('.checklist__item__text')),
            };
        });
        expect(health.listExists).toBe(true);
        expect(health.itemCount).toBeGreaterThanOrEqual(10);
        expect(health.bareInList).toBe(0);
        expect(health.everyItemHasTextDiv).toBe(true);
        // churn canary: focused checklist typing exercises the normalizer
        // wrapper's save/restore marker dance — if the queue sustained that
        // cycle, the 50-cycle guard would warn here
        expect(consoleWarnings).toEqual([]);
        expect(pageErrors).toEqual([]);
    });

    test('ignore-list matches the transient classes (2016 slash bug)', async ({ page }) => {
        const checks = await page.evaluate(() => {
            const skip = window._editor.mutationObserver.skippedClasses;
            return {
                marker: skip.test('selection-marker'),
                markerWithStart: skip.test('selection-marker start-marker'),
                ui: skip.test('fk-ui-dots fk-hide'),
                iframeWrapper: skip.test('fk-iframe-wrapper'),
            };
        });
        expect(checks.marker).toBe(true);
        expect(checks.markerWithStart).toBe(true);
        expect(checks.ui).toBe(true);
        expect(checks.iframeWrapper).toBe(true);
    });
});
