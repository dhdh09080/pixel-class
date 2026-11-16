import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const dir = mkdtempSync(join(tmpdir(), 'sprite-product-'));
const api = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: {
    ...process.env,
    DATABASE_PATH: join(dir, 'isolated.sqlite'),
    PORT: '3033',
    HOST: '127.0.0.1',
    NODE_ENV: 'development',
    DEMO_MODE: 'true',
    AUTO_BACKUP: 'false',
    PIXEL_RUNTIME: 'local',
  },
  stdio: 'ignore',
});
let server, browser;
try {
  for (let n = 0; n < 100; n++) {
    try {
      const r = await fetch('http://127.0.0.1:3033/api/health');
      if (r.ok) break;
    } catch {}
    if (n === 99) throw Error('Isolated capture server did not start');
    await new Promise((r) => setTimeout(r, 100));
  }
  server = await createServer({
    server: {
      host: '127.0.0.1',
      port: 5189,
      strictPort: true,
      proxy: {
        '/api': { target: 'http://127.0.0.1:3033' },
        '/socket': { target: 'ws://127.0.0.1:3033', ws: true },
      },
    },
  });
  await server.listen();
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  mkdirSync('docs/sprite-redesign/product', { recursive: true });
  const measurements = [];
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5189/');
    await page.locator('canvas').waitFor();
    await page.locator('.map-online').getByText('접속 중', { exact: false }).waitFor();
    await page.screenshot({
      path: `docs/sprite-redesign/product/classroom-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    const upgrade = page.getByRole('button', { name: '새 캐릭터로 꾸미기', exact: true });
    if (await upgrade.count()) await upgrade.click();
    await page.getByRole('dialog').getByRole('button', { name: '얼굴', exact: true }).click();
    const measure = () =>
      page.evaluate(() => {
        const d = document.querySelector('dialog'),
          b = d.querySelector('.modal-body');
        return {
          scroll: b.scrollTop,
          client: b.clientHeight,
          content: b.scrollHeight,
          preview: d.querySelector('.character-preview').getBoundingClientRect().toJSON(),
          heading: d.querySelector('.studio-heading').getBoundingClientRect().toJSON(),
          name: d.querySelector('.preview-name').getBoundingClientRect().toJSON(),
          body: b.getBoundingClientRect().toJSON(),
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
    const before = await measure();
    await page.screenshot({
      path: `docs/sprite-redesign/product/studio-${width}.png`,
      fullPage: true,
    });
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const after = await measure();
    measurements.push({
      width,
      height,
      before,
      after,
      violations: audit.violations.map((v) => v.id),
    });
    await context.close();
  }
  writeFileSync(
    'docs/sprite-redesign/product/measurements.json',
    JSON.stringify(measurements, null, 2) + '\n',
  );
  console.log(JSON.stringify(measurements));
} finally {
  await browser?.close();
  await server?.close();
  if (api.exitCode === null) {
    const done = once(api, 'exit');
    api.kill('SIGTERM');
    await done;
  }
  rmSync(dir, { recursive: true, force: true });
}
