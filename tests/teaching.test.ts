import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultAppearance } from '../shared/types.js';
const dir = mkdtempSync(join(tmpdir(), 'pixel-teaching-'));
const database = join(dir, 'school.sqlite'),
  base = 'http://127.0.0.1:3018';
let child: ChildProcess,
  teacher = '',
  student = '',
  peer = '',
  studentId = '',
  peerId = '',
  assignmentId = '',
  submissionId = '';
async function request(path: string, method = 'GET', body?: unknown, cookie = teacher) {
  const res = await fetch(base + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Pixel-Class': '1', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { res, data: (await res.json()) as any };
}
before(async () => {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: '3018',
      NODE_ENV: 'test',
      DEMO_MODE: 'false',
      DATABASE_PATH: database,
      MASTER_BOOTSTRAP_KEY: 'test-teaching-bootstrap',
    },
    stdio: 'pipe',
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const boot = await request(
    '/bootstrap',
    'POST',
    {
      key: 'test-teaching-bootstrap',
      name: '수업 선생님',
      email: 'teacher@teaching.example',
      password: 'teacher-password-only',
    },
    '',
  );
  assert.equal(boot.res.status, 200);
  teacher = boot.res.headers.get('set-cookie')!.split(';')[0];
  for (const [name, email] of [
    ['교육생', 'student@teaching.example'],
    ['동료', 'peer@teaching.example'],
  ]) {
    const invite = await request('/invitations', 'POST', { label: name });
    const join = await request(
      '/register',
      'POST',
      {
        key: invite.data.key,
        name,
        email,
        password: 'student-password-only',
        appearance: defaultAppearance,
      },
      '',
    );
    assert.equal(join.res.status, 201);
    const cookie = join.res.headers.get('set-cookie')!.split(';')[0];
    const s = await request('/state', 'GET', undefined, cookie);
    if (name === '교육생') {
      student = cookie;
      studentId = s.data.me.id;
    } else {
      peer = cookie;
      peerId = s.data.me.id;
    }
  }
});
after(async () => {
  const stopped = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await stopped;
  rmSync(dir, { recursive: true, force: true });
});

test('teacher assigns a deadline to selected students, with school/role validation', async () => {
  assert.equal((await request('/teaching', 'GET', undefined, '')).res.status, 401);
  const value = {
    title: '첫 화면 만들기',
    instructions: '화면 링크와 배운 점을 제출하세요.',
    dueAt: new Date(Date.now() + 3600000).toISOString(),
    studentIds: [studentId, peerId],
  };
  assert.equal((await request('/assignments', 'POST', value, student)).res.status, 403);
  assert.equal(
    (await request('/assignments', 'POST', { ...value, studentIds: ['other-school-student'] })).res
      .status,
    400,
  );
  assert.equal(
    (await request('/assignments', 'POST', { ...value, dueAt: new Date(0).toISOString() })).res
      .status,
    400,
  );
  const a = await request('/assignments', 'POST', value);
  assert.equal(a.res.status, 201);
  assignmentId = a.data.id;
});
test('student submissions are private, versioned, and reject unsafe result URLs', async () => {
  assert.equal(
    (
      await request(
        `/assignments/${assignmentId}/submission`,
        'PUT',
        { text: 'done', url: 'javascript:alert(1)', revision: 0 },
        student,
      )
    ).res.status,
    400,
  );
  const result = await request(
    `/assignments/${assignmentId}/submission`,
    'PUT',
    { text: '배운 점과 결과', url: 'https://example.com', revision: 0 },
    student,
  );
  assert.equal(result.res.status, 200);
  submissionId = result.data.id;
  assert.equal(result.data.late, false);
  assert.equal((await request('/teaching', 'GET', undefined, peer)).data.submissions.length, 0);
  assert.equal((await request('/teaching')).data.submissions.length, 1);
  assert.equal(
    (
      await request(
        `/assignments/${assignmentId}/submission`,
        'PUT',
        { text: 'stale', url: '', revision: 0 },
        student,
      )
    ).res.status,
    409,
  );
  assert.equal(
    (
      await request(
        `/homework/${encodeURIComponent(submissionId)}/review`,
        'PATCH',
        { review: 'bad', result: 'APPROVED', revision: 1 },
        peer,
      )
    ).res.status,
    403,
  );
});
test('feedback, late resubmission, deadline extension and archive preserve classroom work', async () => {
  assert.equal(
    (
      await request(`/homework/${encodeURIComponent(submissionId)}/review`, 'PATCH', {
        review: '링크에 설명을 더해 주세요.',
        result: 'CHANGES',
        revision: 1,
      })
    ).res.status,
    200,
  );
  let s = (await request('/teaching', 'GET', undefined, student)).data.submissions[0];
  assert.equal(s.result, 'CHANGES');
  const fixture = new DatabaseSync(database);
  fixture
    .prepare("UPDATE records SET body=json_set(body,'$.dueAt',?) WHERE id=?")
    .run(new Date(0).toISOString(), assignmentId);
  fixture.close();
  const result = await request(
    `/assignments/${assignmentId}/submission`,
    'PUT',
    { text: '보완한 결과', url: '', revision: 2 },
    student,
  );
  assert.equal(result.data.late, true);
  assert.equal(result.data.review, '');
  assert.equal(
    (
      await request(`/homework/${encodeURIComponent(submissionId)}/review`, 'PATCH', {
        review: 'stale',
        result: 'APPROVED',
        revision: 2,
      })
    ).res.status,
    409,
  );
  assert.equal(
    (
      await request(`/assignments/${assignmentId}`, 'PATCH', {
        dueAt: new Date(Date.now() + 7200000).toISOString(),
      })
    ).res.status,
    200,
  );
  await request(`/assignments/${assignmentId}`, 'PATCH', { archived: true });
  assert.equal(
    (
      await request(
        `/assignments/${assignmentId}/submission`,
        'PUT',
        { text: 'blocked', url: '', revision: 3 },
        student,
      )
    ).res.status,
    409,
  );
  s = (await request('/teaching', 'GET', undefined, student)).data.submissions[0];
  assert.equal(s.text, '보완한 결과');
});
test('recovery links are teacher-issued, hashed, single-use and revoke old sessions', async () => {
  assert.equal((await request(`/members/${studentId}/recovery`, 'POST', {}, peer)).res.status, 403);
  const first = await request(`/members/${studentId}/recovery`, 'POST', {});
  const issued = await request(`/members/${studentId}/recovery`, 'POST', {});
  const fixture = new DatabaseSync(database);
  assert.ok(
    !JSON.stringify(
      fixture.prepare("SELECT * FROM records WHERE kind='password-recovery'").all(),
    ).includes(issued.data.key),
  );
  fixture.close();
  assert.equal(
    (
      await request(
        '/account/recover',
        'POST',
        { key: first.data.key, password: 'new-student-password' },
        '',
      )
    ).res.status,
    400,
  );
  assert.equal(
    (
      await request(
        '/account/recover',
        'POST',
        { key: issued.data.key, password: 'new-student-password' },
        '',
      )
    ).res.status,
    200,
  );
  assert.equal((await request('/state', 'GET', undefined, student)).res.status, 401);
  assert.equal(
    (
      await request(
        '/account/recover',
        'POST',
        { key: issued.data.key, password: 'new-student-password' },
        '',
      )
    ).res.status,
    400,
  );
  const login = await request(
    '/login',
    'POST',
    { email: 'student@teaching.example', password: 'new-student-password' },
    '',
  );
  assert.equal(login.res.status, 200);
  student = login.res.headers.get('set-cookie')!.split(';')[0];
});
test('self password change verifies the old password and replaces sessions', async () => {
  assert.equal(
    (
      await request(
        '/account/password',
        'POST',
        { currentPassword: 'wrong-password', password: 'another-new-password' },
        student,
      )
    ).res.status,
    400,
  );
  const old = student;
  const r = await request(
    '/account/password',
    'POST',
    { currentPassword: 'new-student-password', password: 'another-new-password' },
    student,
  );
  assert.equal(r.res.status, 200);
  student = r.res.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await request('/state', 'GET', undefined, old)).res.status, 401);
  assert.equal((await request('/state', 'GET', undefined, student)).res.status, 200);
});
test('batch invitations have individual one-time keys and keep keys out of stored records', async () => {
  assert.equal(
    (await request('/invitations/batch', 'POST', { count: 8, label: '오늘 교육' }, student)).res
      .status,
    403,
  );
  const r = await request('/invitations/batch', 'POST', { count: 8, label: '오늘 교육' });
  assert.equal(r.res.status, 201);
  assert.equal(new Set(r.data.map((i: any) => i.key)).size, 8);
  const fixture = new DatabaseSync(database);
  const records = JSON.stringify(fixture.prepare('SELECT * FROM invitations').all());
  fixture.close();
  assert.ok(r.data.every((i: any) => !records.includes(i.key)));
});
test('backup is teacher-only, consistent, school-scoped and excludes live credentials', async () => {
  assert.equal((await request('/operations', 'GET', undefined, student)).res.status, 403);
  const fixture = new DatabaseSync(database);
  const foreign = {
    id: 'other-school-user',
    schoolId: 'other-school',
    role: 'MASTER',
    name: '외부학교비밀',
  };
  fixture
    .prepare('INSERT INTO users VALUES(?,?,?,?,?)')
    .run(
      foreign.id,
      foreign.schoolId,
      'foreign@example.com',
      'not-a-real-hash',
      JSON.stringify(foreign),
    );
  fixture
    .prepare('INSERT INTO records VALUES(?,?,?,?)')
    .run(
      'foreign-secret',
      foreign.schoolId,
      'material',
      JSON.stringify({ id: 'foreign-secret', content: 'FOREIGN-SCHOOL-SECRET' }),
    );
  fixture.close();
  const result = await request('/operations/backup', 'POST', {});
  assert.equal(result.res.status, 200);
  assert.ok(result.data.backupAt);
  const response = await fetch(base + '/api/operations/backup', { headers: { Cookie: teacher } });
  assert.equal(response.status, 200);
  const path = join(dir, 'export.sqlite');
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(path, bytes);
  assert.ok(!bytes.includes(Buffer.from('FOREIGN-SCHOOL-SECRET')));
  const exported = new DatabaseSync(path);
  assert.equal((exported.prepare('SELECT count(*) AS n FROM sessions').get() as any).n, 0);
  assert.equal(
    (
      exported
        .prepare("SELECT count(*) AS n FROM records WHERE school_id='other-school'")
        .get() as any
    ).n,
    0,
  );
  assert.equal(
    (
      exported
        .prepare("SELECT count(*) AS n FROM users WHERE school_id='other-school'")
        .get() as any
    ).n,
    0,
  );
  assert.equal((exported.prepare('PRAGMA quick_check').get() as any).quick_check, 'ok');
  exported.close();
  assert.equal((await request('/state', 'GET', undefined, student)).res.status, 200);
});

test('deleting a material releases every saved version from the school storage budget', async () => {
  const before = (await request('/operations')).data.usedBytes;
  const value = {
    title: '용량 검증 교안',
    description: '교안',
    category: '시작하기',
    visibility: 'ACTIVE',
    fileName: 'lesson.md',
    content: Buffer.from('first lesson').toString('base64'),
  };
  assert.equal((await request('/materials', 'POST', value)).res.status, 200);
  const material = (await request('/state')).data.materials.find(
    (m: any) => m.title === value.title,
  );
  assert.equal(
    (
      await request('/materials', 'POST', {
        ...value,
        replaceId: material.id,
        content: Buffer.from('second lesson').toString('base64'),
      })
    ).res.status,
    200,
  );
  assert.ok((await request('/operations')).data.usedBytes > before);
  assert.equal(
    (await request(`/materials/${material.id}`, 'DELETE', undefined, student)).res.status,
    403,
  );
  assert.equal((await request(`/materials/${material.id}`, 'DELETE')).res.status, 200);
  assert.equal((await request('/operations')).data.usedBytes, before);
  const fixture = new DatabaseSync(database);
  assert.equal(
    (
      fixture
        .prepare(
          "SELECT count(*) AS n FROM records WHERE kind='material-version' AND json_extract(body,'$.materialId')=?",
        )
        .get(material.id) as any
    ).n,
    0,
  );
  fixture.close();
});

test('shared-IP login allowance retains a separate per-account guessing limit', async () => {
  for (let i = 0; i < 12; i++) {
    assert.equal(
      (
        await request(
          '/login',
          'POST',
          { email: 'missing-account@example.com', password: 'incorrect-password' },
          '',
        )
      ).res.status,
      401,
    );
  }
  assert.equal(
    (
      await request(
        '/login',
        'POST',
        { email: 'missing-account@example.com', password: 'incorrect-password' },
        '',
      )
    ).res.status,
    429,
  );
  assert.equal(
    (
      await request(
        '/login',
        'POST',
        { email: 'teacher@teaching.example', password: 'teacher-password-only' },
        '',
      )
    ).res.status,
    200,
  );
});
