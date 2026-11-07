import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('production build supports private MASTER bootstrap, login and persistent identity', async ({
  browser,
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-production-'));
  const base = 'http://127.0.0.1:3013';
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DEMO_MODE: 'true',
      PORT: '3013',
      DATABASE_PATH: join(dir, 'school.sqlite'),
      MASTER_BOOTSTRAP_KEY: 'test-private-bootstrap-only',
    },
    stdio: 'pipe',
  });
  let output = '';
  child.stderr.on('data', (d) => (output += String(d)));
  const context = await browser.newContext({ baseURL: base });
  try {
    let ready = false;
    for (let i = 0; i < 70; i++) {
      try {
        if ((await fetch(base + '/api/health')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ready, output).toBe(true);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '우리 학교를 시작해요' })).toBeVisible();
    expect(
      (
        await context.request.post('/api/demo', {
          headers: { 'X-Pixel-Class': '1' },
          data: { role: 'MASTER' },
        })
      ).status(),
    ).toBe(404);
    await page.getByLabel('부트스트랩 KEY').fill('test-private-bootstrap-only');
    await page.getByLabel('이름', { exact: true }).fill('실제 학교 선생님');
    await page.getByLabel('이메일').fill('private-teacher@example.com');
    await page.getByLabel('비밀번호', { exact: true }).fill('private-teacher-password');
    await page.getByRole('button', { name: 'MASTER로 학교 시작하기' }).click();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('.map-online')).toContainText('1명');
    await expect(page.locator('.demo-switch')).toHaveCount(0);
    const original = await (await context.request.get('/api/state')).json();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByRole('heading', { name: '다시 만나 반가워요' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'MASTER 등록', exact: true })).toHaveCount(0);
    await page.getByLabel('이메일').fill('private-teacher@example.com');
    await page.getByLabel('비밀번호', { exact: true }).fill('private-teacher-password');
    await page.getByRole('button', { name: '교실 입장하기', exact: true }).click();
    await expect(page.locator('canvas')).toBeVisible();
    const signedIn = await (await context.request.get('/api/state')).json();
    expect(signedIn.me.id).toBe(original.me.id);
    expect(signedIn.demo).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    const stopped = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    await stopped;
    rmSync(dir, { force: true, recursive: true });
  }
});
