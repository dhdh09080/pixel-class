import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { defaultAppearance, type AppState } from '../shared/types.js';
import {
  canStand,
  findPath,
  segmentClear,
  spawnPoint,
  worldSize,
  nextDeskSlot,
} from '../shared/world.js';
test('30 admissions expand the persisted classroom, retain corridors and synchronize 30 simulated sockets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-scale-')),
    base = 'http://127.0.0.1:3014';
  let child!: ChildProcess;
  const sockets: WebSocket[] = [];
  const start = async () => {
    child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      env: {
        ...process.env,
        PORT: '3014',
        DATABASE_PATH: join(dir, 'test.sqlite'),
        DEMO_MODE: 'false',
        MASTER_BOOTSTRAP_KEY: 'scale-bootstrap-key',
        NODE_ENV: 'test',
      },
      stdio: 'pipe',
    });
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(base + '/api/health')).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error('server startup');
  };
  const req = async (path: string, body?: unknown, cookie = '', method = body ? 'POST' : 'GET') => {
    const res = await fetch(base + '/api' + path, {
      method,
      headers: { 'X-Pixel-Class': '1', 'Content-Type': 'application/json', Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { res, data: await res.json() };
  };
  try {
    await start();
    const master = await req('/bootstrap', {
      key: 'scale-bootstrap-key',
      email: 'scale-master@example.com',
      password: 'scale-master-password',
      name: '규모 검증 MASTER',
    });
    const masterCookie = master.res.headers.get('set-cookie')!.split(';')[0];
    const cookies: string[] = [];
    for (let i = 0; i < 30; i++) {
      const inv = await req('/invitations', { label: `학생 ${i + 1}` }, masterCookie);
      const added = await req('/register', {
        key: inv.data.key,
        email: `scale-${i}@example.com`,
        password: 'scale-student-password',
        name: `학생 ${i + 1}`,
        appearance: defaultAppearance,
      });
      assert.equal(added.res.status, 201, JSON.stringify(added.data));
      const logged = await req('/login', {
        email: `scale-${i}@example.com`,
        password: 'scale-student-password',
      });
      assert.equal(
        logged.res.status,
        200,
        'Classmates sharing one IP must each be able to sign in.',
      );
      cookies.push(logged.res.headers.get('set-cookie')!.split(';')[0]);
    }
    let state = (await req('/state', undefined, masterCookie)).data as AppState;
    assert.equal(state.desks.length, 30);
    assert.equal(
      new Set(state.members.filter((m) => m.role === 'STUDENT').map((m) => m.deskId)).size,
      30,
    );
    assert.ok(state.world!.height > 2000);
    const spawn = spawnPoint(state.world!);
    const pathStart = performance.now();
    for (const desk of state.desks) {
      const target = { x: desk.x, y: desk.y + 80 };
      assert.ok(canStand(target.x, target.y, state.desks, state.world));
      const path = findPath(spawn, target, state.desks, state.world);
      assert.ok(path.length > 0, `unreachable ${desk.id}`);
      let from = spawn;
      for (const step of path) {
        assert.ok(segmentClear(from, step, state.desks, state.world));
        from = step;
      }
      assert.ok(Math.hypot(from.x - target.x, from.y - target.y) < 5);
    }
    console.log(
      `30 collision-safe paths: ${Math.round(performance.now() - pathStart)}ms (server simulation, not a notebook FPS benchmark)`,
    );
    const student = state.members.find((m) => m.role === 'STUDENT')!;
    const original = student.deskId;
    await req(
      `/members/${student.id}`,
      { status: 'ON_LEAVE', reason: '자리 복원 검증', releaseDesk: true },
      masterCookie,
      'PATCH',
    );
    await req(
      `/members/${student.id}`,
      { status: 'ACTIVE', reason: '복학 검증' },
      masterCookie,
      'PATCH',
    );
    state = (await req('/state', undefined, masterCookie)).data;
    assert.equal(state.members.find((m: typeof student) => m.id === student.id)!.deskId, original);
    for (const cookie of cookies) {
      const ws = await new Promise<WebSocket>((resolve, reject) => {
        const w = new WebSocket(base.replace('http', 'ws') + '/socket', {
          headers: { Cookie: cookie, Origin: base },
        });
        w.once('open', () => resolve(w));
        w.once('error', reject);
      });
      sockets.push(ws);
    }
    assert.equal((await req('/state', undefined, masterCookie)).data.online.length, 30);
    const received = new Promise<void>((resolve) =>
      sockets[1].on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'move' && m.x === 570) resolve();
      }),
    );
    sockets[0].send(
      JSON.stringify({ ...spawn, x: 570, direction: 'right', moving: true, seated: false }),
    );
    await Promise.race([
      received,
      new Promise((_, reject) => setTimeout(() => reject(Error('movement not relayed')), 2000)),
    ]);
    sockets.forEach((s) => s.close());
    const stopped = new Promise((r) => child.once('exit', r));
    child.kill();
    await stopped;
    await start();
    const restored = (await req('/state', undefined, masterCookie)).data;
    assert.deepEqual(restored.world, state.world);
    assert.equal(restored.desks.length, 30);
  } finally {
    sockets.forEach((s) => s.terminate());
    if (child! && !child.killed) {
      const stopped = new Promise((r) => child.once('exit', r));
      child.kill();
      await stopped;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
test('A* never cuts through a desk and routes around the obstructed line', () => {
  const desks = Array.from({ length: 30 }, () => ({ x: 0, y: 0 }));
  desks.length = 0;
  for (let i = 0; i < 30; i++) desks.push(nextDeskSlot(desks)!);
  const world = worldSize(desks);
  const a = { x: 180, y: 400 },
    b = { x: 850, y: 400 };
  const path = findPath(a, b, desks, world);
  assert.ok(path.length);
  assert.deepEqual(path.at(-1), b);
  let from = a;
  for (const step of path) {
    assert.ok(segmentClear(from, step, desks, world));
    from = step;
  }
  assert.equal(canStand(300, 307, desks, world), false);
});
