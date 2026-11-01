/* Two-tab real-extension probe: reproduces the F2 acceptance test
   exactly — two new-tab pages of the SAME unpacked extension (same
   profile, REAL shared chrome.storage), type in tab A, switch to tab B,
   inspect what A stored, what B adopts, and every guard in between. */
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
    if (!extId) throw new Error('extension item never appeared');

    const errors = [];
    const url = `chrome-extension://${extId}/index.html`;

    // ---- tab A: first run, create the vault ----
    const A = await context.newPage();
    A.on('console', m => { if (/F2dbg|GONE|SWAPPED|SURGERY|CHARWIPE|WIPE/.test(m.text())) console.log('[A dbg]', m.text()); });
    A.on('pageerror', e => errors.push('[A pageerror] ' + String(e).split('\n')[0]));
    await A.goto(url);
    await A.waitForFunction(() => document.querySelector('#vault-setup'));
    await A.fill('#vault-pass', 'probe-passphrase-9');
    await A.fill('#vault-pass2', 'probe-passphrase-9');
    await A.click('#vault-setup');
    A.on('console', m => { if (/F2dbg|GONE|SWAPPED|SURGERY|CHARWIPE|WIPE/.test(m.text())) console.log('[A console]', m.text()); });
    await A.waitForFunction(() => !document.querySelector('.vault-overlay'));
    console.log('A: vault created and unlocked');

    // ---- tab B: opened BEFORE the typing, exactly like the user's setup ----
    const B = await context.newPage();
    B.on('pageerror', e => errors.push('[B pageerror] ' + String(e).split('\n')[0]));
    await B.goto(url);
    B.on('console', m => { if (/F2dbg|GONE|SWAPPED|SURGERY|CHARWIPE|WIPE/.test(m.text())) console.log('[B console]', m.text()); });
    await B.waitForFunction(() => window._vault && window._vault.state === 'unlocked');
    await B.waitForTimeout(400);
    // the user had interacted with B earlier — the article holds focus so
    // the browser restores it when the tab re-activates
    await B.click('article.fk-editable');
    console.log('B: open, unlocked, article focused (pre-typing)');

    // catch the wiper: log a stack whenever the typed text is removed
    // from A's article by any innerHTML write — plus a node-surgery trap
    await A.evaluate(() => {
        const art = document.querySelector('article.fk-editable');
        const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        Object.defineProperty(art, 'innerHTML', {
            configurable: true,
            get: function () { return desc.get.call(this); },
            set: function (v) {
                if (desc.get.call(this).includes('alpha version one') && !String(v).includes('alpha version one')) {
                    console.log('[WIPE] text removed, stack: ' + new Error().stack.split('\n').slice(1, 6).join(' | '));
                }
                desc.set.call(this, v);
            },
        });
        const mo = new MutationObserver(records => {
            for (const r of records) {
                for (const n of r.removedNodes) {
                    if (n.textContent && n.textContent.includes('alpha version one')) {
                        console.log('[SURGERY] removed ' + n.nodeName + '("' +
                            n.textContent.slice(0, 40) + '") from ' +
                            r.target.nodeName + '.' + (r.target.className || ''));
                    }
                }
                if (r.type === 'characterData' && r.target.textContent &&
                    r.oldValue && r.oldValue.includes('alpha version one') &&
                    !r.target.textContent.includes('alpha version one')) {
                    console.log('[CHARWIPE] "' + r.oldValue.slice(0, 50) + '" -> "' +
                        r.target.textContent.slice(0, 50) + '" on ' + r.target.nodeName);
                }
            }
        });
        mo.observe(art, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
        // article-element replacement watch + disappearance timer
        const bodyMo = new MutationObserver(() => {
            const live = document.querySelector('article.fk-editable');
            if (live !== art) console.log('[ARTICLE-SWAPPED] live article is not the hooked one');
        });
        bodyMo.observe(document.body, { childList: true });
        const t0 = performance.now();
        let swappedLogged = false;
        const iv = setInterval(() => {
            const live = document.querySelector('article.fk-editable');
            if (live !== art && !swappedLogged) {
                swappedLogged = true;
                console.log('[SWAPPED] live article !== hooked article at ~' +
                    Math.round(performance.now() - t0) + 'ms; liveHasText=' +
                    (live && live.textContent.includes('alpha version one')));
            }
            if (!art.isConnected || !art.textContent.includes('alpha version one')) {
                console.log('[GONE] hooked-article text vanished at ~' + Math.round(performance.now() - t0) +
                    'ms; connected=' + art.isConnected);
                clearInterval(iv);
            }
        }, 10);
        setTimeout(() => clearInterval(iv), 3000);
    });

    // ---- type in A, then switch to B ----
    await A.bringToFront();   // B is now genuinely hidden, like two real windows
    await A.click('article.fk-editable');
    await A.keyboard.type('alpha version one');
    const quick = await A.evaluate(() => ({ text: document.querySelector('article.fk-editable').textContent.includes('alpha version one'), active: document.activeElement && document.activeElement.tagName, focused: document.hasFocus() }));
    console.log('A right after typing:', JSON.stringify(quick));
    console.log('A: typed; waiting 1200ms for the checkpoint debounce…');
    await A.waitForTimeout(1200);

    const aState = await A.evaluate(() => ({
        lastAppliedTs: window._vault.lastAppliedTs,
        storageHasText: null,
    }));
    const aStorage = await A.evaluate(async () => {
        const dump = await new Promise(res => chrome.storage.local.get(null, r => res(r)));
        const blob = dump['vault.data'];
        const env = blob ? JSON.parse(await window._vault.decrypt(blob)) : null;
        const art = document.querySelector('article.fk-editable');
        return {
            storageTs: env ? env.ts : null,
            storageHasText: env ? env.html.includes('alpha version one') : null,
            domHasText: art.textContent.includes('alpha version one'),
            domTail: art.textContent.slice(-90),
            envTail: env ? env.html.slice(-140) : null,
            lastSavedHasText: (window._vault.lastSavedContent || '').includes('alpha version one'),
        };
    });
    console.log('A state after typing:', JSON.stringify({ ...aState, ...aStorage }));

    // ---- the switch: bring B to front AND click into it (the user's flow) ----
    await B.bringToFront();
    await B.click('article.fk-editable');   // real click → mousedown → catch-up
    await B.waitForTimeout(1200);
    const bAfter = await B.evaluate(() => ({
        hasText: document.querySelector('article.fk-editable').textContent.includes('alpha version one'),
        lastAppliedTs: window._vault.lastAppliedTs,
        activeElement: document.activeElement && document.activeElement.tagName,
        hidden: document.hidden,
    }));
    console.log('B after switch:', JSON.stringify(bAfter));

    // ---- diagnostics: what would adoptNewestIfStale decide right now? ----
    const diag = await B.evaluate(async () => {
        const article = document.querySelector('article.fk-editable');
        const focused = document.activeElement &&
            (document.activeElement === article || article.contains(document.activeElement));
        const newest = await window._vault.getNewestEnvelope();
        return {
            focusedNow: focused,
            newestTs: newest ? newest.env.ts : null,
            newestHasText: newest ? newest.env.html.includes('alpha version one') : null,
            lastAppliedTs: window._vault.lastAppliedTs,
        };
    });
    console.log('B decision diagnostics:', JSON.stringify(diag));

    // ---- refresh B — the user's second observation ----
    await B.reload();
    await B.waitForFunction(() => window._vault && window._vault.state === 'unlocked');
    await B.waitForTimeout(800);
    const bReload = await B.evaluate(() => ({
        hasText: document.querySelector('article.fk-editable').textContent.includes('alpha version one'),
    }));
    console.log('B after refresh:', JSON.stringify(bReload));

    console.log('page errors:', errors.length ? errors : 'none');
    await A.close();
    await B.close();
    await context.close();
})();
