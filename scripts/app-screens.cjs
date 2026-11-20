// Takes the phone screenshots of Túruj shown on /aplikacia and /ako-to-funguje (components/AppScreens.tsx):
// trip list from a start town, a trip's day plan, and the saved trips, in Slovak and English (iPhone 13, 2x).
// Run:  BASE=https://turuj.sk node scripts/app-screens.cjs   (needs playwright-core in ~/dev/pw-tmp)
// It writes PNGs to OUT (default /tmp/claude-501/vns/shots). They were then converted with Pillow to
// 780x1688 WebP quality 80 and copied into public/screens/ as {sk,en}-{home,plan,saved}.webp.
const pw = require(process.env.HOME + '/dev/pw-tmp/node_modules/playwright-core');
const BASE = process.env.BASE || 'https://turuj.sk', OUT = process.env.OUT || '/tmp/claude-501/vns/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const TRIP = process.env.TRIP || 'sucha-bela';
(async () => {
  for (const L of ['sk', 'en']) {
    const pre = L === 'en' ? '/en' : '';
    const b = await pw.webkit.launch();
    const ctx = await b.newContext({ ...pw.devices['iPhone 13'], colorScheme: 'light', reducedMotion: 'reduce', locale: L === 'en' ? 'en-GB' : 'sk-SK', timezoneId: 'Europe/Bratislava' });
    const p = await ctx.newPage();
    const shot = async (name) => { await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${name}-${L}.png` }); };
    await p.goto(`${BASE}${pre}/?nepocitat=1`, { waitUntil: 'networkidle' });
    await p.locator('input[type=search]').first().fill('Poprad'); await p.waitForTimeout(1500);
    await p.locator('[role=option]').first().click(); await p.waitForTimeout(3000);
    // home: the list of trips with leave-by times
    await p.evaluate(() => { const h = [...document.querySelectorAll('h2')].find(e => /Výlety na|Trips for/.test(e.innerText)); window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 150); });
    await shot('1-home');
    // trip page: the day timeline
    await p.goto(`${BASE}${pre}/trasa/${TRIP}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    const anchor = await p.$('#vas-den');
    console.log(L, 'vas-den found:', !!anchor);
    if (anchor) await p.evaluate(() => { const e = document.querySelector('#vas-den'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 110); });
    await shot('2-plan');
    // saved trip
    const save = p.getByRole('button', { name: /Uložiť výlet|Save trip/ }).first();
    await save.click().catch(e => console.log('save click failed', e.message.slice(0, 80)));
    await p.waitForTimeout(1500);
    await p.goto(`${BASE}${pre}/ulozene`, { waitUntil: 'networkidle' });
    await shot('3-saved');
    await b.close();
  }
})();
