import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { defaultAppearance } from '../shared/types.ts';
const duration = Number(process.env.LOAD_SECONDS || 60);
assert.ok(Number.isFinite(duration) && duration >= 10 && duration <= 300);
const dir = mkdtempSync(join(tmpdir(), 'pixel-v03-load-'));
const base = 'http://127.0.0.1:3021',
  key = randomBytes(32).toString('hex');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = {
  startedAt: new Date().toISOString(),
  kind: '30 automated authenticated WebSocket clients, 10Hz movement; not 30 rendered browsers or notebook FPS',
  requestedSeconds: duration,
  sent: 0,
  receivedByObserver: 0,
  samples: [],
  passed: false,
};
let child,
  count = { active: 0, peak: 0 };
const sockets = [],
  queued = new Map(),
  latencies = [];
async function request(path, body, cookie = '') {
  const res = await fetch(base + '/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-Pixel-Class': '1', 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.ok(res.ok, `${path}: ${res.status}`);
  return { data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] || cookie };
}
function sample(label) {
  const raw = readFileSync(`/proc/${child.pid}/status`, 'utf8');
  report.samples.push({
    label,
    rssMiB: Number((Number(raw.match(/VmRSS:\s+(\d+)/)?.[1] || 0) / 1024).toFixed(2)),
    serverSockets: { ...count },
    sent: report.sent,
    receivedByObserver: report.receivedByObserver,
  });
}
try {
  child = spawn(
    process.execPath,
    ['--import', 'tsx', '--import', './tests/fixtures/socket-observer.mjs', 'server/index.ts'],
    {
      env: {
        ...process.env,
        PORT: '3021',
        HOST: '127.0.0.1',
        DATABASE_PATH: join(dir, 'school.sqlite'),
        NODE_ENV: 'test',
        DEMO_MODE: 'false',
        MASTER_BOOTSTRAP_KEY: key,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  child.stderr.on('data', () => {});
  child.on('message', (m) => {
    if (m.type === 'qa-socket-count') count = m;
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await pause(100);
  }
  assert.ok(ready);
  const master = await request('/bootstrap', {
    key,
    name: '부하 검증 선생님',
    email: 'load-master@example.com',
    password: randomBytes(24).toString('hex'),
  });
  const accounts = [];
  for (let i = 0; i < 30; i++) {
    const invite = await request('/invitations', { label: `부하 학생 ${i}` }, master.cookie);
    const account = await request('/register', {
      key: invite.data.key,
      name: `부하 학생 ${i}`,
      email: `load-${i}@example.com`,
      password: randomBytes(24).toString('hex'),
      appearance: defaultAppearance,
    });
    const state = (await request('/state', undefined, account.cookie)).data;
    accounts.push({
      ...account,
      userId: state.me.id,
      spawn: { x: 560, y: state.world.height - 75 },
    });
  }
  const state = (await request('/state', undefined, master.cookie)).data;
  const spawnPosition = { x: 560, y: state.world.height - 75 };
  for (const account of accounts) {
    const socket = new WebSocket(base.replace('http', 'ws') + '/socket', {
      headers: { Cookie: account.cookie, Origin: base },
    });
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    sockets.push(socket);
  }
  sockets[0].on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type !== 'move') return;
    report.receivedByObserver++;
    const queue = queued.get(m.userId + ':' + m.x);
    if (queue?.length) latencies.push(performance.now() - queue.shift());
  });
  await pause(200);
  assert.equal(count.active, 30);
  sample('warm');
  const began = performance.now();
  let ticks = 0;
  while (performance.now() - began < duration * 1000) {
    const x = spawnPosition.x + (ticks % 2 ? -8 : 8) + (ticks + 1) / 100000,
      now = performance.now();
    accounts.forEach((a, i) => {
      const k = a.userId + ':' + x,
        queue = queued.get(k) || [];
      queue.push(now);
      queued.set(k, queue);
      sockets[i].send(
        JSON.stringify({
          x,
          y: spawnPosition.y,
          direction: ticks % 2 ? 'left' : 'right',
          moving: true,
          seated: false,
        }),
      );
      report.sent++;
    });
    ticks++;
    if (ticks % 100 === 0) {
      sample('tick-' + ticks);
      console.log(JSON.stringify(report.samples.at(-1)));
    }
    await pause(100);
  }
  await pause(1000);
  sample('end');
  latencies.sort((a, b) => a - b);
  report.latencyMs = {
    p50: Number(latencies[Math.floor(latencies.length * 0.5)]?.toFixed(2)),
    p95: Number(latencies[Math.floor(latencies.length * 0.95)]?.toFixed(2)),
    max: Number(latencies.at(-1)?.toFixed(2)),
    samples: latencies.length,
  };
  report.actualSeconds = Number(((performance.now() - began) / 1000).toFixed(2));
  report.deliveryRatio = Number((report.receivedByObserver / report.sent).toFixed(5));
  assert.ok(report.deliveryRatio > 0.98, 'More than 2% of movement updates were rejected or lost');
  assert.ok(report.latencyMs.p95 < 500, 'Local observed p95 exceeded 500ms');
  sockets.forEach((s) => s.close());
  for (let i = 0; i < 50 && count.active; i++) await pause(100);
  assert.equal(count.active, 0);
  report.socketsAfterClose = count.active;
  assert.equal((await request('/state', undefined, master.cookie)).data.online.length, 0);
  report.passed = true;
} catch (error) {
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  sockets.forEach((s) => s.terminate());
  if (child && child.exitCode === null) {
    const ended = new Promise((r) => child.once('exit', r));
    child.kill();
    await ended;
  }
  report.finishedAt = new Date().toISOString();
  const output = process.env.QA_OUTPUT_DIR || 'docs/v03/qa';
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'realtime-load.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      passed: report.passed,
      sent: report.sent,
      deliveryRatio: report.deliveryRatio,
      latencyMs: report.latencyMs,
      failure: report.failure,
    }),
  );
  rmSync(dir, { recursive: true, force: true });
}
