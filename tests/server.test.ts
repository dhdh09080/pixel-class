import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { WebSocket } from 'ws';
import {
  defaultAppearance,
  emptyProject,
  type AppState,
  type Project,
  type Invitation,
  type Member,
} from '../shared/types.js';
import { canStand, initialDesks, validDesk } from '../shared/world.js';
const dir = mkdtempSync(join(tmpdir(), 'pixel-api-'));
const database = join(dir, 'test.sqlite');
const base = 'http://127.0.0.1:3011';
let child: ChildProcess,
  masterCookie = '',
  studentCookie = '',
  otherCookie = '',
  projectId = '',
  key = '',
  inviteId = '';
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = '',
  extra: Record<string, string> = {},
) {
  const res = await fetch(base + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Pixel-Class': '1', Cookie: cookie, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return { res, data: data as Record<string, any> };
}
before(async () => {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: '3011',
      DATABASE_PATH: database,
      DEMO_MODE: 'false',
      MASTER_BOOTSTRAP_KEY: 'test-only-bootstrap-key',
      NODE_ENV: 'test',
    },
    stdio: 'pipe',
  });
  let logs = '';
  child.stderr?.on('data', (d) => (logs += String(d)));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server did not start: ' + logs);
});
after(() => {
  child?.kill();
  setTimeout(() => rmSync(dir, { recursive: true, force: true }), 500).unref();
});
test('private mode fails closed and rejects cross-origin / missing CSRF header', async () => {
  assert.equal((await request('/state')).res.status, 401);
  assert.equal((await request('/demo', 'POST', { role: 'MASTER' })).res.status, 404);
  assert.equal(
    (await request('/login', 'POST', {}, '', { Origin: 'https://untrusted.example' })).res.status,
    403,
  );
  const r = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(r.status, 403);
});
test('one-time MASTER bootstrap, password login and session security', async () => {
  const c = {
    email: 'teacher@example.com',
    password: 'correct-horse-password',
    name: '선생님',
    key: 'wrong-key',
  };
  assert.equal((await request('/bootstrap', 'POST', c)).res.status, 403);
  const r = await request('/bootstrap', 'POST', { ...c, key: 'test-only-bootstrap-key' });
  assert.equal(r.res.status, 200);
  masterCookie = r.res.headers.get('set-cookie')!.split(';')[0];
  assert.match(r.res.headers.get('set-cookie')!, /HttpOnly/);
  assert.match(r.res.headers.get('set-cookie')!, /SameSite=Strict/i);
  assert.equal(
    (await request('/bootstrap', 'POST', { ...c, key: 'test-only-bootstrap-key' })).res.status,
    409,
  );
  assert.equal(
    (await request('/login', 'POST', { email: c.email, password: 'wrong-password' })).res.status,
    401,
  );
  assert.equal((await request('/login', 'POST', c)).res.status, 200);
});
test('invitations are hashed, one-time and assign persistent character + empty desk', async () => {
  const r = await request('/invitations', 'POST', { label: '신규 학생' }, masterCookie);
  assert.equal(r.res.status, 200);
  key = r.data.key;
  inviteId = r.data.id;
  const sqlite = new DatabaseSync(database);
  const stored = sqlite
    .prepare('SELECT key_hash,body FROM invitations WHERE id=?')
    .get(inviteId) as { key_hash: string; body: string };
  assert.equal(stored.key_hash, createHash('sha256').update(key).digest('hex'));
  assert.ok(!stored.body.includes(key));
  sqlite.close();
  assert.equal(
    (
      await request('/register', 'POST', {
        email: 'student@example.com',
        password: 'student-password',
        name: '학생',
        appearance: defaultAppearance,
        key: 'invalid-key',
      })
    ).res.status,
    400,
  );
  const c = {
    email: 'student@example.com',
    password: 'student-password',
    name: '학생',
    appearance: { ...defaultAppearance, accessory: 1 },
    key,
  };
  const added = await request('/register', 'POST', c);
  assert.equal(added.res.status, 201);
  studentCookie = added.res.headers.get('set-cookie')!.split(';')[0];
  const state = (await request('/state', 'GET', undefined, studentCookie))
    .data as unknown as AppState;
  assert.equal(state.me.appearance.accessory, 1);
  assert.ok(state.me.deskId);
  assert.equal(state.projects.length, 0);
  assert.equal(
    (await request('/register', 'POST', { ...c, email: 'reuse@example.com' })).res.status,
    400,
  );
  assert.equal(
    (await request('/invitations', 'POST', { label: '권한 위반' }, studentCookie)).res.status,
    403,
  );
});
test('project CRUD, tasks, records, questions, feedback and owner permissions', async () => {
  const r = await request(
    '/projects',
    'POST',
    { ...emptyProject(), title: '안전 일지', purpose: '반복 업무 줄이기', isPublic: true },
    studentCookie,
  );
  assert.equal(r.res.status, 201);
  projectId = r.data.id;
  assert.equal(
    (
      await request(
        `/projects/${projectId}`,
        'PATCH',
        { tasks: [{ id: 'task1', text: '첫 화면 구현', done: true }] },
        studentCookie,
      )
    ).res.status,
    200,
  );
  assert.equal(
    (
      await request(
        `/projects/${projectId}/entries`,
        'POST',
        { text: '화면을 만들었어요', type: 'updates' },
        studentCookie,
      )
    ).res.status,
    200,
  );
  assert.equal(
    (
      await request(
        `/projects/${projectId}/entries`,
        'POST',
        { text: '질문입니다', type: 'questions' },
        studentCookie,
      )
    ).res.status,
    200,
  );
  assert.equal(
    (
      await request(
        `/projects/${projectId}/entries`,
        'POST',
        { text: '가짜 피드백', type: 'feedback' },
        studentCookie,
      )
    ).res.status,
    403,
  );
  assert.equal(
    (
      await request(
        `/projects/${projectId}`,
        'PATCH',
        { title: '선생님이 무단 수정' },
        masterCookie,
      )
    ).res.status,
    403,
  );
  assert.equal(
    (
      await request(
        `/projects/${projectId}/entries`,
        'POST',
        { text: '저장 기능을 추가해 보세요', type: 'feedback', kind: '다음 과제' },
        masterCookie,
      )
    ).res.status,
    200,
  );
  assert.equal(
    (
      await request(
        `/projects/${projectId}`,
        'PATCH',
        { serviceUrl: 'javascript:alert(1)' },
        studentCookie,
      )
    ).res.status,
    400,
  );
  assert.equal(
    (await request(`/projects/${projectId}/approve`, 'POST', {}, masterCookie)).res.status,
    400,
  );
  await request(`/projects/${projectId}`, 'PATCH', { status: 'REVIEW' }, studentCookie);
  assert.equal(
    (await request(`/projects/${projectId}/approve`, 'POST', {}, masterCookie)).res.status,
    200,
  );
  const state = (await request('/state', 'GET', undefined, studentCookie))
    .data as unknown as AppState;
  const p = state.projects.find((p) => p.id === projectId)!;
  assert.equal(p.approved, true);
  assert.equal(p.status, 'COMPLETED');
  assert.equal(p.feedback.length, 2);
  assert.equal(p.tasks.filter((t) => t.done).length, 1);
  assert.equal(state.me.help, true);
  assert.equal(p.updates.length, 1);
});
test('expired/revoked invitation keys rejected and public project responses redact private details', async () => {
  for (const mode of ['expired', 'revoked']) {
    const inv = await request('/invitations', 'POST', { label: mode }, masterCookie);
    if (mode === 'revoked')
      await request(`/invitations/${inv.data.id}`, 'DELETE', {}, masterCookie);
    else {
      const sqlite = new DatabaseSync(database);
      const row = sqlite.prepare('SELECT body FROM invitations WHERE id=?').get(inv.data.id) as {
        body: string;
      };
      const body = JSON.parse(row.body);
      body.expiresAt = '2000-01-01T00:00:00.000Z';
      sqlite
        .prepare('UPDATE invitations SET body=? WHERE id=?')
        .run(JSON.stringify(body), inv.data.id);
      sqlite.close();
    }
    assert.equal(
      (
        await request('/register', 'POST', {
          email: mode + '@example.com',
          password: 'student-password',
          name: '거절',
          appearance: defaultAppearance,
          key: inv.data.key,
        })
      ).res.status,
      400,
    );
  }
  const existing = (await request('/state', 'GET', undefined, masterCookie))
    .data as unknown as AppState;
  for (const desk of existing.desks)
    if (desk.id !== existing.members.find((m) => m.role === 'STUDENT')?.deskId)
      await request(`/desks/${desk.id}`, 'DELETE', undefined, masterCookie);
  const inv = await request('/invitations', 'POST', { label: '다른 학생' }, masterCookie);
  const r = await request('/register', 'POST', {
    email: 'other@example.com',
    password: 'other-password',
    name: '다른 학생',
    appearance: defaultAppearance,
    key: inv.data.key,
  });
  otherCookie = r.res.headers.get('set-cookie')!.split(';')[0];
  const state = (await request('/state', 'GET', undefined, otherCookie))
    .data as unknown as AppState;
  const p = state.projects.find((p) => p.id === projectId)!;
  assert.equal(state.desks.length, 2);
  assert.ok(state.me.deskId);
  assert.equal(p.title, '안전 일지');
  assert.deepEqual(p.feedback, []);
  assert.deepEqual(p.updates, []);
  assert.deepEqual(p.questions, []);
  assert.equal(
    (await request(`/projects/${projectId}`, 'PATCH', { title: '침범' }, otherCookie)).res.status,
    403,
  );
  assert.equal(
    (await request(`/projects/${projectId}`, 'DELETE', {}, otherCookie)).res.status,
    403,
  );
  await request(`/projects/${projectId}`, 'PATCH', { isPublic: false }, studentCookie);
  assert.ok(
    !(await request('/state', 'GET', undefined, otherCookie)).data.projects.some(
      (p: Project) => p.id === projectId,
    ),
  );
});
test('school isolation, role escalation and character ownership', async () => {
  const sqlite = new DatabaseSync(database);
  const row = sqlite
    .prepare('SELECT body FROM users WHERE id=(SELECT user_id FROM sessions LIMIT 1)')
    .get() as { body: string };
  const user = JSON.parse(row.body) as Member;
  const foreign = {
    ...emptyProject(),
    id: 'foreign-project',
    schoolId: 'other-school',
    ownerId: user.id,
    title: '다른 학교 비밀',
    tasks: [],
    updates: [],
    questions: [],
    feedback: [],
    aiMessages: [],
    approved: false,
    isPublic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  sqlite
    .prepare('INSERT INTO records VALUES(?,?,?,?)')
    .run(foreign.id, foreign.schoolId, 'project', JSON.stringify(foreign));
  sqlite.close();
  const state = (await request('/state', 'GET', undefined, masterCookie))
    .data as unknown as AppState;
  assert.ok(!state.projects.some((p) => p.id === foreign.id));
  assert.equal(
    (await request(`/projects/${foreign.id}`, 'PATCH', { title: '해킹' }, masterCookie)).res.status,
    404,
  );
  await request(
    '/me',
    'PATCH',
    { name: '학생 새 이름', role: 'MASTER', appearance: { ...defaultAppearance, hairstyle: 2 } },
    studentCookie,
  );
  const s = (await request('/state', 'GET', undefined, studentCookie)).data as unknown as AppState;
  assert.equal(s.me.role, 'STUDENT');
  assert.equal(s.me.appearance.hairstyle, 2);
  assert.equal(s.me.name, '학생 새 이름');
  assert.equal(
    (
      await request(
        `/members/${s.me.id}`,
        'PATCH',
        { status: 'ACTIVE', reason: '권한 상승' },
        studentCookie,
      )
    ).res.status,
    403,
  );
});

test('personal event feed is scoped to its recipient and acknowledges receipt', async () => {
  const student = await request('/events', 'GET', undefined, studentCookie);
  const events = student.data as unknown as {
    id: string;
    userId: string;
    type: string;
    readAt: string | null;
  }[];
  assert.ok(events.some((e) => e.type === 'mentor.feedback.created'));
  assert.ok(events.some((e) => e.type === 'character.updated'));
  const mine = events[0];
  assert.equal((await request(`/events/${mine.id}/read`, 'POST', {}, otherCookie)).res.status, 404);
  assert.equal(
    (await request(`/events/${mine.id}/read`, 'POST', {}, studentCookie)).res.status,
    200,
  );
  const updated = (await request('/events', 'GET', undefined, studentCookie))
    .data as unknown as typeof events;
  assert.ok(updated.find((e) => e.id === mine.id)?.readAt);
});

test('private material upload/download, format checks, versioning and AI missing configuration', async () => {
  const payload = {
    title: '안전 교안',
    description: '교육 자료',
    category: '시작하기',
    visibility: 'ACTIVE',
    fileName: 'guide.txt',
    content: Buffer.from('비공개 교육 자료').toString('base64'),
  };
  assert.equal((await request('/materials', 'POST', payload, studentCookie)).res.status, 403);
  assert.equal(
    (await request('/materials', 'POST', { ...payload, fileName: 'script.html' }, masterCookie)).res
      .status,
    400,
  );
  assert.equal((await request('/materials', 'POST', payload, masterCookie)).res.status, 200);
  let s = (await request('/state', 'GET', undefined, studentCookie)).data as unknown as AppState;
  const m = s.materials[0];
  assert.ok(!('content' in m));
  assert.equal((await request(`/materials/${m.id}/download`)).res.status, 401);
  assert.equal(
    (await request(`/materials/${m.id}/download`, 'GET', undefined, studentCookie)).data as unknown,
    '비공개 교육 자료',
  );
  await request('/materials', 'POST', { ...payload, replaceId: m.id }, masterCookie);
  s = (await request('/state', 'GET', undefined, studentCookie)).data as unknown as AppState;
  assert.equal(s.materials[0].version, 2);
  assert.equal(
    (await request(`/projects/${projectId}/ai`, 'POST', { text: '도와주세요' }, studentCookie)).res
      .status,
    503,
  );
});
test('collision boundaries and desk placement preserve corridors', () => {
  assert.equal(canStand(560, 625, initialDesks), true);
  assert.equal(canStand(535, 307, initialDesks), false);
  assert.equal(canStand(0, 500, initialDesks), false);
  assert.equal(canStand(100, 280, initialDesks), false);
  assert.equal(validDesk(300, 307, initialDesks), false);
  assert.equal(validDesk(110, 300, []), false);
});
test('two authenticated clients exchange position and chat, unauthenticated socket is rejected', async () => {
  const open = (cookie: string) =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(base.replace('http', 'ws') + '/socket', {
        headers: { Cookie: cookie, Origin: base },
      });
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  const a = await open(studentCookie),
    b = await open(masterCookie);
  try {
    const movement = new Promise<Record<string, any>>((resolve) =>
      b.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'move') resolve(m);
      }),
    );
    a.send(JSON.stringify({ x: 570, y: 625, direction: 'right', moving: true, seated: false }));
    const m = await Promise.race([
      movement,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no movement sync')), 2000)),
    ]);
    assert.equal(m.x, 570);
    const r = await request(
      '/messages',
      'POST',
      { text: '안녕하세요', type: 'CHAT', recipientId: null },
      studentCookie,
    );
    assert.equal(r.res.status, 200);
    assert.ok(
      (await request('/state', 'GET', undefined, masterCookie)).data.messages.some(
        (m: Record<string, any>) => m.text === '안녕하세요',
      ),
    );
    assert.equal(
      (await request('/messages', 'POST', { text: '가짜 공지', type: 'NOTICE' }, studentCookie)).res
        .status,
      403,
    );
  } finally {
    a.close();
    b.close();
  }
  await assert.rejects(() => open(''));
});
test('leave, return, graduation and revocation preserve records and enforce access', async () => {
  const s = (await request('/state', 'GET', undefined, studentCookie)).data as unknown as AppState;
  const uid = s.me.id,
    desk = s.me.deskId;
  assert.equal(
    (
      await request(
        `/members/${uid}`,
        'PATCH',
        { status: 'ON_LEAVE', reason: '잠시 휴식' },
        masterCookie,
      )
    ).res.status,
    200,
  );
  assert.equal(
    (
      await request(
        '/projects',
        'POST',
        { ...emptyProject(), title: '휴학 중 생성' },
        studentCookie,
      )
    ).res.status,
    403,
  );
  let state = (await request('/state', 'GET', undefined, studentCookie))
    .data as unknown as AppState;
  assert.equal(state.me.deskId, desk);
  assert.ok(state.projects.some((p) => p.id === projectId));
  assert.equal(
    (await request('/materials/none/download', 'GET', undefined, studentCookie)).res.status,
    403,
  );
  await request(`/members/${uid}`, 'PATCH', { status: 'ACTIVE', reason: '복학' }, masterCookie);
  state = (await request('/state', 'GET', undefined, studentCookie)).data as unknown as AppState;
  assert.equal(state.me.deskId, desk);
  await request(
    `/members/${uid}`,
    'PATCH',
    { status: 'GRADUATED', reason: '수료 완료' },
    masterCookie,
  );
  state = (await request('/state', 'GET', undefined, studentCookie)).data as unknown as AppState;
  assert.equal(state.me.deskId, null);
  assert.ok(state.projects.some((p) => p.id === projectId));
  await request(
    `/members/${uid}`,
    'PATCH',
    { status: 'REVOKED', reason: '접근 회수' },
    masterCookie,
  );
  assert.equal((await request('/state', 'GET', undefined, studentCookie)).res.status, 403);
  const master = (await request('/state', 'GET', undefined, masterCookie))
    .data as unknown as AppState;
  assert.equal(master.history.length, 4);
});
test('persistence survives server process restart', async () => {
  const stopped = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill();
  await stopped;
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: '3011',
      DATABASE_PATH: database,
      DEMO_MODE: 'false',
      NODE_ENV: 'test',
    },
    stdio: 'pipe',
  });
  for (let i = 0; i < 60; i++) {
    try {
      const s = await request('/state', 'GET', undefined, masterCookie);
      if (s.res.ok) {
        assert.ok(s.data.projects.some((p: Project) => p.id === projectId));
        assert.equal(s.data.history.length, 4);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail('server did not preserve data');
});
