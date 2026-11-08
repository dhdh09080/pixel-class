import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultAppearance } from '../shared/types';
const base = 'http://127.0.0.1:3024';
const key = randomBytes(32).toString('hex'),
  password = randomBytes(24).toString('hex');
const dir = mkdtempSync(join(tmpdir(), 'pixel-v04-device-'));
let server: ChildProcess;
const headers = { 'X-Pixel-Class': '1', 'Content-Type': 'application/json' };
test.beforeAll(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DEMO_MODE: 'false',
      HOST: '127.0.0.1',
      PORT: '3024',
      DATABASE_PATH: join(dir, 'school.sqlite'),
      MASTER_BOOTSTRAP_KEY: key,
      PUBLIC_ORIGIN: base,
      COOKIE_SECURE: 'false',
      ALLOW_INSECURE_LOCALHOST: 'true',
      OPENAI_API_KEY: '',
      OPENAI_MODEL: '',
    },
    stdio: 'pipe',
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  const boot = await fetch(base + '/api/bootstrap', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      key,
      email: 'device-master@example.com',
      password,
      name: '기기 검증 선생님',
    }),
  });
  expect(boot.status).toBe(200);
  const cookie = boot.headers.get('set-cookie')!.split(';')[0];
  const invite = await (
    await fetch(base + '/api/invitations', {
      method: 'POST',
      headers: { ...headers, Cookie: cookie },
      body: JSON.stringify({ label: '기기 검증' }),
    })
  ).json();
  const registered = await fetch(base + '/api/register', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      key: invite.key,
      email: 'device-student@example.com',
      password,
      name: '일반 노트북과 모바일 검증 학생',
      appearance: defaultAppearance,
    }),
  });
  expect(registered.status).toBe(201);
});
test.afterAll(async () => {
  if (server?.exitCode === null) {
    const done = new Promise((r) => server.once('exit', r));
    server.kill();
    await done;
  }
  rmSync(dir, { recursive: true, force: true });
});
for (const profile of [
  { name: 'office-laptop', width: 1366, height: 768, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
]) {
  test(`private production classroom remains usable under ${profile.name} CPU/network emulation`, async ({
    browser,
  }) => {
    test.setTimeout(90000);
    const context = await browser.newContext({
      baseURL: base,
      viewport: { width: profile.width, height: profile.height },
      isMobile: profile.mobile,
      hasTouch: profile.mobile,
      deviceScaleFactor: profile.mobile ? 2 : 1,
    });
    try {
      expect(
        (
          await context.request.post('/api/login', {
            headers,
            data: { email: 'device-student@example.com', password },
          })
        ).status(),
      ).toBe(200);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const client = await context.newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await client.send('Network.enable');
      await client.send('Network.setCacheDisabled', { cacheDisabled: true });
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 80,
        downloadThroughput: 1500000 / 8,
        uploadThroughput: 750000 / 8,
      });
      await client.send('Performance.enable');
      const began = Date.now();
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.map-online')).toContainText('접속 중', { timeout: 45000 });
      await expect(page.locator('canvas')).toBeVisible();
      const readyMs = Date.now() - began;
      const world = page.locator('.game-host');
      const x = Number(await world.getAttribute('data-x'));
      if (profile.mobile) {
        const right = page.getByRole('button', { name: '터치로 오른쪽 이동', exact: true });
        await right.dispatchEvent('pointerdown', { pointerId: 1 });
        await page.waitForTimeout(250);
        await right.dispatchEvent('pointerup', { pointerId: 1 });
      } else {
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(250);
        await page.keyboard.up('ArrowRight');
      }
      await expect
        .poll(async () => Number(await world.getAttribute('data-x')))
        .toBeGreaterThan(x + 5);
      const before = await client.send('Performance.getMetrics');
      const cadence = await page.evaluate(
        () =>
          new Promise<{
            frames: number;
            durationMs: number;
            p95FrameMs: number;
            meanFrameMs: number;
          }>((resolve) => {
            const samples: number[] = [];
            const start = performance.now();
            let last = start;
            const frame = (now: number) => {
              samples.push(now - last);
              last = now;
              if (now - start < 5000) requestAnimationFrame(frame);
              else {
                const sorted = [...samples].sort((a, b) => a - b);
                resolve({
                  frames: samples.length,
                  durationMs: now - start,
                  p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
                  meanFrameMs: (now - start) / samples.length,
                });
              }
            };
            requestAnimationFrame(frame);
          }),
      );
      expect(cadence.frames).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        profile.width,
      );
      await page.getByRole('button', { name: '교실 조작 안내', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const box = (await dialog.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(profile.height + 1);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      const after = await client.send('Performance.getMetrics');
      const metric = (r: typeof after, name: string) =>
        r.metrics.find((m) => m.name === name)?.value || 0;
      mkdirSync('docs/v04', { recursive: true });
      await page.screenshot({ path: `docs/v04/${profile.name}.png`, fullPage: true });
      writeFileSync(
        `docs/v04/${profile.name}.json`,
        JSON.stringify(
          {
            capturedAt: new Date().toISOString(),
            profile,
            emulation: {
              cpuSlowdown: 4,
              latencyMs: 80,
              downloadBitsPerSecond: 1500000,
              uploadBitsPerSecond: 750000,
              cacheDisabled: true,
            },
            readyMs,
            cadence,
            taskDurationSeconds: metric(after, 'TaskDuration') - metric(before, 'TaskDuration'),
            jsHeapMiB: metric(after, 'JSHeapUsedSize') / 1024 / 1024,
            errors,
            limitations:
              'Headless Chromium emulation on Cloud hardware; RAF cadence is not Phaser FPS or physical office laptop/mobile certification. Loopback HTTP exception only in isolated QA.',
          },
          null,
          2,
        ),
      );
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
