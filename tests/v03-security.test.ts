import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import { defaultAppearance, emptyProject } from '../shared/types.js';
const dir = mkdtempSync(join(tmpdir(), 'pixel-v03-security-'));
const file = join(dir, 'school.sqlite'),
  marker = join(dir, 'provider-request'),
  release = join(dir, 'provider-release');
const base = 'http://127.0.0.1:3018';
let child: ReturnType<typeof spawn>,
  master = '',
  student = '',
  studentId = '';
async function call(
  path: string,
  body?: unknown,
  cookie = student,
  method = 'POST',
  extra: Record<string, string> = {},
) {
  const res = await fetch(base + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Pixel-Class': '1', Cookie: cookie, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return { res, data };
}
async function create() {
  return (await call('/projects', { ...emptyProject(), title: 'v03 회귀 검증' })).data;
}
before(async () => {
  child = spawn(
    process.execPath,
    ['--import', 'tsx', '--import', resolve('tests/fixtures/ai-provider.mjs'), 'server/index.ts'],
    {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DEMO_MODE: 'false',
        PORT: '3018',
        DATABASE_PATH: file,
        MASTER_BOOTSTRAP_KEY: 'v03-test-bootstrap-only',
        OPENAI_API_KEY: 'fixture-key-never-valid',
        OPENAI_MODEL: 'fixture-only',
        AI_TEST_MARKER: marker,
        AI_TEST_RELEASE: release,
      },
      stdio: 'pipe',
    },
  );
  child.stderr?.on('data', () => {});
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready);
  const boot = await call(
    '/bootstrap',
    {
      key: 'v03-test-bootstrap-only',
      name: 'QA MASTER',
      email: 'v03-master@example.com',
      password: 'test-master-password',
    },
    '',
  );
  master = boot.res.headers.get('set-cookie')!.split(';')[0];
  const invite = await call('/invitations', { label: 'QA 학생' }, master);
  const registered = await call(
    '/register',
    {
      key: invite.data.key,
      name: 'QA 학생',
      email: 'v03-student@example.com',
      password: 'test-student-password',
      appearance: defaultAppearance,
    },
    '',
  );
  student = registered.res.headers.get('set-cookie')!.split(';')[0];
  studentId = (await call('/state', undefined, student, 'GET')).data.me.id;
});
after(async () => {
  writeFileSync(release, 'release');
  const ended = new Promise((r) => child.once('exit', r));
  child.kill();
  await ended;
  rmSync(dir, { recursive: true, force: true });
});

test('stale project form is rejected and atomic task changes from two clients are preserved', async () => {
  const p = await create();
  const version = p.revision || 0;
  assert.equal(
    (
      await call(`/projects/${p.id}`, { title: '먼저 저장' }, student, 'PATCH', {
        'If-Match': `"${version}"`,
      })
    ).res.status,
    200,
  );
  assert.equal(
    (
      await call(`/projects/${p.id}`, { title: '오래된 탭' }, student, 'PATCH', {
        'If-Match': `"${version}"`,
      })
    ).res.status,
    409,
  );
  const added = await Promise.all(
    ['탭 A의 작업', '탭 B의 작업'].map((text) => call(`/projects/${p.id}/tasks`, { text })),
  );
  assert.deepEqual(
    added.map((v) => v.res.status),
    [201, 201],
  );
  const current = (await call('/state', undefined, student, 'GET')).data.projects.find(
    (v: any) => v.id === p.id,
  );
  assert.equal(current.title, '먼저 저장');
  assert.equal(current.tasks.length, 2);
  assert.equal(
    (await call(`/projects/${p.id}/tasks/${current.tasks[0].id}`, { done: true }, student, 'PATCH'))
      .res.status,
    200,
  );
  assert.equal(
    (await call(`/projects/${p.id}/tasks`, { text: '타 학생 작업' }, master)).res.status,
    403,
  );
});
test('malformed or disguised files are rejected without storing attachments', async () => {
  const p = await create();
  for (const file of [
    { fileName: 'bad.txt', content: '%%%bad-base64%%%' },
    { fileName: 'empty.txt', content: '' },
    { fileName: 'fake.png', content: Buffer.from('<script>alert(1)</script>').toString('base64') },
    { fileName: 'fake.pdf', content: Buffer.from('not a PDF').toString('base64') },
  ])
    assert.equal((await call(`/projects/${p.id}/attachments`, file)).res.status, 400);
});
test('attachment metadata failure rolls back the private file row', async () => {
  const p = await create();
  const db = new DatabaseSync(file);
  try {
    db.exec(
      `CREATE TRIGGER fail_project_save BEFORE UPDATE ON records WHEN OLD.id='${p.id}' BEGIN SELECT RAISE(ABORT,'qa failure'); END;`,
    );
    assert.equal(
      (
        await call(`/projects/${p.id}/attachments`, {
          fileName: 'note.txt',
          content: Buffer.from('private note').toString('base64'),
        })
      ).res.status,
      500,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM records WHERE kind='project-attachment' AND json_extract(body,'$.projectId')=?",
        )
        .get(p.id)!.n,
      0,
    );
  } finally {
    db.exec('DROP TRIGGER fail_project_save');
    db.close();
  }
});
test('failed project deletion retains attachment bytes and metadata atomically', async () => {
  const p = await create();
  const upload = await call(`/projects/${p.id}/attachments`, {
    fileName: 'note.txt',
    content: Buffer.from('must survive').toString('base64'),
  });
  const db = new DatabaseSync(file);
  try {
    db.exec(
      `CREATE TRIGGER fail_project_delete BEFORE DELETE ON records WHEN OLD.id='${p.id}' BEGIN SELECT RAISE(ABORT,'qa failure'); END;`,
    );
    assert.equal((await call(`/projects/${p.id}`, undefined, student, 'DELETE')).res.status, 500);
    assert.equal(
      (await call(`/projects/${p.id}/attachments/${upload.data.id}`, undefined, student, 'GET')).res
        .status,
      200,
    );
  } finally {
    db.exec('DROP TRIGGER fail_project_delete');
    db.close();
  }
});
test('failed feedback save cannot publish or persist a notification for unsaved feedback', async () => {
  const p = await create();
  const db = new DatabaseSync(file);
  const delivered: unknown[] = [];
  const socket = new WebSocket(base.replace('http', 'ws') + '/socket', {
    headers: { Cookie: student, Origin: base },
  });
  socket.on('message', (raw) => {
    const v = JSON.parse(raw.toString());
    if (v.type === 'personal-event') delivered.push(v);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const before = db.prepare("SELECT count(*) AS n FROM records WHERE kind='personal-event'").get()!
    .n;
  try {
    db.exec(
      `CREATE TRIGGER fail_feedback BEFORE UPDATE ON records WHEN OLD.id='${p.id}' BEGIN SELECT RAISE(ABORT,'qa feedback failure'); END;`,
    );
    assert.equal(
      (
        await call(
          `/projects/${p.id}/entries`,
          { type: 'feedback', text: '저장되지 않은 조언' },
          master,
        )
      ).res.status,
      500,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM records WHERE kind='personal-event'").get()!.n,
      before,
    );
    const current = (await call('/state', undefined, student, 'GET')).data.projects.find(
      (v: any) => v.id === p.id,
    );
    assert.equal(current.feedback.length, 0);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(delivered.length, 0, 'No uncommitted event may reach the socket');
  } finally {
    socket.terminate();
    db.exec('DROP TRIGGER fail_feedback');
    db.close();
  }
});
test('notification storage failure rolls back the corresponding feedback change', async () => {
  const p = await create();
  const db = new DatabaseSync(file);
  try {
    db.exec(
      `CREATE TRIGGER fail_notification BEFORE INSERT ON records WHEN NEW.kind='personal-event' BEGIN SELECT RAISE(ABORT,'qa notification failure'); END;`,
    );
    assert.equal(
      (
        await call(
          `/projects/${p.id}/entries`,
          { type: 'feedback', text: '알림과 함께 저장되어야 해요' },
          master,
        )
      ).res.status,
      500,
    );
    const current = (await call('/state', undefined, student, 'GET')).data.projects.find(
      (v: any) => v.id === p.id,
    );
    assert.equal(current.feedback.length, 0);
    assert.equal(current.revision, p.revision);
  } finally {
    db.exec('DROP TRIGGER fail_notification');
    db.close();
  }
});
async function pendingAI(projectId: string) {
  rmSync(marker, { force: true });
  rmSync(release, { force: true });
  const pending = call(`/projects/${projectId}/ai`, { text: '서버 응답 대기 검사' });
  for (let i = 0; i < 150 && !existsSync(marker); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(existsSync(marker));
  return { pending };
}
test('pending AI uses redacted context, rejects duplicate calls and preserves intervening project edits', async () => {
  const p = await create();
  await call(
    `/projects/${p.id}`,
    { purpose: '학생 메일 private-person@example.com, password: super-secret-value' },
    student,
    'PATCH',
  );
  const { pending } = await pendingAI(p.id);
  assert.equal((await call(`/projects/${p.id}/ai`, { text: '중복 질문' })).res.status, 429);
  await call(`/projects/${p.id}/tasks`, { text: '답변을 기다리며 저장한 작업' });
  const request = JSON.parse(readFileSync(marker, 'utf8'));
  assert.equal(request.store, false);
  assert.equal(request.max_output_tokens, 1200);
  assert.ok(!JSON.stringify(request).includes('private-person@example.com'));
  assert.ok(!JSON.stringify(request).includes('super-secret-value'));
  writeFileSync(release, 'SUCCESS');
  assert.equal((await pending).res.status, 200);
  const latest = (await call('/state', undefined, student, 'GET')).data.projects.find(
    (v: any) => v.id === p.id,
  );
  assert.equal(latest.tasks[0].text, '답변을 기다리며 저장한 작업');
  assert.match(latest.aiMessages.at(-1).text, /TEST STUB/);
});
test('provider quota failure is explained without pretending a mentor response succeeded', async () => {
  const p = await create();
  const { pending } = await pendingAI(p.id);
  writeFileSync(release, 'HTTP_429');
  const result = await pending;
  assert.equal(result.res.status, 502);
  assert.match(result.data.error, /사용 한도/);
  const latest = (await call('/state', undefined, student, 'GET')).data.projects.find(
    (v: any) => v.id === p.id,
  );
  assert.equal(latest.aiMessages.at(-1).role, 'error');
  assert.ok(!latest.aiMessages.some((v: any) => v.role === 'assistant'));
});
test('persisted daily AI cap blocks a provider call after twenty charged attempts', async () => {
  const p = await create();
  const db = new DatabaseSync(file),
    day = new Date().toISOString().slice(0, 10);
  try {
    db.prepare(
      'INSERT INTO ai_usage VALUES(?,?,20) ON CONFLICT(user_id,day) DO UPDATE SET count=20',
    ).run(studentId, day);
    const response = await call(`/projects/${p.id}/ai`, { text: '한도 초과 질문' });
    assert.equal(response.res.status, 429);
    assert.match(response.data.error, /20회/);
  } finally {
    db.prepare('UPDATE ai_usage SET count=0 WHERE user_id=? AND day=?').run(studentId, day);
    db.close();
  }
});
test('deleting a project while the provider is pending returns a conflict without resurrecting data', async () => {
  const p = await create();
  const { pending } = await pendingAI(p.id);
  try {
    assert.equal((await call(`/projects/${p.id}`, undefined, student, 'DELETE')).res.status, 200);
    writeFileSync(release, 'release');
    assert.equal((await pending).res.status, 409);
    assert.ok(
      !(await call('/state', undefined, student, 'GET')).data.projects.some(
        (v: any) => v.id === p.id,
      ),
    );
  } finally {
    writeFileSync(release, 'release');
    await pending;
  }
});
test('revoking membership while AI is pending blocks the late write and response', async () => {
  const p = await create();
  const { pending } = await pendingAI(p.id);
  try {
    assert.equal(
      (
        await call(
          `/members/${studentId}`,
          { status: 'REVOKED', reason: 'QA 권한 회수', releaseDesk: true },
          master,
          'PATCH',
        )
      ).res.status,
      200,
    );
    writeFileSync(release, 'release');
    assert.equal((await pending).res.status, 403);
    const current = (await call('/state', undefined, master, 'GET')).data.projects.find(
      (v: any) => v.id === p.id,
    );
    assert.equal(current.aiMessages.filter((v: any) => v.role === 'assistant').length, 0);
  } finally {
    writeFileSync(release, 'release');
    await pending;
    await call(
      `/members/${studentId}`,
      { status: 'ACTIVE', reason: 'QA 복원', releaseDesk: false },
      master,
      'PATCH',
    );
  }
});
