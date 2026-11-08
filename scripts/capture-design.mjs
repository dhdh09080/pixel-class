import { chromium } from '@playwright/test';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const phase = process.argv[2];
if (!phase || !/^(before|after|cycle-\d+)$/.test(phase))
  throw Error('Use before, after or cycle-N.');
const base = process.env.DESIGN_URL || 'http://127.0.0.1:5173';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw Error('Capture only an isolated local demo.');
const dir = join('docs/v03', phase);
if (existsSync(join(dir, 'measurements.json')))
  throw Error('Capture already exists; choose a new cycle.');
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];
try {
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [390, 844],
  ]) {
    const context = await browser.newContext({ baseURL: base, viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    async function shot(view) {
      await page.waitForTimeout(180);
      await page.screenshot({ path: join(dir, `${view}-${width}x${height}.png`), fullPage: true });
      const dimensions = await page.evaluate(() => ({
        viewport: { width: innerWidth, height: innerHeight },
        document: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        dialog: [...document.querySelectorAll('dialog[open]')].map((e) => {
          const r = e.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            scroll: e.scrollHeight,
            client: e.clientHeight,
            label: e.getAttribute('aria-label') || e.getAttribute('aria-labelledby'),
          };
        }),
      }));
      results.push({ view, width, height, ...dimensions, errors: [...errors] });
    }
    await page.goto('/');
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.locator('.map-online').filter({ hasText: '접속 중' }).waitFor();
    await shot('classroom');
    await page.getByRole('button', { name: '내 프로젝트', exact: true }).click();
    await shot('projects');
    await page.locator('.project-card').first().click();
    await shot('project-detail');
    await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true }).click();
    await shot('character');
    await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByRole('button', { name: '자료실', exact: true }).click();
    await shot('materials');
    await page.locator('.demo-switch').getByRole('button', { name: 'MASTER', exact: true }).click();
    await page.getByRole('button', { name: '교무실', exact: true }).click();
    await shot('master');
    await page.goto('/?invite=DESIGN-AUDIT-ONLY');
    await page.getByLabel('입학 초대 KEY').waitFor();
    await shot('admission');
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(
  join(dir, 'measurements.json'),
  JSON.stringify({ phase, capturedAt: new Date().toISOString(), base, results }, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      phase,
      screenshots: results.length,
      overflow: results.filter((r) => r.document.width > r.width),
      errors: results.flatMap((r) => r.errors),
    },
    null,
    2,
  ),
);
