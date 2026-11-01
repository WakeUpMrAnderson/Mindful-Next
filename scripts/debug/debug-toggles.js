/* Fresh-profile toggle probe: reproduces the remove+reload scenario and
   verifies the focus-class cleanup, info/eye single-toggle, and defaults. */
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
    const extId = await boot.evaluate(() => {
        const list = document.querySelector('extensions-manager').shadowRoot
            .querySelector('extensions-item-list').shadowRoot;
        return [...list.querySelectorAll('extensions-item')][0].id;
    });
    await boot.close();

    // NO storage overrides — this is the user's fresh-profile state.
    const page = await context.newPage();
    page.on('pageerror', e => console.log('[pageerror]', String(e).split('\n')[0]));
    await page.goto(`chrome-extension://${extId}/index.html`);
    await page.waitForTimeout(1500);

    const state = () => page.evaluate(() => ({
        htmlClass: document.documentElement.className,
        articleOpacity: getComputedStyle(document.querySelector('article.fk-editable')).opacity,
        infoOpacity: getComputedStyle(document.querySelector('.fk-icon-info')).opacity,
        authorShown: document.documentElement.classList.contains('author'),
    }));

    console.log('1. fresh boot:', JSON.stringify(await state()));

    console.log('2. click article + type one char:');
    await page.click('article.fk-editable');
    await page.keyboard.type('x');
    await page.waitForTimeout(300);
    console.log('  ', JSON.stringify(await state()));

    console.log('3. move mouse over the editor (focus class should clear):');
    const box = await page.locator('article.fk-editable').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    console.log('  ', JSON.stringify(await state()));

    console.log('4. real-click night toggle:');
    await page.mouse.click((await page.locator('.fk-icon-nightmode').boundingBox()).x + 5,
        (await page.locator('.fk-icon-nightmode').boundingBox()).y + 5);
    await page.waitForTimeout(300);
    console.log('  ', JSON.stringify(await state()), 'daymode:',
        await page.evaluate(() => localStorage.getItem('daymode')));

    console.log('5. real-click info toggle (was a no-op double-handler):');
    const infoBox = await page.locator('.fk-icon-info').boundingBox();
    await page.mouse.click(infoBox.x + 5, infoBox.y + 5);
    await page.waitForTimeout(300);
    const s5 = await state();
    console.log('  ', JSON.stringify(s5));
    console.log('   >> author toggled:', s5.authorShown === true ? 'YES (fixed)' : 'NO — still broken');

    console.log('6. real-click hide (eye) toggle (was a no-op double-handler):');
    const eyeBox = await page.locator('.fk-icon-hide').boundingBox();
    await page.mouse.click(eyeBox.x + 5, eyeBox.y + 5);
    await page.waitForTimeout(300);
    console.log('  ', JSON.stringify(await state()), 'hidemode:',
        await page.evaluate(() => localStorage.getItem('hidemode')));
    console.log('   real-click show icon to restore:');
    const showBox = await page.locator('.fk-icon-show').boundingBox();
    await page.mouse.click(showBox.x + 5, showBox.y + 5);
    await page.waitForTimeout(300);
    console.log('  ', JSON.stringify(await state()), 'hidemode:',
        await page.evaluate(() => localStorage.getItem('hidemode')));

    await context.close();
})().catch(e => { console.error(e); process.exit(1); });
