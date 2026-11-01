/* Simulate remove+re-load with PERSISTED storage (the manifest 'key' pins
   the extension id, so localStorage survives). Session 1: use the extension
   (type, toggle things). Session 2: relaunch the same profile — the state
   the user would come back to. */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const dist = path.resolve(__dirname, '..', '..', 'dist');
const profile = path.join(os.tmpdir(), 'mindful-persist-profile');

function agentDir() {
    return path.join(os.tmpdir(), 'mindful-persist-agent');
}

async function launch() {
    return chromium.launchPersistentContext(agentDir(), {
        headless: false,
        args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-first-run'],
    });
}

async function openExt(context) {
    const boot = await context.newPage();
    await boot.goto('chrome://extensions/');
    const extId = await boot.evaluate(() => {
        const list = document.querySelector('extensions-manager').shadowRoot
            .querySelector('extensions-item-list').shadowRoot;
        return [...list.querySelectorAll('extensions-item')][0].id;
    });
    await boot.close();
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/index.html`);
    await page.waitForTimeout(1200);
    return page;
}

(async () => {
    fs.rmSync(agentDir(), { recursive: true, force: true });

    // ---- session 1: use the extension like a user ----
    let context = await launch();
    let page = await openExt(context);
    await page.click('article.fk-editable');
    await page.keyboard.type('session one content');
    // user experiments with the eye toggle -> hidemode='hide' persists
    const eye = await page.locator('.fk-icon-hide').boundingBox();
    await page.mouse.click(eye.x + 5, eye.y + 5);
    await page.waitForTimeout(300);
    console.log('session1 end state:', JSON.stringify(await page.evaluate(() => ({
        htmlClass: document.documentElement.className,
        hidemode: localStorage.getItem('hidemode'),
        daymode: localStorage.getItem('daymode'),
    }))));
    await context.close();

    // ---- session 2: "remove + load unpacked again" (same id, storage kept) ----
    context = await launch();
    page = await openExt(context);
    console.log('session2 fresh load:', JSON.stringify(await page.evaluate(() => {
        const toggles = {};
        for (const sel of ['.fk-icon-info', '.fk-icon-sun', '.fk-icon-nightmode', '.fk-icon-hide', '.fk-icon-show']) {
            const el = document.querySelector(sel);
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            toggles[sel] = {
                opacity: cs.opacity, vis: cs.visibility, disp: cs.display,
                pe: cs.pointerEvents, box: Math.round(r.width) + 'x' + Math.round(r.height),
                topEl: top ? top.className || top.tagName : 'none',
            };
        }
        return {
            htmlClass: document.documentElement.className,
            editor: typeof window._editor,
            articleOpacity: getComputedStyle(document.querySelector('article.fk-editable')).opacity,
            toggles,
        };
    })));

    // do the toggles still WORK? real-click each and report state changes
    const before = await page.evaluate(() => document.documentElement.className);
    const nb = await page.locator('.fk-icon-nightmode').boundingBox();
    await page.mouse.click(nb.x + 5, nb.y + 5);
    await page.waitForTimeout(300);
    const afterNight = await page.evaluate(() => ({
        cls: document.documentElement.className, daymode: localStorage.getItem('daymode') }));
    console.log('night click:', before, '->', JSON.stringify(afterNight));

    const ib = await page.locator('.fk-icon-info').boundingBox();
    await page.mouse.click(ib.x + 5, ib.y + 5);
    await page.waitForTimeout(300);
    console.log('info click -> author:', await page.evaluate(() =>
        document.documentElement.classList.contains('author')));

    const eb = await page.locator('.fk-icon-hide').boundingBox();
    await page.mouse.click(eb.x + 5, eb.y + 5);
    await page.waitForTimeout(300);
    console.log('eye click ->', await page.evaluate(() => ({
        htmlClass: document.documentElement.className, hidemode: localStorage.getItem('hidemode') })));

    await context.close();
})().catch(e => { console.error(e); process.exit(1); });
