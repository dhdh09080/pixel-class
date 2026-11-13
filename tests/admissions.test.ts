import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import { defaultAppearance, emptyProject } from '../shared/types.js';
import { isPublicEnrollmentRequest } from '../server/admission-policy.js';

const dir = mkdtempSync(join(tmpdir(), 'pixel-approval-'));
const database = join(dir, 'school.sqlite'),
  base = 'http://127.0.0.1:3096';
let child: ChildProcess,
  teacher = '',
  applicant = '',
  rejectedCookie = '',
  applicantId = '',
  rejectedId = '',
  classId = '',
  projectId = '';
const password = 'test-applicant-password';
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = '',
  extra: Record<string, string> = {},
) {
  const res = await fetch(base + '/api' + path, {
    method,
    headers: {
      Origin: base,
      'X-Pixel-Class': '1',
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { res, data: (await res.json()) as Record<string, any> };
}
async function start() {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: '3096',
      HOST: '127.0.0.1',
      DATABASE_PATH: database,
      DEMO_MODE: 'false',
      APPROVAL_REGISTRATION_ENABLED: 'true',
      MASTER_BOOTSTRAP_KEY: 'approval-test-bootstrap',
      NODE_ENV: 'test',
    },
    stdio: 'pipe',
  });
  let logs = '';
  child.stderr?.on('data', (data) => (logs += String(data)));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Approval server failed: ' + logs);
}
before(start);
after(async () => {
  if (child && child.exitCode === null) {
    const ended = once(child, 'exit');
    child.kill();
    await ended;
  }
  rmSync(dir, { recursive: true, force: true });
});
const signup = (email: string, name = '새 학생') => ({
  email,
  password,
  name,
  appearance: { ...defaultAppearance, hairstyle: 2 },
});

test('public admission policy permits exact routes and methods only', () => {
  for (const path of ['/join', '/api/enrollment/config', '/api/enrollment/session'])
    assert.equal(isPublicEnrollmentRequest('GET', path, true), true);
  for (const path of [
    '/api/enrollment/register',
    '/api/enrollment/login',
    '/api/enrollment/enter',
    '/api/enrollment/logout',
    '/api/enrollment/recover',
  ])
    assert.equal(isPublicEnrollmentRequest('POST', path, true), true);
  for (const path of [
    '/api/state',
    '/api/bootstrap',
    '/api/enrollment/register/extra',
    '/api/enrollment/',
    '/join/extra',
    '/api/enrollment/%2e%2e/state',
  ])
    for (const method of ['GET', 'POST', 'PUT', 'HEAD'])
      assert.equal(isPublicEnrollmentRequest(method, path, true), false);
  assert.equal(isPublicEnrollmentRequest('POST', '/api/enrollment/register', false), false);
});
test('signup needs an existing school MASTER and never accepts forged roles or class ownership', async () => {
  assert.equal((await request('/enrollment/config')).data.acceptingApplications, false);
  assert.equal(
    (await request('/enrollment/register', 'POST', signup('before@example.test'))).res.status,
    503,
  );
  const master = await request('/bootstrap', 'POST', {
    email: 'master@example.test',
    password,
    name: '승인 선생님',
    key: 'approval-test-bootstrap',
  });
  assert.equal(master.res.status, 200);
  teacher = cookies(master.res);
  assert.equal((await request('/enrollment/config')).data.acceptingApplications, true);
  for (const forged of [
    { role: 'MASTER' },
    { status: 'ACTIVE' },
    { schoolId: 'other-school' },
    { classId: 'injected' },
    { key: 'old-invitation' },
  ])
    assert.equal(
      (
        await request('/enrollment/register', 'POST', {
          ...signup('forged@example.test'),
          ...forged,
        })
      ).res.status,
      400,
    );
  assert.equal(
    (
      await request('/enrollment/register', 'POST', signup('bad-origin@example.test'), '', {
        Origin: 'https://evil.example',
      })
    ).res.status,
    403,
  );
  const noOrigin = await fetch(base + '/api/enrollment/register', {
    method: 'POST',
    headers: { 'X-Pixel-Class': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify(signup('no-origin@example.test')),
  });
  assert.equal(noOrigin.status, 403);
});
test('code-free signup persists a pending account and grants no classroom, desk, API or socket access', async () => {
  const result = await request(
    '/enrollment/register',
    'POST',
    signup('student@example.test', '승인 학생'),
  );
  assert.equal(result.res.status, 201);
  applicant = cookies(result.res);
  assert.equal(result.data.status, 'PENDING');
  const own = await request('/enrollment/session', 'GET', undefined, applicant);
  applicantId = own.data.id;
  assert.equal(own.data.status, 'PENDING');
  assert.equal(own.data.name, '승인 학생');
  assert.equal(own.data.appearance.hairstyle, 2);
  assert.ok(!('members' in own.data));
  assert.ok(!('email' in own.data));
  assert.ok(!('classId' in own.data));
  for (const path of ['/state', '/teaching', '/admissions'])
    assert.equal((await request(path, 'GET', undefined, applicant)).res.status, 403);
  assert.equal((await request('/enrollment/enter', 'POST', {}, applicant)).res.status, 403);
  assert.equal(
    (await request('/projects', 'POST', { ...emptyProject(), title: '승인 전' }, applicant)).res
      .status,
    403,
  );
  const sqlite = new DatabaseSync(database);
  const stored = JSON.parse(
    (sqlite.prepare('SELECT body FROM users WHERE id=?').get(applicantId) as { body: string }).body,
  );
  sqlite.close();
  assert.equal(stored.deskId, null);
  assert.equal(stored.classId, undefined);
  assert.equal(stored.role, 'STUDENT');
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/socket', {
      headers: { Origin: base, Cookie: applicant },
    });
    ws.on('open', () => {
      ws.close();
      reject(Error('Pending socket accepted'));
    });
    ws.on('error', () => resolve());
  });
  assert.equal(
    (await request('/enrollment/register', 'POST', signup('STUDENT@EXAMPLE.TEST'))).res.status,
    409,
  );
  assert.equal((await request('/register', 'POST', signup('legacy@example.test'))).res.status, 410);
  assert.equal((await request('/invitations', 'POST', { label: 'old' }, teacher)).res.status, 410);
  assert.equal(
    (await request('/invitations/batch', 'POST', { label: 'old', count: 1 }, teacher)).res.status,
    410,
  );
});
test('MASTER queue is scoped; approval requires a local class and rejects generic activation and stale writes', async () => {
  const result = await request('/classes', 'POST', { name: '다희 AI 1반' }, teacher);
  assert.equal(result.res.status, 201);
  classId = result.data.id;
  const queue = await request('/admissions', 'GET', undefined, teacher);
  assert.equal(queue.data[0].email, 'student@example.test');
  assert.ok(!('password' in queue.data[0]));
  assert.equal(
    (
      await request(
        '/members/' + applicantId,
        'PATCH',
        { status: 'ACTIVE', reason: '우회' },
        teacher,
      )
    ).res.status,
    409,
  );
  assert.equal(
    (
      await request(
        '/classes/' + classId + '/members',
        'PATCH',
        { memberIds: [applicantId] },
        teacher,
      )
    ).res.status,
    400,
  );
  assert.equal(
    (await request('/admissions/' + applicantId + '/approve', 'POST', { revision: 0 }, teacher)).res
      .status,
    400,
  );
  const sqlite = new DatabaseSync(database);
  sqlite
    .prepare('INSERT INTO records VALUES(?,?,?,?)')
    .run(
      'foreign-class',
      'foreign-school',
      'competition-class',
      JSON.stringify({ id: 'foreign-class', schoolId: 'foreign-school', name: '다른 학교' }),
    );
  sqlite
    .prepare('INSERT INTO users VALUES(?,?,?,?,?)')
    .run(
      'foreign-applicant',
      'foreign-school',
      'foreign@example.test',
      '0:',
      JSON.stringify({
        id: 'foreign-applicant',
        schoolId: 'foreign-school',
        role: 'STUDENT',
        status: 'PENDING',
        admission: { revision: 0, requestedAt: new Date().toISOString() },
      }),
    );
  sqlite.close();
  assert.equal(
    (
      await request(
        '/admissions/' + applicantId + '/approve',
        'POST',
        { revision: 0, classId: 'foreign-class' },
        teacher,
      )
    ).res.status,
    404,
  );
  assert.equal(
    (
      await request(
        '/admissions/foreign-applicant/approve',
        'POST',
        { revision: 0, classId },
        teacher,
      )
    ).res.status,
    404,
  );
  const localQueue = await request('/admissions', 'GET', undefined, teacher);
  assert.equal(localQueue.data.length, 1);
  const concurrent = await Promise.all([
    request('/admissions/' + applicantId + '/approve', 'POST', { revision: 0, classId }, teacher),
    request('/admissions/' + applicantId + '/approve', 'POST', { revision: 0, classId }, teacher),
  ]);
  assert.deepEqual(concurrent.map((result) => result.res.status).sort(), [200, 409]);
  const active = (await request('/state', 'GET', undefined, applicant)).data;
  assert.equal(active.me.status, 'ACTIVE');
  assert.equal(active.me.classId, classId);
  assert.ok(active.me.deskId);
  assert.equal(
    active.members.some((member: any) => member.status === 'PENDING'),
    false,
  );
});
test('rejection is explained privately and can be reconsidered with a fresh revision', async () => {
  const result = await request(
    '/enrollment/register',
    'POST',
    signup('rejected@example.test', '재검토 학생'),
  );
  rejectedCookie = cookies(result.res);
  rejectedId = (await request('/enrollment/session', 'GET', undefined, rejectedCookie)).data.id;
  assert.equal(
    (await request('/admissions/' + rejectedId + '/reject', 'POST', { revision: 0 }, teacher)).res
      .status,
    400,
  );
  assert.equal(
    (
      await request(
        '/admissions/' + rejectedId + '/reject',
        'POST',
        { revision: 0, reason: '이름을 확인해 주세요.' },
        teacher,
      )
    ).res.status,
    200,
  );
  const own = await request('/enrollment/session', 'GET', undefined, rejectedCookie);
  assert.equal(own.data.status, 'REJECTED');
  assert.equal(own.data.reason, '이름을 확인해 주세요.');
  assert.equal((await request('/state', 'GET', undefined, rejectedCookie)).res.status, 403);
  const studentView = await request('/state', 'GET', undefined, applicant);
  assert.ok(!studentView.data.members.some((member: any) => member.id === rejectedId));
  assert.ok(!('admissions' in studentView.data));
  assert.equal(
    (
      await request(
        '/admissions/' + rejectedId + '/approve',
        'POST',
        { revision: 0, classId },
        teacher,
      )
    ).res.status,
    409,
  );
  assert.equal(
    (
      await request(
        '/admissions/' + rejectedId + '/approve',
        'POST',
        { revision: 1, classId },
        teacher,
      )
    ).res.status,
    200,
  );
});
test('approved accounts retain project ownership and single-use public recovery without invitation codes', async () => {
  const created = await request(
    '/projects',
    'POST',
    { ...emptyProject(), title: '새 반의 프로젝트' },
    applicant,
  );
  assert.equal(created.res.status, 201);
  projectId = created.data.id;
  assert.equal(
    (await request('/projects/' + projectId, 'PATCH', { title: '가로채기' }, rejectedCookie)).res
      .status,
    403,
  );
  const recovery = await request('/members/' + applicantId + '/recovery', 'POST', {}, teacher);
  assert.equal(recovery.res.status, 200);
  assert.equal(
    (
      await request('/enrollment/recover', 'POST', {
        key: recovery.data.key,
        password: password + '-new',
      })
    ).res.status,
    200,
  );
  assert.equal((await request('/enrollment/session', 'GET', undefined, applicant)).res.status, 401);
  assert.equal(
    (await request('/enrollment/recover', 'POST', { key: recovery.data.key, password })).res.status,
    400,
  );
  const login = await request('/enrollment/login', 'POST', {
    email: 'student@example.test',
    password: password + '-new',
  });
  assert.equal(login.res.status, 200);
  applicant = cookies(login.res);
});
test('approval, class assignment, sessions and project survive restart; logout revokes access', async () => {
  const original = (await request('/state', 'GET', undefined, applicant)).data;
  const ended = once(child, 'exit');
  child.kill();
  await ended;
  await start();
  const restored = (await request('/state', 'GET', undefined, applicant)).data;
  assert.equal(restored.me.classId, classId);
  assert.equal(restored.me.deskId, original.me.deskId);
  assert.equal(
    restored.projects.find((project: any) => project.id === projectId).title,
    '새 반의 프로젝트',
  );
  const own = await request('/enrollment/session', 'GET', undefined, applicant);
  assert.equal(own.data.className, '다희 AI 1반');
  assert.equal((await request('/enrollment/logout', 'POST', {}, applicant)).res.status, 200);
  assert.equal((await request('/enrollment/session', 'GET', undefined, applicant)).res.status, 401);
});
