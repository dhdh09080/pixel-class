import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { aiLimits, mentoringInput } from '../server/ai-policy.js';
import { redactSensitive } from '../shared/learning.js';
import { defaultAppearance, emptyProject } from '../shared/types.js';

test('AI school limits reject malformed, zero and excessive configuration', () => {
  assert.deepEqual(aiLimits({}), { schoolDailyCalls: 60, concurrentCalls: 2 });
  for (const raw of ['0', '-1', '1.5', 'NaN', 'Infinity', '1001', ' 2'])
    assert.throws(() => aiLimits({ AI_SCHOOL_DAILY_CALLS: raw }));
  assert.throws(() => aiLimits({ AI_MAX_CONCURRENT: '11' }));
  assert.deepEqual(aiLimits({ AI_SCHOOL_DAILY_CALLS: '3', AI_MAX_CONCURRENT: '1' }), {
    schoolDailyCalls: 3,
    concurrentCalls: 1,
  });
});
test('AI input bounds huge project/history while retaining the newest redacted question', () => {
  const input = mentoringInput(
    '가'.repeat(100000),
    Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      role: 'user' as const,
      text: i === 29 ? '현재 질문 password=private-value' : '나'.repeat(10000),
      createdAt: '',
    })),
    redactSensitive,
  );
  assert.ok(input.reduce((n, m) => n + m.content.length, 0) <= 22000);
  assert.equal(input[0].content.length, 6000);
  assert.ok(input.at(-1)!.content.startsWith('현재 질문'));
  assert.ok(!JSON.stringify(input).includes('private-value'));
});

async function school(
  run: (s: {
    request: (
      path: string,
      body?: unknown,
      cookie?: string,
    ) => Promise<{ status: number; data: any }>;
    students: string[];
    marker: string;
    release: string;
    file: string;
    restart: () => Promise<void>;
  }) => Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'pixel-v04-ai-'));
  const file = join(dir, 'school.sqlite'),
    marker = join(dir, 'marker'),
    release = join(dir, 'release');
  const base = 'http://127.0.0.1:3023';
  let child: ChildProcess;
  const stop = async () => {
    if (child?.exitCode === null) {
      const done = new Promise((r) => child.once('exit', r));
      child.kill();
      await done;
    }
  };
  const start = async () => {
    child = spawn(
      process.execPath,
      ['--import', 'tsx', '--import', resolve('tests/fixtures/ai-provider.mjs'), 'server/index.ts'],
      {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          HOST: '127.0.0.1',
          PORT: '3023',
          DEMO_MODE: 'false',
          DATABASE_PATH: file,
          MASTER_BOOTSTRAP_KEY: 'v04-test-bootstrap',
          OPENAI_API_KEY: 'fixture-key-not-valid',
          OPENAI_MODEL: 'fixture-only',
          AI_SCHOOL_DAILY_CALLS: '2',
          AI_MAX_CONCURRENT: '1',
          AI_TEST_MARKER: marker,
          AI_TEST_RELEASE: release,
        },
        stdio: 'pipe',
      },
    );
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/api/health')).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error('AI QA server failed to start');
  };
  const request = async (path: string, body?: unknown, cookie = '') => {
    const res = await fetch(base + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Pixel-Class': '1', 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  };
  try {
    await start();
    const boot = await fetch(base + '/api/bootstrap', {
      method: 'POST',
      headers: { 'X-Pixel-Class': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'v04-test-bootstrap',
        name: 'QA',
        email: 'v04-master@example.com',
        password: 'v04-test-password',
      }),
    });
    assert.equal(boot.status, 200);
    const master = boot.headers.get('set-cookie')!.split(';')[0];
    const students = [];
    for (let i = 0; i < 2; i++) {
      const invite = await request('/invitations', { label: 'student' }, master);
      const r = await fetch(base + '/api/register', {
        method: 'POST',
        headers: { 'X-Pixel-Class': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: invite.data.key,
          email: `v04-${i}@example.com`,
          name: `학생 ${i}`,
          password: 'v04-test-password',
          appearance: defaultAppearance,
        }),
      });
      assert.equal(r.status, 201);
      students.push(r.headers.get('set-cookie')!.split(';')[0]);
    }
    await run({
      request,
      students,
      marker,
      release,
      file,
      restart: async () => {
        await stop();
        await start();
      },
    });
  } finally {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('school-wide AI reservation spans users, rejects concurrent projects and survives restart', async () => {
  await school(async ({ request, students, marker, release, restart }) => {
    const a = (await request('/projects', { ...emptyProject(), title: 'A' }, students[0])).data;
    const b = (await request('/projects', { ...emptyProject(), title: 'B' }, students[1])).data;
    const first = request(`/projects/${a.id}/ai`, { text: '첫 질문' }, students[0]);
    for (let i = 0; i < 100 && !existsSync(marker); i++)
      await new Promise((r) => setTimeout(r, 20));
    assert.ok(existsSync(marker));
    const busy = await request(`/projects/${b.id}/ai`, { text: '동시 요청' }, students[1]);
    assert.equal(busy.status, 429);
    assert.match(busy.data.error, /처리/);
    writeFileSync(release, 'HTTP_429');
    assert.equal((await first).status, 502); // Provider failure still consumes a reservation.
    writeFileSync(release, 'release');
    assert.equal(
      (await request(`/projects/${b.id}/ai`, { text: '두 번째' }, students[1])).status,
      200,
    );
    await restart();
    const limit = await request(`/projects/${b.id}/ai`, { text: '재시작 뒤 세 번째' }, students[1]);
    assert.equal(limit.status, 429);
    assert.match(limit.data.error, /학교/);
    const state = (await request('/state', undefined, students[1])).data;
    assert.equal(state.projects.find((p: any) => p.id === b.id).aiMessages.length, 2);
  });
});
test('failed initial AI record storage rolls back both quota reservations before any provider call', async () => {
  await school(async ({ request, students, marker, release, file }) => {
    const p = (await request('/projects', { ...emptyProject(), title: '장애 주입' }, students[0]))
      .data;
    const db = new DatabaseSync(file);
    try {
      db.exec(
        `CREATE TRIGGER fail_ai BEFORE INSERT ON records WHEN NEW.id='${p.id}' BEGIN SELECT RAISE(ABORT,'QA failure'); END`,
      );
      assert.equal(
        (await request(`/projects/${p.id}/ai`, { text: '저장 실패' }, students[0])).status,
        500,
      );
      assert.equal(existsSync(marker), false);
      assert.equal(db.prepare('SELECT count(*) AS n FROM ai_usage').get()!.n, 0);
      assert.equal(db.prepare('SELECT count(*) AS n FROM ai_school_usage').get()!.n, 0);
      db.exec('DROP TRIGGER fail_ai');
      writeFileSync(release, 'release');
      assert.equal(
        (await request(`/projects/${p.id}/ai`, { text: '다시 시도' }, students[0])).status,
        200,
      );
      assert.ok(!readFileSync(marker, 'utf8').includes('저장 실패'));
    } finally {
      db.close();
    }
  });
});
