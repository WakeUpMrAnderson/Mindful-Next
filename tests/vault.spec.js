/**
 * Vault suite: the encrypted persistence layer.
 *
 * Security-critical checks:
 *  - first run requires a passphrase (no plaintext mode)
 *  - NOTHING plaintext lands in any storage area after typing (the typed
 *    marker string must be absent from every stored value)
 *  - the working key is non-extractable
 *  - lock/reunlock round-trips the content through real decryption
 *  - a wrong passphrase is rejected by GCM authentication
 *  - encrypted daily snapshots are created
 *  - export produces a .md download
 *
 * Run: npm test  (serves the repo via playwright.config webServer)
 */
const { test, expect } = require('playwright/test');

const MARKER = 'TOPSECRET_MARKER_42';

async function seed(page) {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('hidemode', 'show');
        // Functional in-memory chrome.storage so the vault's writes are
        // actually inspectable by the sweep tests.
        const mem = { local: {}, sync: {}, session: {} };
        const area = name => ({
            get: (keys, cb) => {
                const out = {};
                (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in mem[name]) out[k] = mem[name][k]; });
                cb && cb(out);
            },
            set: (items, cb) => { Object.assign(mem[name], items); cb && cb(); },
            remove: (keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete mem[name][k]); cb && cb(); },
        });
        window.chrome = {
            __mem: mem,
            runtime: { getManifest: () => ({ version: '0.9.8210' }) },
            storage: {
                sync: area('sync'), local: area('local'), session: area('session'),
                onChanged: {
                    listeners: [],
                    addListener(f) { this.listeners.push(f); },
                    fire(changes, areaName) { this.listeners.forEach(f => f(changes, areaName)); },
                },
            },
        };
    });
}

async function setupVault(page, passphrase = 'correct horse battery') {
    await page.goto('/dist/index.html');
    await page.waitForFunction(() => document.querySelector('#vault-setup'));
    await page.fill('#vault-pass', passphrase);
    await page.fill('#vault-pass2', passphrase);
    await page.click('#vault-setup');
    await page.waitForFunction(() => !document.querySelector('.vault-overlay'));
}

test.describe('vault', () => {
    let pageErrors;
    let consoleErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        consoleErrors = [];
        page.on('pageerror', err => pageErrors.push(String(err)));
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        await seed(page);
    });

    test('first run shows the setup screen and requires a passphrase', async ({ page }) => {
        await page.goto('/dist/index.html');
        await page.waitForFunction(() => document.querySelector('#vault-setup'));
        const articleEditable = await page.evaluate(() =>
            document.querySelector('article.fk-editable').getAttribute('contenteditable'));
        expect(articleEditable).toBe('false');   // locked until configured

        // empty passphrase is rejected
        await page.click('#vault-setup');
        expect(await page.locator('#vault-error').textContent()).not.toBe('');
    });

    test('typed content never appears in plaintext in any storage area', async ({ page }) => {
        await setupVault(page);
        await page.click('article.fk-editable');
        await page.keyboard.type(MARKER);
        await page.waitForTimeout(900);   // checkpoint debounce (500ms) + save

        const sweep = await page.evaluate((marker) => {
            const areas = {};
            let haystack = '';
            for (const area of ['local', 'sync', 'session']) {
                const store = window.chrome.__mem && window.chrome.__mem[area] || {};
                areas[area] = JSON.stringify(store);
                haystack += areas[area];
            }
            const ls = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                ls[k] = localStorage.getItem(k);
                haystack += '|' + k + '=' + ls[k];
            }
            const dom = document.querySelector('article.fk-editable').innerHTML;
            return {
                markerInArticle: dom.includes(marker),      // the unlocked DOM may hold it
                markerInAnyStorage: haystack.includes(marker),
                vaultDataCiphertext: (() => {
                    const d = (window.chrome.__mem.local || {})['vault.data'];
                    return d ? d.ct.length > 20 : false;
                })(),
            };
        }, MARKER);

        expect(sweep.markerInArticle).toBe(true);          // sanity: we typed it
        expect(sweep.vaultDataCiphertext).toBe(true);      // encrypted blob exists
        expect(sweep.markerInAnyStorage).toBe(false);      // THE security assertion
    });

    test('working key is non-extractable and session-scoped key exists', async ({ page }) => {
        await setupVault(page);
        const state = await page.evaluate(async () => ({
            extractable: window._vault.key.extractable,
            usages: window._vault.key.usages,
            sessionHasKey: !!(window.chrome.__mem.session['vault.key']),
        }));
        expect(state.extractable).toBe(false);
        expect(state.usages).toContain('encrypt');
        expect(state.sessionHasKey).toBe(true);
    });

    test('lock and unlock round-trip the content through real decryption', async ({ page }) => {
        await setupVault(page);
        await page.click('article.fk-editable');
        await page.keyboard.type(MARKER);
        await page.waitForTimeout(900);

        await page.evaluate(() => window._vault.lock());
        expect(await page.locator('#vault-unlock').count()).toBe(1);
        const editable = await page.evaluate(() =>
            document.querySelector('article.fk-editable').getAttribute('contenteditable'));
        expect(editable).toBe('false');

        // wrong passphrase is rejected by GCM authentication — the PBKDF2
        // derivation takes a few hundred ms, so wait for the verdict
        await page.fill('#vault-pass', 'wrong passphrase entirely');
        await page.click('#vault-unlock');
        await page.waitForFunction(() =>
            document.querySelector('#vault-error').textContent.includes('Wrong passphrase'),
            null, { timeout: 5000 });

        // correct passphrase restores the content
        await page.fill('#vault-pass', 'correct horse battery');
        await page.click('#vault-unlock');
        await page.waitForFunction(() => !document.querySelector('.vault-overlay'));
        const text = await page.evaluate(() =>
            document.querySelector('article.fk-editable').textContent);
        expect(text).toContain(MARKER);
    });

    test('encrypted daily snapshot ring is created', async ({ page }) => {
        await setupVault(page);
        await page.waitForTimeout(600);
        const snaps = await page.evaluate(() =>
            (window.chrome.__mem.local['vault.snapshots'] || []));
        expect(snaps.length).toBeGreaterThanOrEqual(1);
        expect(snaps[0].blob.ct.length).toBeGreaterThan(20);
        // snapshot content must not be plaintext either
        expect(JSON.stringify(snaps)).not.toContain('Welcome to Mindful');
    });

    test('status indicator reports saved', async ({ page }) => {
        await setupVault(page);
        await page.click('article.fk-editable');
        await page.keyboard.type('save me');
        await page.waitForFunction(() =>
            (document.querySelector('.vault-status') || {}).textContent !== '', null, { timeout: 4000 });
        const status = await page.evaluate(() =>
            document.querySelector('.vault-status').textContent);
        expect(['saving…', 'saved ✓']).toContain(status);
    });

    test('export downloads a .md file', async ({ page }) => {
        await setupVault(page);
        const downloadPromise = page.waitForEvent('download');
        await page.evaluate(() => window._vault.download('md'));
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/^mindful-\d{4}-\d{2}-\d{2}\.md$/);
    });

    test('reveal toggle shows the passphrase on entry fields only', async ({ page }) => {
        await page.goto('/dist/index.html');
        await page.waitForFunction(() => document.querySelector('#vault-setup'));
        await page.fill('#vault-pass', 'visible-while-revealed');

        // setup: primary field reveals, confirmation field stays masked
        expect(await page.evaluate(() => document.querySelector('#vault-pass').type)).toBe('password');
        await page.click('.vault-reveal');
        expect(await page.evaluate(() => document.querySelector('#vault-pass').type)).toBe('text');
        expect(await page.evaluate(() => document.querySelector('#vault-pass2').type)).toBe('password');
        await page.click('.vault-reveal');
        expect(await page.evaluate(() => document.querySelector('#vault-pass').type)).toBe('password');

        await page.fill('#vault-pass2', 'visible-while-revealed');
        await page.click('#vault-setup');
        await page.waitForFunction(() => !document.querySelector('.vault-overlay'));

        // unlock screen: reveal works there too
        await page.evaluate(() => window._vault.lock());
        await page.waitForFunction(() => document.querySelector('#vault-unlock'));
        await page.fill('#vault-pass', 'visible-while-revealed');
        await page.click('.vault-reveal');
        expect(await page.evaluate(() => document.querySelector('#vault-pass').type)).toBe('text');
    });

    test('session restore boots styled without any overlay', async ({ page }) => {
        // Session 1: create the vault, capture the persisted state (meta,
        // data, session key) exactly as the real extension would leave it.
        await setupVault(page);
        await page.click('article.fk-editable');
        await page.keyboard.type(MARKER);
        await page.waitForTimeout(900);
        const persisted = await page.evaluate(() => ({
            key: window.chrome.__mem.session['vault.key'],
            meta: window.chrome.__mem.local['vault.meta'],
            data: window.chrome.__mem.local['vault.data'],
        }));
        expect(persisted.key).toBeTruthy();

        // Session 2 (browser reopened): restore the session key + vault data
        // in the init script. The vault must boot UNLOCKED without any
        // overlay — and the status pill must still be styled (fixed
        // position), not an unstyled in-flow div.
        await page.addInitScript((state) => {
            localStorage.clear();
            localStorage.setItem('hidemode', 'show');
            const mem = { local: { 'vault.meta': state.meta, 'vault.data': state.data }, sync: {}, session: { 'vault.key': state.key } };
            const area = name => ({
                get: (keys, cb) => {
                    const out = {};
                    (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in mem[name]) out[k] = mem[name][k]; });
                    cb && cb(out);
                },
                set: (items, cb) => { Object.assign(mem[name], items); cb && cb(); },
                remove: (keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete mem[name][k]); cb && cb(); },
            });
            window.chrome = {
                __mem: mem,
                runtime: { getManifest: () => ({ version: '0.9.8210' }) },
                storage: {
                    sync: area('sync'), local: area('local'), session: area('session'),
                    onChanged: { addListener: () => {} },
                },
            };
        }, persisted);

        await page.reload();
        await page.waitForFunction(() => window._vault && window._vault.state === 'unlocked');
        const boot = await page.evaluate((marker) => ({
            overlay: !!document.querySelector('.vault-overlay'),
            pillPosition: getComputedStyle(document.querySelector('.vault-status')).position,
            pillColor: getComputedStyle(document.querySelector('.vault-status')).color,
            contentRestored: document.querySelector('article.fk-editable').textContent.includes(marker),
        }), MARKER);
        expect(boot.overlay).toBe(false);              // silent session restore
        expect(boot.contentRestored).toBe(true);       // notes decrypt back
        expect(boot.pillPosition).toBe('fixed');       // styled, not in-flow
        expect(boot.pillColor).not.toBe('rgb(0, 0, 0)');
    });

    test('sync rollback is rejected, notified and healed from the local mirror', async ({ page }) => {
        await setupVault(page);
        await page.click('article.fk-editable');
        await page.keyboard.type(MARKER + ' newest version');
        await page.waitForTimeout(900);   // checkpoint + local write

        // An attacker with sync access replays an OLDER valid ciphertext
        // (encrypted with the same key, backdated ts). The tab pretends to
        // be a background tab (document.hidden) so the vault processes the
        // incoming blob like a hidden tab would.
        const rollbackBlob = await page.evaluate(async () => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            const blob = await window._vault.encrypt('<p>ancient rolled-back notes</p>', Date.now() - 3600000);
            window.chrome.storage.sync.set({ 'vault.data': blob });
            window.chrome.storage.onChanged.fire({ 'vault.data': { newValue: blob, oldValue: {} } }, 'sync');
            return blob;
        });

        await page.waitForTimeout(400);
        const after = await page.evaluate(({ marker, rollbackCt }) => {
            const localData = window.chrome.__mem.local['vault.data'];
            const syncData = window.chrome.__mem.sync['vault.data'];
            return {
                articleKept: document.querySelector('article.fk-editable').textContent.includes(marker),
                localKept: localData && localData.ct === rollbackCt ? 'rolled-back' : 'local-newer',
                syncHealed: syncData && syncData.ct === localData.ct,
                notified: [...document.querySelectorAll('.notification__content')].some(n => n.textContent.includes('rollback')),
            };
        }, { marker: MARKER, rollbackCt: rollbackBlob.ct });
        expect(after.articleKept).toBe(true);      // newer content untouched
        expect(after.localKept).toBe('local-newer');
        expect(after.syncHealed).toBe(true);       // sync repaired from local
        expect(after.notified).toBe(true);         // user was told
        expect(JSON.stringify(after)).not.toContain('ancient rolled-back notes');
    });

    test('legacy pre-envelope plaintext is parsed and upgraded on load', async ({ page }) => {
        await page.goto('/dist/index.html');
        await page.waitForFunction(() => window._vault);
        const shapes = await page.evaluate(() => ({
            legacy: window._vault.constructor.parseEnvelope('<p>plain html</p>'),
            v2: window._vault.constructor.parseEnvelope(JSON.stringify({ v: 2, ts: 1234, html: '<p>envelope</p>' })),
        }));
        expect(shapes.legacy).toEqual({ ts: 0, html: '<p>plain html</p>' });
        expect(shapes.v2).toEqual({ ts: 1234, html: '<p>envelope</p>' });
    });

    test('importFromFile restores .md and .html content (sanitized)', async ({ page }) => {
        await setupVault(page);
        await page.evaluate(() => {
            const file = new File([
                '# Imported heading\n\nSome **bold** text\n\n- one\n- two\n',
            ], 'notes.md', { type: 'text/markdown' });
            return window._vault.importFromFile(file);
        });
        await page.waitForTimeout(300);
        const imported = await page.evaluate(() =>
            document.querySelector('article.fk-editable').innerHTML);
        expect(imported).toContain('Imported heading');
        expect(imported).toContain('<strong>bold</strong>');

        // sanitized html import: scripts and handlers are stripped
        await page.evaluate(() => {
            const file = new File([
                '<p onclick="alert(1)">safe text</p><script>alert(2)</script><img src="x" onerror="alert(3)">',
            ], 'evil.html', { type: 'text/html' });
            return window._vault.importFromFile(file);
        });
        await page.waitForTimeout(300);
        const sanitized = await page.evaluate(() => {
            const html = document.querySelector('article.fk-editable').innerHTML;
            return {
                keepsText: html.includes('safe text'),
                noScript: !html.includes('alert(2)'),
                noOnerror: !html.includes('onerror'),
                noOnclick: !html.includes('onclick'),
            };
        });
        expect(sanitized).toEqual({ keepsText: true, noScript: true, noOnerror: true, noOnclick: true });
    });

    test('visible tab adopts a newer blob on visibilitychange (missed-write gap)', async ({ page }) => {
        await setupVault(page);
        await page.click('article.fk-editable');
        await page.keyboard.type(MARKER + ' v1');
        await page.waitForTimeout(900);
        // A NEWER blob from another tab lands in local storage while this
        // tab is visible — the onChanged listener skips visible tabs on
        // purpose (source of truth), so the catch-up must happen on
        // visibilitychange. The article KEEPS focus here: browsers restore
        // it when a tab re-activates, and a focus guard used to misfire on
        // exactly that (found by the user acceptance test).
        await page.evaluate(async (marker) => {
            const newer = await window._vault.encrypt(`<p>${marker} v2 from elsewhere</p>`, Date.now() + 5);
            // a REAL write fires onChanged in every tab (that is what keeps
            // the in-memory watermark live) — emulate it, then the switch
            window.chrome.storage.local.set({ 'vault.data': newer });
            window.chrome.storage.onChanged.fire({ 'vault.data': { newValue: newer, oldValue: {} } }, 'local');
        }, MARKER);
        await page.evaluate(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(600);
        const adopted = await page.evaluate((marker) =>
            document.querySelector('article.fk-editable').textContent.includes(marker + ' v2 from elsewhere'), MARKER);
        expect(adopted).toBe(true);
    });

    test('a tab behind storage cannot clobber it — save is refused and adopts', async ({ page }) => {
        await setupVault(page);
        await page.click('article.fk-editable');
        await page.keyboard.type(MARKER + ' v1');
        await page.waitForTimeout(900);
        // another tab saved something newer; this visible tab missed it
        await page.evaluate(async (marker) => {
            const newer = await window._vault.encrypt(`<p>${marker} v2 newer</p>`, Date.now() + 5);
            window.chrome.storage.local.set({ 'vault.data': newer });
            const env = JSON.parse(await window._vault.decrypt(newer));
            await window._vault.bumpWatermark(env.ts);   // as the other tab's save would
        }, MARKER);
        // this tab tries to save (checkpoint or pagehide flush) — it must
        // NOT write, and must adopt the newer content instead
        const result = await page.evaluate(async (marker) => {
            await window._vault.save(`<p>${marker} STALE OVERWRITE</p>`);
            const env = JSON.parse(await window._vault.decrypt(window.chrome.__mem.local['vault.data']));
            return {
                storageKept: env.html.includes(`${marker} v2 newer`),
                articleAdopted: document.querySelector('article.fk-editable').textContent.includes(`${marker} v2 newer`),
                noticeShown: !!document.querySelector('.vault-sync-notice') &&
                    document.querySelector('.vault-sync-notice').textContent.includes('synced from another tab'),
            };
        }, MARKER);
        expect(result.storageKept).toBe(true);
        expect(result.articleAdopted).toBe(true);
        expect(result.noticeShown).toBe(true);

        // the notice fades away on its own (3s + 0.4s fade + removal)
        await page.waitForTimeout(3800);
        const noticeGone = await page.evaluate(() => !document.querySelector('.vault-sync-notice'));
        expect(noticeGone).toBe(true);

        // and the pagehide flush must not sneak the stale DOM in either
        await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        await page.waitForTimeout(300);
        const stillKept = await page.evaluate(async (marker) => {
            const env = JSON.parse(await window._vault.decrypt(window.chrome.__mem.local['vault.data']));
            return env.html.includes(`${marker} v2 newer`) && !env.html.includes('STALE OVERWRITE');
        }, MARKER);
        expect(stillKept).toBe(true);
    });

    test('adoption preserves the caret position (no jump to the article start)', async ({ page }) => {
        await setupVault(page);
        await page.click('article.fk-editable');
        await page.keyboard.type(MARKER + ' one two three');
        await page.waitForTimeout(900);
        // park the caret 6 chars into the tail paragraph, keep the article
        // focused (the user is switching into this tab), then adopt a newer
        // blob from another tab — the caret must stay at its text offset
        await page.evaluate((marker) => {
            const ed = window._editor;
            const ps = document.querySelectorAll('article.fk-editable > p');
            const p = ps[ps.length - 1];
            ed.focus();
            const range = document.createRange();
            range.setStart(p.firstChild, 6);   // 6 chars into the typed text
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            ed.updateContext(p);
        }, MARKER);
        const before = await page.evaluate(() => {
            const art = document.querySelector('article.fk-editable');
            const sel = window.getSelection();
            const pre = document.createRange();
            pre.selectNodeContents(art);
            pre.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
            return pre.toString().length;
        });
        await page.evaluate(async (marker) => {
            // a real cross-tab save carries the WHOLE article, not a fragment
            const current = document.querySelector('article.fk-editable').innerHTML;
            const newer = await window._vault.encrypt(current + '<p>and newer tail</p>', Date.now() + 5);
            window.chrome.storage.local.set({ 'vault.data': newer });
            window.chrome.storage.onChanged.fire({ 'vault.data': { newValue: newer, oldValue: {} } }, 'local');
            document.dispatchEvent(new Event('visibilitychange'));
        }, MARKER);
        await page.waitForTimeout(600);
        const dbg = await page.evaluate(() => window.__adoptDbg || null);
        console.log('ADOPT DBG:', JSON.stringify(dbg));
        const after = await page.evaluate((marker) => {
            const art = document.querySelector('article.fk-editable');
            const sel = window.getSelection();
            if (!sel.rangeCount || !art.contains(sel.getRangeAt(0).startContainer)) return null;
            const pre = document.createRange();
            pre.selectNodeContents(art);
            pre.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
            return {
                offset: pre.toString().length,
                adopted: art.textContent.includes('and newer tail'),
            };
        }, MARKER);
        expect(after.adopted).toBe(true);
        expect(after.offset).toBe(before);
    });

    test('close-flush: the synchronous mirror rescues a lost durable write', async ({ page }) => {
        await setupVault(page);
        await page.click('article.fk-editable');
        await page.keyboard.type(MARKER + ' first words');
        await page.waitForTimeout(900);
        const older = await page.evaluate(() => window.chrome.__mem.local['vault.data']);
        await page.keyboard.type(' and second words');
        await page.waitForTimeout(900);   // newer checkpoint + mirror write
        const persisted = await page.evaluate(() => ({
            meta: window.chrome.__mem.local['vault.meta'],
            key: window.chrome.__mem.session['vault.key'],
            mirror: localStorage.getItem('vault.mirror'),
        }));
        expect(persisted.mirror).toBeTruthy();
        // Session 2: the durable write raced the tab close and an OLDER
        // blob is what storage kept — the mirror must win on boot.
        await page.addInitScript((state) => {
            localStorage.clear();
            localStorage.setItem('hidemode', 'show');
            localStorage.setItem('vault.mirror', state.mirror);
            const mem = { local: { 'vault.meta': state.meta, 'vault.data': state.older }, sync: {}, session: { 'vault.key': state.key } };
            const area = name => ({
                get: (keys, cb) => {
                    const out = {};
                    (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in mem[name]) out[k] = mem[name][k]; });
                    cb && cb(out);
                },
                set: (items, cb) => { Object.assign(mem[name], items); cb && cb(); },
                remove: (keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete mem[name][k]); cb && cb(); },
            });
            window.chrome = {
                __mem: mem,
                runtime: { getManifest: () => ({ version: '0.9.8210' }) },
                storage: {
                    sync: area('sync'), local: area('local'), session: area('session'),
                    onChanged: { addListener: () => {} },
                },
            };
        }, { ...persisted, older });
        await page.reload();
        await page.waitForFunction(() => window._vault && window._vault.state === 'unlocked');
        const restored = await page.evaluate((marker) =>
            document.querySelector('article.fk-editable').textContent.includes(marker + ' first words and second words'), MARKER);
        expect(restored).toBe(true);
    });

    test('lock broadcast: another tab locking locks this tab too', async ({ page }) => {
        await setupVault(page);
        await page.click('article.fk-editable');
        await page.keyboard.type(MARKER);
        await page.waitForTimeout(600);
        // Another tab bumps the session lock generation; this tab must
        // follow (the same-tab write path guards itself via _lockingLocally).
        await page.evaluate(() => {
            const gen = (window.chrome.__mem.session['vault.lockGen'] || 0) + 1;
            window.chrome.__mem.session['vault.lockGen'] = gen;
            window.chrome.storage.onChanged.fire({ 'vault.lockGen': { newValue: gen, oldValue: gen - 1 } }, 'session');
        });
        await page.waitForTimeout(400);
        const locked = await page.evaluate(() => ({
            state: window._vault.state,
            overlay: !!document.querySelector('.vault-overlay'),
            editable: document.querySelector('article.fk-editable').getAttribute('contenteditable'),
        }));
        expect(locked.state).toBe('locked');
        expect(locked.overlay).toBe(true);
        expect(locked.editable).toBe('false');
    });

    test('unlock broadcast: another tab unlocking unlocks this tab too (no focus steal)', async ({ page }) => {
        await setupVault(page);
        await page.click('article.fk-editable');
        await page.keyboard.type(MARKER);
        await page.waitForTimeout(600);
        const keyBefore = await page.evaluate(() => window.chrome.__mem.session['vault.key']);
        await page.evaluate(() => window._vault.lock());
        await page.waitForTimeout(300);
        // another tab verified the passphrase and re-mirrored the session key
        await page.evaluate((key) => {
            window.chrome.__mem.session['vault.key'] = key;
            window.chrome.storage.onChanged.fire({ 'vault.key': { newValue: key, oldValue: null } }, 'session');
        }, keyBefore);
        await page.waitForTimeout(500);
        const unlocked = await page.evaluate((marker) => ({
            state: window._vault.state,
            overlay: !!document.querySelector('.vault-overlay'),
            editable: document.querySelector('article.fk-editable').getAttribute('contenteditable'),
            contentKept: document.querySelector('article.fk-editable').textContent.includes(marker),
            focused: document.activeElement && document.activeElement.tagName,
        }), MARKER);
        expect(unlocked.state).toBe('unlocked');
        expect(unlocked.overlay).toBe(false);
        expect(unlocked.editable).toBe('true');
        expect(unlocked.contentKept).toBe(true);
        // the user is at the OTHER tab — this one must not steal focus
        expect(unlocked.focused).not.toBe('ARTICLE');
    });

    test('rapid saves never spuriously notify rollback; sync writes carry no markers', async ({ page }) => {
        await setupVault(page);
        await page.click('article.fk-editable');
        for (let i = 0; i < 5; i++) {
            await page.keyboard.type(`line ${i} `);
            await page.waitForTimeout(120);
        }
        await page.waitForTimeout(900);   // let the checkpoint debounce land
        // Deliver the tab's OWN newest blob as if from sync — a correct
        // watermark means no rollback warning and no content churn.
        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            const blob = window.chrome.__mem.local['vault.data'];
            window.chrome.storage.onChanged.fire({ 'vault.data': { newValue: blob, oldValue: {} } }, 'sync');
        });
        await page.waitForTimeout(500);
        const state = await page.evaluate(() => ({
            notified: [...document.querySelectorAll('.notification__content')]
                .some(n => n.textContent.includes('rollback')),
            kept: document.querySelector('article.fk-editable').textContent.includes('line 4'),
        }));
        expect(state.notified).toBe(false);
        expect(state.kept).toBe(true);

        // The trailing sync write strips transient state like the local
        // write does (a marker reaching sync would come back on adoption).
        // lastSyncWrite is pushed back 10s+ so the save takes the
        // immediate-sync branch instead of scheduling the trailing write.
        const syncClean = await page.evaluate(async () => {
            window._vault.lastSyncWrite = Date.now() - 10001;
            await window._vault.save('<p>tail</p><span class="selection-marker start-marker"></span>');
            const blob = window.chrome.__mem.sync['vault.data'];
            const env = JSON.parse(await window._vault.decrypt(blob));
            return !env.html.includes('selection-marker');
        });
        expect(syncClean).toBe(true);
    });

    test('no page errors and no console errors', async ({ page }) => {
        await setupVault(page);
        await page.waitForTimeout(400);
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
