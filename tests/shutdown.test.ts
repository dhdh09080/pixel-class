import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createConnection, type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { emptyProject } from '../shared/types.js';

test('SIGTERM drains a client that never acknowledges WebSocket close and preserves committed data', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-shutdown-'));
  const file = join(dir, 'school.sqlite'),
    base = 'http://127.0.0.1:3017';
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DEMO_MODE: 'false',
      PORT: '3017',
      DATABASE_PATH: file,
      MASTER_BOOTSTRAP_KEY: 'shutdown-test-bootstrap-only',
    },
    stdio: 'pipe',
  });
  let socket: Socket | undefined;
  let logs = '';
  child.stderr.on('data', (v) => (logs += String(v)));
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(base + '/api/health')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, logs);
    const response = await fetch(base + '/api/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pixel-Class': '1' },
      body: JSON.stringify({
        key: 'shutdown-test-bootstrap-only',
        name: '종료 검증',
        email: 'shutdown@example.com',
        password: 'shutdown-test-password',
      }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    const created = await fetch(base + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pixel-Class': '1', Cookie: cookie },
      body: JSON.stringify({ ...emptyProject(), title: '종료 전 확정한 데이터' }),
    });
    assert.equal(created.status, 201);
    // Raw TCP deliberately never sends a WebSocket close acknowledgement.
    socket = createConnection({ host: '127.0.0.1', port: 3017 });
    const upgrade = new Promise<string>((resolve, reject) => {
      socket!.once('data', (data) => resolve(String(data)));
      socket!.once('error', reject);
    });
    socket.write(
      `GET /socket HTTP/1.1\r\nHost: 127.0.0.1:3017\r\nOrigin: ${base}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\nCookie: ${cookie}\r\n\r\n`,
    );
    assert.match(await upgrade, /101 Switching Protocols/);
    const exited = new Promise<number | null>((resolve) =>
      child.once('exit', (code) => resolve(code)),
    );
    child.kill('SIGTERM');
    let timer: ReturnType<typeof setTimeout>;
    try {
      assert.equal(
        await Promise.race([
          exited,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Shutdown did not drain connections within 8 seconds.')),
              8000,
            );
          }),
        ]),
        0,
      );
    } finally {
      clearTimeout(timer!);
    }
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      assert.equal(
        db
          .prepare(
            "SELECT count(*) AS n FROM records WHERE kind='project' AND json_extract(body,'$.title')=?",
          )
          .get('종료 전 확정한 데이터')!.n,
        1,
      );
      assert.equal(db.prepare('PRAGMA quick_check').get()!.quick_check, 'ok');
    } finally {
      db.close();
    }
  } finally {
    socket?.destroy();
    if (child.exitCode === null) {
      const exited = new Promise((r) => child.once('exit', r));
      child.kill('SIGKILL');
      await exited;
    }
    rmSync(dir, { force: true, recursive: true });
  }
});
