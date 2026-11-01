/* Load dist/ as a REAL unpacked MV3 extension (CSP enforced) and probe the
   theme toggle with genuine hit-tested clicks. */
const { chromium } = require('playwright');
const path = require('path');

const dist = path.resolve(__dirname, '..', '..', 'dist');

(async () => {
    const context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
            `--disable-extensions-except=${dist}`,
            `--load-extension=${dist}`,
            '--no-first-run',
        ],
    });

    // learn the real extension id from chrome://extensions (WebUI shadow DOM)
    const boot = await context.newPage();
    await boot.goto('chrome://extensions/');
    const extId = await boot.evaluate(() => {
        const manager = document.querySelector('extensions-manager');
        const list = manager.shadowRoot.querySelector('extensions-item-list');
        const items = list.shadowRoot.querySelectorAll('extensions-item');
        return [...items].map(i => ({ id: i.id, name: i.shadowRoot.querySelector('#name').textContent.trim() }));
    });
    console.log('loaded extensions:', JSON.stringify(extId));
    const me = extId.find(e => /mindful/i.test(e.name));
    await boot.close();
    if (!me) throw new Error('Mindful extension not loaded');

    const page = await context.newPage();
    const errors = [];
    const warns = [];
    page.on('pageerror', e => errors.push(String(e.stack || e).slice(0, 600)));
    page.on('console', m => {
        if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 160));
        if (m.type() === 'warning') warns.push(m.text().slice(0, 120));
    });
    await page.goto(`chrome-extension://${me.id}/index.html`);
    await page.waitForTimeout(2500);
    console.log('--- boot state (late) ---');
    console.log(await page.evaluate(() => ({
        editor: typeof window._editor,
        htmlClass: document.documentElement.className,
        daymode: localStorage.getItem('daymode'),
        hidemode: localStorage.getItem('hidemode'),
    })));

    console.log('--- hit test at moon icon ---');
    const hit = await page.evaluate(() => {
        const icon = document.querySelector('.fk-icon-nightmode');
        const r = icon.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        return {
            moonRect: { x: Math.round(cx), y: Math.round(cy) },
            topElement: top && (top.className || top.tagName),
            isMoonItself: top === icon,
            sunOpacity: getComputedStyle(document.querySelector('.fk-icon-sun')).opacity,
            moonOpacity: getComputedStyle(icon).opacity,
        };
    });
    console.log(hit);

    console.log('--- real click (no force) ---');
    await page.mouse.click(hit.moonRect.x, hit.moonRect.y);
    await page.waitForTimeout(400);
    console.log('after click 1:', await page.evaluate(() => ({
        htmlClass: document.documentElement.className,
        daymode: localStorage.getItem('daymode'),
    })));
    await page.mouse.click(hit.moonRect.x, hit.moonRect.y);
    await page.waitForTimeout(400);
    console.log('after click 2:', await page.evaluate(() => ({
        htmlClass: document.documentElement.className,
        daymode: localStorage.getItem('daymode'),
    })));

    console.log('--- page errors ---');
    console.log(errors.length ? errors.slice(0, 8) : 'none');
    console.log('--- console warnings (sample) ---');
    console.log(warns.length ? [...new Set(warns)].slice(0, 5) : 'none');

    await context.close();
})();
