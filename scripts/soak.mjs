import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { emptyProject } from '../shared/types.ts';

// Dedicated disposable private server. No existing school database or external endpoint is used.
const duration = Number(process.env.SOAK_SECONDS || 600);
assert.ok(Number.isFinite(duration) && duration >= 60 && duration <= 3600);
const dir = mkdtempSync(join(tmpdir(), 'pixel-v03-soak-'));
const base = 'http://127.0.0.1:3020';
const key = randomBytes(32).toString('hex');
const password = randomBytes(24).toString('hex');
const headers = { 'X-Pixel-Class': '1' };
const report = {
  startedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  requestedSeconds: duration,
  kind: '6 real Chromium contexts; private local server; not 30-browser or multi-hour production certification',
  checkpoints: [],
  errors: [],
  socketOpened: 0,
  socketClosed: 0,
  movementFrames: 0,
  rounds: 0,
  restartVerified: false,
  passed: false,
};
let child, browser;
let serverSockets = { active: 0, opened: 0, closed: 0, peak: 0 };
const contexts = [],
  pages = [],
  clients = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function start() {
  child = spawn(
    process.execPath,
    ['--import', 'tsx', '--import', './tests/fixtures/socket-observer.mjs', 'server/index.ts'],
    {
      env: {
        ...process.env,
        PORT: '3020',
        HOST: '127.0.0.1',
        DATABASE_PATH: join(dir, 'school.sqlite'),
        DEMO_MODE: 'false',
        NODE_ENV: 'production',
        MASTER_BOOTSTRAP_KEY: key,
        PUBLIC_ORIGIN: base,
        COOKIE_SECURE: 'false',
        ALLOW_INSECURE_LOCALHOST: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  child.stderr.on('data', () => {});
  serverSockets = { active: 0, opened: 0, closed: 0, peak: 0 };
  child.on('message', (message) => {
    if (message.type === 'qa-socket-count') serverSockets = message;
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) return;
    } catch {}
    await pause(100);
  }
  throw Error('Private soak server failed to start');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const ended = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await ended;
}
async function request(context, path, data, method = data ? 'POST' : 'GET') {
  const response = await context.request.fetch(base + '/api' + path, { method, headers, data });
  assert.ok(response.ok(), `${method} ${path}: HTTP ${response.status()}`);
  return response.json();
}
async function checkpoint(label) {
  const state = await request(contexts[0], '/state');
  assert.equal(state.online.length, 6, 'Each account must have exactly one presence');
  await expect.poll(() => serverSockets.active).toBe(6);
  const raw = readFileSync(`/proc/${child.pid}/status`, 'utf8');
  const heaps = [];
  for (const client of clients) {
    await client.send('HeapProfiler.collectGarbage');
    const { metrics } = await client.send('Performance.getMetrics');
    heaps.push(
      Math.round(
        ((metrics.find((m) => m.name === 'JSHeapUsedSize')?.value || 0) / 1024 / 1024) * 100,
      ) / 100,
    );
  }
  const point = {
    label,
    elapsedSeconds: Math.round((Date.now() - began) / 1000),
    serverPid: child.pid,
    online: state.online.length,
    serverRssMiB: Math.round((Number(raw.match(/VmRSS:\s+(\d+)/)?.[1] || 0) / 1024) * 100) / 100,
    browserHeapMiB: heaps,
    serverSockets: { ...serverSockets },
    browserSocketCloseEventsMayBeLostOnNavigation: report.socketOpened - report.socketClosed,
    rounds: report.rounds,
  };
  report.checkpoints.push(point);
  console.log(JSON.stringify(point));
}
let began = Date.now();
try {
  await start();
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox'],
  });
  for (let i = 0; i < 6; i++) {
    const context = await browser.newContext({
      baseURL: base,
      viewport: i === 5 ? { width: 390, height: 844 } : { width: 1366, height: 768 },
    });
    contexts.push(context);
    const page = await context.newPage();
    pages.push(page);
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('websocket', (socket) => {
      report.socketOpened++;
      socket.on('close', () => report.socketClosed++);
      socket.on('framesent', (frame) => {
        try {
          if ('x' in JSON.parse(String(frame.payload))) report.movementFrames++;
        } catch {}
      });
    });
    if (i === 0) {
      await page.goto('/');
      await page.getByLabel('부트스트랩 KEY').fill(key);
      await page.getByLabel('이름', { exact: true }).fill('부하 검증 선생님');
      await page.getByLabel('이메일').fill('soak-master@example.com');
      await page.getByLabel('비밀번호', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'MASTER로 학교 시작하기', exact: true }).click();
    } else {
      const invite = await request(contexts[0], '/invitations', {
        label: `6인 브라우저 학생 ${i}`,
      });
      await page.goto('/?invite=' + invite.key);
      await page.getByLabel('입학 초대 KEY').fill(invite.key);
      await page.getByLabel('이름', { exact: true }).fill(`브라우저 학생 ${i}`);
      await page.getByLabel('이메일').fill(`soak-${i}@example.com`);
      await page.getByLabel('비밀번호', { exact: true }).fill(password);
      if (i === 1) {
        await page.locator('.character-select').click();
        await page.getByLabel('헤어스타일', { exact: true }).selectOption('2');
        await page.getByRole('button', { name: '이 모습으로 저장하기', exact: true }).click();
      }
      await page.getByRole('button', { name: '입학하고 교실 입장하기', exact: true }).click();
    }
    await expect(page.locator('canvas')).toBeVisible();
    const client = await context.newCDPSession(page);
    clients.push(client);
    await client.send('Performance.enable');
  }
  await expect(pages[0].locator('.map-online')).toContainText('6명');
  const owner = await request(contexts[1], '/projects', {
    ...emptyProject(),
    title: '장시간 저장 보존 검증',
    features: '기록과 검색',
    isPublic: false,
  });
  const attachment = await request(contexts[1], `/projects/${owner.id}/attachments`, {
    fileName: 'private.txt',
    content: Buffer.from('6-context private attachment').toString('base64'),
  });
  for (const context of contexts.slice(2)) {
    const privateState = await request(context, '/state');
    assert.ok(!privateState.projects.some((project) => project.id === owner.id));
    const denied = await context.request.get(
      base + `/api/projects/${owner.id}/attachments/${attachment.id}`,
    );
    assert.equal(denied.status(), 403);
  }
  report.privateProjectAndFileIsolationVerified = true;
  const xss = '<img src=x onerror="window.soakInjected=true">';
  await request(contexts[1], '/messages', { text: xss });
  await pages[0].getByRole('button', { name: /교실 이야기/ }).click();
  await expect(pages[0].locator('.chat-messages')).toContainText(xss);
  assert.equal(await pages[0].evaluate(() => window.soakInjected), undefined);
  began = Date.now();
  report.warmupCompletedAt = new Date().toISOString();
  await checkpoint('warm');
  let restarted = false;
  while ((Date.now() - began) / 1000 < duration) {
    const elapsed = (Date.now() - began) / 1000;
    if (!restarted && elapsed > duration / 2) {
      await checkpoint('before-server-restart');
      await stop();
      await start();
      await expect(pages[0].locator('.map-online')).toContainText('6명', { timeout: 15000 });
      await expect
        .poll(async () => (await request(contexts[0], '/state')).online.length, { timeout: 15000 })
        .toBe(6);
      assert.ok((await request(contexts[1], '/state')).projects.some((p) => p.id === owner.id));
      report.restartVerified = true;
      restarted = true;
      await checkpoint('after-server-restart');
    }
    const index = 1 + (report.rounds % 5),
      page = pages[index];
    if (report.rounds % 3 === 0) {
      await page.getByRole('button', { name: '내 프로젝트', exact: true }).click();
      await expect(page.getByRole('heading', { name: '나의 프로젝트', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '교실', exact: true }).click();
      await expect(page.locator('canvas')).toBeVisible();
    } else if (report.rounds % 3 === 1) {
      await page.reload();
      await expect(page.locator('canvas')).toBeVisible();
    } else {
      await page.keyboard.down('ArrowRight');
      await pause(150);
      await page.keyboard.up('ArrowRight');
      await page.keyboard.down('ArrowLeft');
      await pause(150);
      await page.keyboard.up('ArrowLeft');
    }
    const task = await request(contexts[1], `/projects/${owner.id}/tasks`, {
      text: `반복 저장 ${report.rounds}`,
    });
    await request(
      contexts[1],
      `/projects/${owner.id}/tasks/${task.tasks.at(-1).id}`,
      undefined,
      'DELETE',
    );
    report.rounds++;
    if (report.rounds % 3 === 0) await checkpoint('round-' + report.rounds);
    await pause(8000);
  }
  await checkpoint('final');
  assert.equal(report.errors.length, 0);
  assert.equal(serverSockets.active, 6);
  assert.ok(report.restartVerified);
  report.passed = true;
} catch (error) {
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.serverSocketsBeforeCleanup = { ...serverSockets };
  report.actualSeconds = Math.round((Date.now() - began) / 1000);
  for (const context of contexts) await context.close();
  await browser?.close();
  for (let i = 0; i < 20 && serverSockets.active; i++) await pause(100);
  if (serverSockets.active) {
    report.passed = false;
    report.failure = 'Server sockets remained after closing all contexts';
    process.exitCode = 1;
  }
  report.serverSocketsAfterContextCleanup = { ...serverSockets };
  await stop();
  mkdirSync('docs/v03/qa', { recursive: true });
  writeFileSync('docs/v03/qa/soak.json', JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      passed: report.passed,
      rounds: report.rounds,
      actualSeconds: report.actualSeconds,
      failure: report.failure,
    }),
  );
  rmSync(dir, { recursive: true, force: true });
}
