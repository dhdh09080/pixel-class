import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { defaultAppearance, emptyProject } from '../shared/types.js';
// @ts-expect-error Standalone Node recovery CLI deliberately has no TS declaration.
import { copyDatabase } from '../scripts/database.mjs';
import {
  competitionState,
  type Competition,
  type CompetitionEntry,
  type CompetitionIntro,
  type PublicCompetitionResponse,
} from '../shared/competitions.js';
import {
  competitionRanking,
  sanitizeCompetitionHtml,
  isPublicCompetitionRequest,
  publicCompetitionAsset,
} from '../server/competition-domain.js';
const directory = mkdtempSync(join(tmpdir(), 'pixel-competition-')),
  file = join(directory, 'school.sqlite'),
  base = 'http://127.0.0.1:3042';
let child: ChildProcess,
  master = '',
  student = '',
  second = '',
  other = '',
  studentId = '',
  secondId = '',
  classId = '',
  projectId = '',
  secondProjectId = '';
async function request(path: string, method = 'GET', body?: unknown, cookie = master) {
  return fetch(base + '/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Pixel-Class': '1',
      Origin: base,
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function json<T = any>(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = master,
): Promise<T> {
  const r = await request(path, method, body, cookie);
  const data = await r.json();
  assert.ok(r.ok, `${method} ${path}: ${r.status} ${JSON.stringify(data)}`);
  return data;
}
async function start() {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: '3042',
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DEMO_MODE: 'false',
      DATABASE_PATH: file,
      MASTER_BOOTSTRAP_KEY: 'competition-test-bootstrap',
      AUTO_BACKUP: 'false',
      PIXEL_RUNTIME: '',
      RAILWAY_PROJECT_ID: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail('Competition test server failed to start');
}
async function stop() {
  if (child?.exitCode === null) {
    const ended = once(child, 'exit');
    child.kill('SIGTERM');
    await ended;
  }
}
function fixture<T>(fn: (db: DatabaseSync) => T) {
  const db = new DatabaseSync(file);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
function shift(c: Competition, values: Partial<Competition>) {
  return fixture((db) => {
    const row = db
      .prepare("SELECT body FROM records WHERE id=? AND kind='competition'")
      .get(c.id) as { body: string };
    const next = { ...JSON.parse(row.body), ...values };
    db.prepare('UPDATE records SET body=? WHERE id=?').run(JSON.stringify(next), c.id);
    return next as Competition;
  });
}
function judging(c: Competition) {
  return shift(c, {
    submissionDueAt: new Date(Date.now() - 2000).toISOString(),
    judgingStartsAt: new Date(Date.now() - 1000).toISOString(),
  });
}
const intro: CompetitionIntro = {
  serviceName: '현장 기록 도우미',
  purpose: '기록 시간을 줄여요',
  problem: '수기 기록',
  audience: '현장 팀원',
  features: 'AI 요약',
  usage: '기록을 입력하세요',
  examples: '',
  aiTools: 'Codex',
  development: '직접 개발',
  screenshots: '',
  effect: '시간 절약',
  nextSteps: '모바일 개선',
};
function config(overrides = {}) {
  const t = Date.now();
  return {
    name: '우리 반 AI 경진대회',
    description: '서로 배우는 작품 발표',
    classId,
    opensAt: new Date(t - 10000).toISOString(),
    submissionDueAt: new Date(t + 3600000).toISOString(),
    judgingStartsAt: new Date(t + 7200000).toISOString(),
    judgingEndsAt: new Date(t + 10800000).toISOString(),
    resultsAt: new Date(t + 14400000).toISOString(),
    participantIds: [studentId, secondId],
    ...overrides,
  };
}
async function contest(overrides = {}) {
  const c = await json<Competition>('/competitions', 'POST', config(overrides));
  await json(`/competitions/${c.id}/action`, 'POST', { action: 'publish' });
  return c;
}
async function submit(c: Competition, cookie = student, overrides = {}) {
  return json<CompetitionEntry>(
    `/competitions/${c.id}/entry`,
    'PUT',
    {
      projectId,
      title: '공개 작품',
      displayName: '학생 별명',
      serviceUrl: 'https://example.com/service',
      consentPublic: true,
      intro,
      expectedRevision: 0,
      ...overrides,
    },
    cookie,
  );
}
async function activate(c: Competition, entryIds?: string[]) {
  const pass = await json(`/competitions/${c.id}/judge-passes`, 'POST', {
    label: '외부 심사위원',
    entryIds,
  });
  const r = await request(
    `/public/competitions/${c.id}/judge-session`,
    'POST',
    { key: pass.key },
    '',
  );
  assert.equal(r.status, 200);
  return { cookie: r.headers.get('set-cookie')!.split(';')[0], ...pass };
}
const score = {
  practicality: 30,
  usability: 25,
  completeness: 18,
  creativity: 12,
  comment: '편리하고 이해하기 쉬워요',
  idempotencyKey: 'request_1234567890abcdef',
};
before(async () => {
  await start();
  const boot = await request(
    '/bootstrap',
    'POST',
    {
      key: 'competition-test-bootstrap',
      email: 'competition-master@example.com',
      name: '비공개 MASTER 이름',
      password: 'competition-master-password',
    },
    '',
  );
  assert.equal(boot.status, 200);
  master = boot.headers.get('set-cookie')!.split(';')[0];
  for (const n of [1, 2]) {
    const invite = await json('/invitations', 'POST', { label: '대회 테스트' });
    const r = await request(
      '/register',
      'POST',
      {
        key: invite.key,
        email: `competition-student${n}@example.com`,
        name: `비공개 학생 이름${n}`,
        password: 'competition-student-password',
        appearance: defaultAppearance,
      },
      '',
    );
    assert.equal(r.status, 201);
    const cookie = r.headers.get('set-cookie')!.split(';')[0];
    const state = await json('/state', 'GET', undefined, cookie),
      p = await json(
        '/projects',
        'POST',
        {
          ...emptyProject(),
          title: `내부 프로젝트${n}`,
          purpose: 'PRIVATE-PROJECT-NOTE',
          isPublic: false,
        },
        cookie,
      );
    if (n === 1) {
      student = cookie;
      studentId = state.me.id;
      projectId = p.id;
    } else {
      second = cookie;
      secondId = state.me.id;
      secondProjectId = p.id;
    }
  }
  classId = (await json('/competitions')).activeClassId;
  const token = randomBytes(32).toString('hex');
  fixture((db) => {
    const m = {
      id: 'other-competition-master',
      schoolId: 'other-school',
      role: 'MASTER',
      status: 'ACTIVE',
      name: '다른 학교 비밀',
      appearance: defaultAppearance,
    };
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
      m.id,
      m.schoolId,
      'other-competition@example.com',
      'unused',
      JSON.stringify(m),
    );
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
      createHash('sha256').update(token).digest('hex'),
      m.id,
      Date.now() + 1000000,
    );
  });
  other = 'pixel_session=' + token;
});
after(async () => {
  await stop();
  rmSync(directory, { recursive: true, force: true });
});

test('eight competition phases use authoritative instant boundaries', () => {
  const c = {
    published: true,
    archived: false,
    resultsPublished: false,
    opensAt: '2026-01-01T00:00:00Z',
    submissionDueAt: '2026-01-02T00:00:00Z',
    judgingStartsAt: '2026-01-03T00:00:00Z',
    judgingEndsAt: '2026-01-04T00:00:00Z',
  };
  for (const [time, state] of [
    ['2025-12-31', 'UPCOMING'],
    ['2026-01-01', 'SUBMISSION_OPEN'],
    ['2026-01-02', 'SUBMISSION_CLOSED'],
    ['2026-01-03', 'JUDGING'],
    ['2026-01-04', 'JUDGING_CLOSED'],
  ])
    assert.equal(competitionState(c, Date.parse(time)), state);
  assert.equal(competitionState({ ...c, published: false }), 'DRAFT');
  assert.equal(competitionState({ ...c, resultsPublished: true }), 'RESULTS_PUBLISHED');
  assert.equal(competitionState({ ...c, archived: true }), 'ARCHIVED');
});
test('HTML parser removes scripts, malformed active tags, remote URLs, CSS and attributes', () => {
  const html = sanitizeCompetitionHtml(
    '<h1 onclick="alert(1)">소개</h1><script>SECRET_SCRIPT</script><style>body{color:red}</style><img src="https://evil.test/track"><svg><a xlink:href="javascript:evil()">x</a></svg><iframe srcdoc="x"></iframe><form action="/api/bootstrap"><input></form><p style="background:url(https://evil.test)">내용</p><a href="javascript:alert(1)">안내</a>',
  );
  assert.ok(html.includes('<h1>소개</h1>'));
  assert.ok(html.includes('<p>내용</p>'));
  assert.doesNotMatch(
    html,
    /script|style|onclick|evil\.test|iframe|form|input|src|href|svg|SECRET_SCRIPT/i,
  );
});
test('ranking averages instead of sums, breaks ties by criteria, and flags insufficient judges', () => {
  const entries = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id, displayName: id }));
  const scores = [
    { entryId: 'a', practicality: 35, usability: 20, completeness: 15, creativity: 10 },
    { entryId: 'b', practicality: 30, usability: 25, completeness: 15, creativity: 10 },
    { entryId: 'b', practicality: 30, usability: 25, completeness: 15, creativity: 10 },
    { entryId: 'c', practicality: 35, usability: 20, completeness: 15, creativity: 10 },
  ];
  const result = competitionRanking(entries, scores, 1, ['대상', '최우수상', '우수상']);
  assert.deepEqual(
    result.map((r) => [r.entryId, r.rank, r.average]),
    [
      ['a', 1, 80],
      ['c', 1, 80],
      ['b', 3, 80],
      ['d', null, 0],
    ],
  );
  assert.equal(result[3].eligible, false);
  assert.equal(competitionRanking(entries, scores, 2, [])[0].entryId, 'b');
});
test('anonymous entrance exceptions cannot widen to account APIs, path suffixes or mutations', () => {
  const id = '11111111-2222-3333-4444-555555555555',
    route = '/api/public/competitions/' + id;
  assert.ok(isPublicCompetitionRequest('GET', '/competition/' + id));
  assert.ok(isPublicCompetitionRequest('GET', route));
  assert.ok(isPublicCompetitionRequest('POST', route + '/judge-session'));
  for (const path of [
    '/api/state',
    '/api/bootstrap',
    route + '/../../state',
    route + '/project',
    '/competition/' + id + '/private',
    '/competition-assets/../../data/school.sqlite',
    '/assets/index.js',
  ])
    assert.equal(isPublicCompetitionRequest('GET', path), false);
  assert.equal(isPublicCompetitionRequest('POST', route), false);
  assert.equal(isPublicCompetitionRequest('GET', route + '/judge-session'), false);
});
test('classes are persisted, legacy members have a default, and students/foreign masters cannot administer', async () => {
  const before = await json('/competitions');
  assert.ok(before.classes.some((c: any) => c.id === classId && c.memberIds.includes(studentId)));
  assert.equal((await request('/classes', 'POST', { name: '탈취반' }, student)).status, 403);
  const own = await json('/classes', 'POST', { name: '실습 2반' });
  assert.equal(
    (await request(`/classes/${own.id}/members`, 'PATCH', { memberIds: [studentId] }, other))
      .status,
    404,
  );
  await json(`/classes/${own.id}/members`, 'PATCH', { memberIds: [secondId] });
  const state = await json('/state', 'GET', undefined, second);
  assert.equal(state.me.classId, own.id);
  assert.equal(
    (await request('/competitions', 'POST', config({ participantIds: [secondId] }))).status,
    400,
  );
  const c = await contest({ participantIds: [studentId] });
  assert.equal((await request(`/competitions/${c.id}`, 'GET', undefined, second)).status, 404);
  assert.equal((await request(`/competitions/${c.id}`, 'GET', undefined, other)).status, 404);
  await json(`/classes/${own.id}/members`, 'PATCH', { memberIds: [] });
  assert.equal((await json('/state', 'GET', undefined, second)).me.classId, classId);
});
test('draft competitions are hidden, schedules validated, and students cannot publish', async () => {
  assert.equal((await request('/competitions', 'POST', config(), student)).status, 403);
  assert.equal(
    (
      await request(
        '/competitions',
        'POST',
        config({ judgingStartsAt: new Date(Date.now() - 20000).toISOString() }),
      )
    ).status,
    400,
  );
  const c = await json<Competition>('/competitions', 'POST', config());
  assert.equal((await request(`/competitions/${c.id}`, 'GET', undefined, student)).status, 404);
  assert.equal(
    (await request(`/public/competitions/${c.id}`, 'GET', undefined, master)).status,
    404,
  );
  assert.equal(
    (await request(`/competitions/${c.id}/action`, 'POST', { action: 'publish' }, student)).status,
    403,
  );
});
test('a never-published draft with old dates can be repaired and safely published', async () => {
  const t = Date.now() - 86400000;
  const c = await json<Competition>(
    '/competitions',
    'POST',
    config({
      opensAt: new Date(t).toISOString(),
      submissionDueAt: new Date(t + 1000).toISOString(),
      judgingStartsAt: new Date(t + 2000).toISOString(),
      judgingEndsAt: new Date(t + 3000).toISOString(),
      resultsAt: new Date(t + 4000).toISOString(),
    }),
  );
  await json(`/competitions/${c.id}`);
  assert.equal(
    (await request(`/competitions/${c.id}/action`, 'POST', { action: 'publish' })).status,
    409,
  );
  const repaired = await json<Competition>(`/competitions/${c.id}`, 'PATCH', {
    ...config(),
    revision: c.revision,
  });
  assert.equal(repaired.state, 'DRAFT');
  assert.equal(
    (await json<Competition>(`/competitions/${c.id}/action`, 'POST', { action: 'publish' })).state,
    'SUBMISSION_OPEN',
  );
});
test('publishing revalidates a draft participant whose class changed', async () => {
  const invite = await json('/invitations', 'POST', { label: '반 변경 검증' });
  const r = await request(
    '/register',
    'POST',
    {
      key: invite.key,
      email: 'competition-remap@example.com',
      name: '반 이동 학생',
      password: 'competition-student-password',
      appearance: defaultAppearance,
    },
    '',
  );
  assert.equal(r.status, 201);
  const cookie = r.headers.get('set-cookie')!.split(';')[0],
    person = (await json('/state', 'GET', undefined, cookie)).me;
  const c = await json<Competition>(
    '/competitions',
    'POST',
    config({ participantIds: [person.id] }),
  );
  const target = await json('/classes', 'POST', { name: '이동할 반' });
  await json(`/classes/${target.id}/members`, 'PATCH', { memberIds: [person.id] });
  assert.equal(
    (await request(`/competitions/${c.id}/action`, 'POST', { action: 'publish' })).status,
    400,
  );
  assert.equal(
    (
      await json<Competition>(`/competitions/${c.id}`, 'PATCH', {
        revision: c.revision,
        classId: target.id,
      })
    ).classId,
    target.id,
  );
  assert.equal(
    (await request(`/competitions/${c.id}/action`, 'POST', { action: 'publish' })).status,
    200,
  );
});
test('HTML introduction remains available when artifact types exclude HTML', async () => {
  const c = await contest({ allowedFileTypes: ['pdf'] });
  const e = await submit(c, student, {
    intro: undefined,
    introFile: {
      fileName: '소개.html',
      base64: Buffer.from('<h1>서비스 소개</h1><p>사용 안내</p>').toString('base64'),
    },
  });
  assert.ok(e.introFile);
  assert.equal(e.introFile!.mime, 'text/html');
});

test('submission checks ownership, class participation, required deliverables and optimistic revisions', async () => {
  const c = await contest();
  assert.equal(
    (
      await request(
        `/competitions/${c.id}/entry`,
        'PUT',
        {
          projectId: secondProjectId,
          title: '탈취',
          displayName: '별명',
          consentPublic: true,
          intro,
          serviceUrl: 'https://example.com',
        },
        student,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/competitions/${c.id}/entry`,
        'PUT',
        { projectId, title: '미완성', displayName: '별명', intro },
        student,
      )
    ).status,
    400,
  );
  const e = await submit(c);
  assert.equal(e.status, 'SUBMITTED');
  assert.equal(e.revision, 1);
  const stale = await request(
    `/competitions/${c.id}/entry`,
    'PUT',
    {
      projectId,
      title: '덮어쓰기',
      displayName: '별명',
      consentPublic: true,
      intro,
      serviceUrl: 'https://example.com',
      expectedRevision: 0,
    },
    student,
  );
  assert.equal(stale.status, 409);
  const secondEntry = await submit(c, student, { title: '수정된 작품', expectedRevision: 1 });
  assert.equal(secondEntry.revision, 2);
  const versions = await json<CompetitionEntry[]>(
    `/competitions/${c.id}/entries/${e.id}/versions`,
    'GET',
    undefined,
    student,
  );
  assert.equal(versions.length, 2);
  assert.equal(versions[0].title, '공개 작품');
  assert.equal(
    (await request(`/competitions/${c.id}/entries/${e.id}/versions`, 'GET', undefined, second))
      .status,
    404,
  );
});
test('HTML originals remain separate, malicious previews are static, and files require scoped access', async () => {
  const c = await contest(),
    source =
      '<h1>작품 소개</h1><script>stealCookie()</script><img src="https://evil.test"><p>사용 방법</p>';
  const e = await submit(c, student, {
    intro: undefined,
    introFile: { fileName: '소개서.html', base64: Buffer.from(source).toString('base64') },
    artifact: { fileName: '결과물.txt', base64: Buffer.from('보존할 결과물').toString('base64') },
  });
  assert.ok(e.introFile && e.artifact);
  assert.doesNotMatch(e.introHtml, /script|evil|img|stealCookie/i);
  const f = await request(e.introFile!.downloadUrl.replace('/api', ''), 'GET', undefined, student);
  assert.equal(f.status, 200);
  assert.equal(await f.text(), source);
  assert.match(f.headers.get('content-disposition')!, /^attachment/);
  assert.equal(f.headers.get('content-type'), 'application/octet-stream');
  assert.equal(
    (await request(e.artifact!.downloadUrl.replace('/api', ''), 'GET', undefined, second)).status,
    404,
  );
  const publicFile = `/public/competitions/${c.id}/entries/${e.id}/files/${e.artifact!.id}`;
  assert.equal((await request(publicFile, 'GET', undefined, master)).status, 404);
  const judge = await activate(c, [e.id]);
  assert.equal((await request(publicFile, 'GET', undefined, judge.cookie)).status, 200);
  assert.equal((await request(publicFile, 'GET', undefined, other)).status, 404);
});
test('file signatures, path traversal, executable defaults and bad URLs fail without partial records', async () => {
  const c = await contest();
  for (const [fileName, data] of [
    ['attack.png', 'not PNG'],
    ['../secret.txt', 'text'],
    ['program.exe', 'MZprogram'],
  ]) {
    const r = await request(
      `/competitions/${c.id}/entry`,
      'PUT',
      {
        projectId,
        title: '파일 검증',
        displayName: '별명',
        intro,
        artifact: { fileName, base64: Buffer.from(data).toString('base64') },
      },
      student,
    );
    assert.equal(r.status, 400);
  }
  assert.equal(
    (
      await request(
        `/competitions/${c.id}/entry`,
        'PUT',
        {
          projectId,
          title: '주소 검증',
          displayName: '별명',
          intro,
          serviceUrl: 'javascript:alert(1)',
        },
        student,
      )
    ).status,
    400,
  );
  assert.equal((await json(`/competitions/${c.id}`, 'GET', undefined, student)).myEntry, null);
  assert.equal(
    fixture(
      (db) =>
        (
          db
            .prepare(
              "SELECT count(*) n FROM records WHERE kind='competition-file' AND json_extract(body,'$.competitionId')=?",
            )
            .get(c.id) as { n: number }
        ).n,
    ),
    0,
  );
});
test('judge-only is default and public previews ignore even a MASTER login cookie', async () => {
  const c = await contest(),
    e = await submit(c);
  const publicView = await json<PublicCompetitionResponse>(
    `/public/competitions/${c.id}`,
    'GET',
    undefined,
    master,
  );
  assert.equal(publicView.entries.length, 0);
  assert.equal(publicView.judge, undefined);
  assert.equal(publicView.results, undefined);
  const judge = await activate(c),
    view = await json<PublicCompetitionResponse>(
      `/public/competitions/${c.id}`,
      'GET',
      undefined,
      judge.cookie,
    ),
    serialized = JSON.stringify(view);
  assert.equal(view.entries[0].id, e.id);
  assert.equal(view.entries[0].displayName, '학생 별명');
  for (const privateValue of [
    'competition-student1@example.com',
    '비공개 학생 이름1',
    'PRIVATE-PROJECT-NOTE',
    'projectSnapshot',
    'ownerId',
    'studentId',
    'participantIds',
    'schoolId',
  ])
    assert.ok(!serialized.includes(privateValue), privateValue);
  assert.equal((await request('/state', 'GET', undefined, judge.cookie)).status, 401);
});
test('PUBLIC exhibition requires explicit per-entry consent and never exposes original HTML anonymously', async () => {
  const c = await contest({ visibility: 'PUBLIC' });
  const e = await submit(c, student, { consentPublic: false, submit: false });
  assert.equal(
    (await json<PublicCompetitionResponse>(`/public/competitions/${c.id}`, 'GET', undefined, ''))
      .entries.length,
    0,
  );
  await submit(c, student, { consentPublic: true, expectedRevision: 1 });
  const view = await json<PublicCompetitionResponse>(
    `/public/competitions/${c.id}`,
    'GET',
    undefined,
    '',
  );
  assert.equal(view.entries[0].id, e.id);
  assert.equal(view.entries[0].studentId, undefined);
  assert.equal(view.entries[0].projectSnapshot, undefined);
});
test('later audience or real-name changes cannot broaden an existing submission consent', async () => {
  const c = await contest(),
    e = await submit(c);
  const detail = await json(`/competitions/${c.id}`);
  await json(`/competitions/${c.id}`, 'PATCH', {
    revision: detail.competition.revision,
    visibility: 'PUBLIC',
    allowRealNames: true,
  });
  assert.deepEqual(
    (await json<PublicCompetitionResponse>(`/public/competitions/${c.id}`, 'GET', undefined, ''))
      .entries,
    [],
  );
  const judge = await activate(c);
  assert.equal(
    (
      await json<PublicCompetitionResponse>(
        `/public/competitions/${c.id}`,
        'GET',
        undefined,
        judge.cookie,
      )
    ).entries[0].displayName,
    '학생 별명',
  );
  const updated = await submit(c, student, { expectedRevision: e.revision });
  assert.equal(
    (await json<PublicCompetitionResponse>(`/public/competitions/${c.id}`, 'GET', undefined, ''))
      .entries[0].displayName,
    '비공개 학생 이름1',
  );
  assert.equal(updated.revision, 2);
});

test('one-time KEY activation is atomic, hashes secrets, and revocation invalidates the independent session', async () => {
  const c = await contest();
  await submit(c);
  const pass = await json(`/competitions/${c.id}/judge-passes`, 'POST', { label: '한 번만 사용' });
  const responses = await Promise.all(
    [1, 2].map(() =>
      request(`/public/competitions/${c.id}/judge-session`, 'POST', { key: pass.key }, ''),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 403]);
  const successful = responses.find((r) => r.ok)!,
    cookie = successful.headers.get('set-cookie')!.split(';')[0];
  assert.match(successful.headers.get('set-cookie')!, /HttpOnly/);
  assert.match(successful.headers.get('set-cookie')!, /SameSite=Strict/);
  const stored = fixture(
    (db) =>
      db.prepare('SELECT key_hash FROM competition_judge_passes WHERE id=?').get(pass.pass.id) as {
        key_hash: string;
      },
  );
  assert.notEqual(stored.key_hash, pass.key);
  assert.equal(stored.key_hash, createHash('sha256').update(pass.key).digest('hex'));
  await json(`/competitions/${c.id}/judge-passes/${pass.pass.id}`, 'DELETE');
  assert.equal(
    (
      await json<PublicCompetitionResponse>(
        `/public/competitions/${c.id}`,
        'GET',
        undefined,
        cookie,
      )
    ).judge,
    undefined,
  );
});
test('expired and wrong-contest judge keys never activate', async () => {
  const c = await contest(),
    otherContest = await contest();
  const pass = await json(`/competitions/${c.id}/judge-passes`, 'POST', { label: '만료 확인' });
  assert.equal(
    (
      await request(
        `/public/competitions/${otherContest.id}/judge-session`,
        'POST',
        { key: pass.key },
        '',
      )
    ).status,
    403,
  );
  fixture((db) =>
    db
      .prepare('UPDATE competition_judge_passes SET expires_at=? WHERE id=?')
      .run(Date.now() - 1, pass.pass.id),
  );
  assert.equal(
    (await request(`/public/competitions/${c.id}/judge-session`, 'POST', { key: pass.key }, ''))
      .status,
    403,
  );
});
test('server deadlines deny late writes; teacher extension is bounded before judging and final snapshot stays fixed', async () => {
  const c = await contest(),
    e = await submit(c);
  shift(c, { submissionDueAt: new Date(Date.now() - 500).toISOString() });
  assert.equal(
    (
      await request(
        `/competitions/${c.id}/entry`,
        'PUT',
        {
          projectId,
          title: '늦은 수정',
          displayName: '별명',
          intro,
          serviceUrl: 'https://example.com',
          expectedRevision: 1,
        },
        student,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/competitions/${c.id}/extensions`, 'POST', {
        studentId,
        dueAt: c.judgingEndsAt,
        reason: '늦은 기한',
      })
    ).status,
    400,
  );
  await json(`/competitions/${c.id}/extensions`, 'POST', {
    studentId,
    dueAt: new Date(Date.now() + 60000).toISOString(),
    reason: '개별 연장',
  });
  assert.equal(
    (await json(`/competitions/${c.id}`, 'GET', undefined, student)).extensions[0].reason,
    '개별 연장',
  );
  assert.deepEqual((await json(`/competitions/${c.id}`, 'GET', undefined, second)).extensions, []);
  await submit(c, student, { title: '연장 후 제출', expectedRevision: 1 });
  judging(c);
  const judge = await activate(c),
    frozen = await json<PublicCompetitionResponse>(
      `/public/competitions/${c.id}`,
      'GET',
      undefined,
      judge.cookie,
    );
  assert.equal(frozen.entries[0].title, '연장 후 제출');
  assert.equal(
    (await request(`/competitions/${c.id}/withdraw`, 'POST', { expectedRevision: 2 }, student))
      .status,
    409,
  );
  assert.equal(
    (
      await request(`/competitions/${c.id}/extensions`, 'POST', {
        studentId,
        dueAt: new Date(Date.now() + 60000).toISOString(),
        reason: '심사 후 연장',
      })
    ).status,
    409,
  );
  fixture((db) => {
    const row = db.prepare('SELECT body FROM records WHERE id=?').get(e.id) as { body: string };
    const tamper = { ...JSON.parse(row.body), title: '외부 수정 시뮬레이션' };
    db.prepare('UPDATE records SET body=? WHERE id=?').run(JSON.stringify(tamper), e.id);
  });
  assert.equal(
    (
      await json<PublicCompetitionResponse>(
        `/public/competitions/${c.id}`,
        'GET',
        undefined,
        judge.cookie,
      )
    ).entries[0].title,
    '연장 후 제출',
  );
});
test('scores require an eligible scoped judge, valid integer weights and the judging period', async () => {
  const c = await contest(),
    e = await submit(c),
    secondEntry = await submit(c, second, { projectId: secondProjectId, displayName: '다른 별명' });
  const judge = await activate(c, [e.id]),
    path = `/public/competitions/${c.id}/entries/${e.id}/scores`;
  assert.equal((await request(path, 'POST', score, master)).status, 401);
  assert.equal((await request(path, 'POST', score, judge.cookie)).status, 409);
  judging(c);
  assert.equal(
    (await request(path, 'POST', { ...score, practicality: 36 }, judge.cookie)).status,
    400,
  );
  assert.equal(
    (await request(path, 'POST', { ...score, usability: 1.5 }, judge.cookie)).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/public/competitions/${c.id}/entries/${secondEntry.id}/scores`,
        'POST',
        score,
        judge.cookie,
      )
    ).status,
    404,
  );
  const r = await json(path, 'POST', score, judge.cookie);
  assert.equal(r.score.total, 85);
  assert.equal(
    (
      await json<PublicCompetitionResponse>(
        `/public/competitions/${c.id}`,
        'GET',
        undefined,
        judge.cookie,
      )
    ).results,
    undefined,
  );
  assert.equal((await json(`/competitions/${c.id}`, 'GET', undefined, student)).results, undefined);
});
test('duplicate score concurrency and retry idempotency preserve exactly one immutable score', async () => {
  const c = await contest(),
    e = await submit(c);
  judging(c);
  const judge = await activate(c),
    path = `/public/competitions/${c.id}/entries/${e.id}/scores`;
  const results = await Promise.all([
    request(path, 'POST', score, judge.cookie),
    request(
      path,
      'POST',
      { ...score, idempotencyKey: 'different_request_123456789' },
      judge.cookie,
    ),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const stored = fixture(
    (db) =>
      db
        .prepare(
          'SELECT idempotency_key FROM competition_scores WHERE competition_id=? AND judge_id=?',
        )
        .all(c.id, judge.pass.id) as { idempotency_key: string }[],
  );
  assert.equal(stored.length, 1);
  assert.equal(
    (
      await request(
        path,
        'POST',
        { ...score, idempotencyKey: stored[0].idempotency_key },
        judge.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        path,
        'POST',
        { ...score, creativity: 1, idempotencyKey: stored[0].idempotency_key },
        judge.cookie,
      )
    ).status,
    409,
  );
});
test('MASTER explicitly publishes results only after judging; private rankings stay scoped', async () => {
  const c = await contest({ visibility: 'PUBLIC' }),
    e = await submit(c, student, { consentPublic: true });
  judging(c);
  const judge = await activate(c);
  await json(`/public/competitions/${c.id}/entries/${e.id}/scores`, 'POST', score, judge.cookie);
  assert.equal(
    (await request(`/competitions/${c.id}/action`, 'POST', { action: 'publishResults' })).status,
    409,
  );
  assert.equal(
    (await request(`/competitions/${c.id}`, 'PATCH', { revision: c.revision + 1, minJudges: 2 }))
      .status,
    409,
  );
  shift(c, {
    judgingEndsAt: new Date(Date.now() - 500).toISOString(),
    resultsAt: new Date(Date.now() - 100).toISOString(),
  });
  await json(`/competitions/${c.id}/action`, 'POST', { action: 'publishResults' });
  const publicView = await json<PublicCompetitionResponse>(
    `/public/competitions/${c.id}`,
    'GET',
    undefined,
    '',
  );
  assert.equal(publicView.results![0].average, 85);
  assert.equal(publicView.results![0].rank, 1);
  assert.equal(publicView.competition.state, 'RESULTS_PUBLISHED');
  assert.ok(!JSON.stringify(publicView.results).includes(judge.pass.id));
  assert.equal(
    (await request(`/competitions/${c.id}/action`, 'POST', { action: 'retractResults' })).status,
    400,
  );
  await json(`/competitions/${c.id}/action`, 'POST', {
    action: 'retractResults',
    reason: '공지 수정',
  });
  assert.equal(
    (await json<PublicCompetitionResponse>(`/public/competitions/${c.id}`, 'GET', undefined, ''))
      .results,
    undefined,
  );
});
test('judge-only published results remain readable with a scoped session after scoring closes', async () => {
  const c = await contest(),
    e = await submit(c);
  judging(c);
  const judge = await activate(c);
  await json(`/public/competitions/${c.id}/entries/${e.id}/scores`, 'POST', score, judge.cookie);
  shift(c, {
    judgingEndsAt: new Date(Date.now() - 2000).toISOString(),
    resultsAt: new Date(Date.now() - 1000).toISOString(),
  });
  await json(`/competitions/${c.id}/action`, 'POST', { action: 'publishResults' });
  const view = await json<PublicCompetitionResponse>(
    `/public/competitions/${c.id}`,
    'GET',
    undefined,
    judge.cookie,
  );
  assert.ok(view.judge);
  assert.equal(view.results![0].average, 85);
  const anonymous = await json<PublicCompetitionResponse>(
    `/public/competitions/${c.id}`,
    'GET',
    undefined,
    '',
  );
  assert.deepEqual(anonymous.entries, []);
  assert.deepEqual(anonymous.results, []);
  assert.equal(
    (
      await request(
        `/public/competitions/${c.id}/entries/${e.id}/scores`,
        'POST',
        { ...score, idempotencyKey: 'after_close_request_1234' },
        judge.cookie,
      )
    ).status,
    409,
  );
});

test('competition files count toward shared quota and failed uploads preserve prior versions', async () => {
  const c = await contest(),
    e = await submit(c),
    before = await json('/operations');
  const f = await submit(c, student, {
    expectedRevision: 1,
    artifact: { fileName: '자료.txt', base64: Buffer.from('quota-check').toString('base64') },
  });
  assert.ok(f.artifact);
  assert.ok((await json('/operations')).usedBytes > before.usedBytes);
  assert.equal(
    (await json(`/competitions/${c.id}/entries/${e.id}/versions`, 'GET', undefined, student))
      .length,
    2,
  );
});
test('school exports keep own competition scores, remove foreign scores and strip all judge credentials', async () => {
  const c = await contest(),
    e = await submit(c);
  judging(c);
  const judge = await activate(c);
  await json(`/public/competitions/${c.id}/entries/${e.id}/scores`, 'POST', score, judge.cookie);
  fixture((db) =>
    db
      .prepare('INSERT INTO competition_scores VALUES(?,?,?,?,?,?,?,?,?)')
      .run(
        'foreign-score',
        'other-school',
        'foreign-contest',
        'foreign-judge',
        'foreign-entry',
        'foreign-idempotency',
        'hash',
        JSON.stringify({ ...score, comment: 'FOREIGN-COMPETITION-SECRET' }),
        new Date().toISOString(),
      ),
  );
  const r = await request('/operations/backup');
  assert.equal(r.status, 200);
  const bytes = Buffer.from(await r.arrayBuffer());
  const exported = join(directory, 'export.sqlite');
  writeFileSync(exported, bytes);
  assert.ok(!bytes.includes(Buffer.from('FOREIGN-COMPETITION-SECRET')));
  const db = new DatabaseSync(exported);
  try {
    assert.equal(
      (db.prepare('SELECT count(*) n FROM competition_judge_sessions').get() as { n: number }).n,
      0,
    );
    assert.equal(
      (db.prepare('SELECT count(*) n FROM competition_judge_passes').get() as { n: number }).n,
      0,
    );
    assert.ok(
      (
        db
          .prepare('SELECT count(*) n FROM competition_scores WHERE competition_id=?')
          .get(c.id) as { n: number }
      ).n > 0,
    );
    assert.equal(
      (
        db
          .prepare("SELECT count(*) n FROM competition_scores WHERE school_id='other-school'")
          .get() as { n: number }
      ).n,
      0,
    );
  } finally {
    db.close();
  }
});

test('public Vite dependency maps and CSS stay on the narrow public asset prefix', () => {
  const source =
    'const d=["assets/Competitions.js","assets/PublicCompetition.js"]; import("./chunk.js"); const css="/assets/app.css";';
  assert.equal(
    publicCompetitionAsset(source),
    'const d=["/competition-assets/Competitions.js","/competition-assets/PublicCompetition.js"]; import("./chunk.js"); const css="/competition-assets/app.css";',
  );
  assert.equal(
    publicCompetitionAsset('url(/assets/font.woff2)'),
    'url(/competition-assets/font.woff2)',
  );
  assert.equal(
    publicCompetitionAsset('"/competition-assets/already.js"'),
    '"/competition-assets/already.js"',
  );
});
test('API final submission requires explicit audience consent while drafts preserve refusal', async () => {
  const c = await contest();
  assert.equal(
    (
      await request(
        `/competitions/${c.id}/entry`,
        'PUT',
        {
          projectId,
          title: '동의 전',
          displayName: '별명',
          serviceUrl: 'https://example.com',
          intro,
          consentPublic: false,
        },
        student,
      )
    ).status,
    400,
  );
  const draft = await submit(c, student, { submit: false, consentPublic: false });
  assert.equal(draft.status, 'DRAFT');
  const judge = await activate(c);
  assert.deepEqual(
    (
      await json<PublicCompetitionResponse>(
        `/public/competitions/${c.id}`,
        'GET',
        undefined,
        judge.cookie,
      )
    ).entries,
    [],
  );
});
test('PUBLIC consent never grants out-of-scope judges an original HTML download', async () => {
  const c = await contest({ visibility: 'PUBLIC' }),
    e = await submit(c, student, {
      intro: undefined,
      introFile: {
        fileName: '소개.html',
        base64: Buffer.from('<h1>안전 소개</h1>').toString('base64'),
      },
      artifact: { fileName: '결과.txt', base64: Buffer.from('공개 결과').toString('base64') },
    });
  const otherEntry = await submit(c, second, { projectId: secondProjectId });
  const judge = await activate(c, [otherEntry.id]);
  assert.equal(
    (
      await request(
        `/public/competitions/${c.id}/entries/${e.id}/files/${e.introFile!.id}`,
        'GET',
        undefined,
        judge.cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/public/competitions/${c.id}/entries/${e.id}/files/${e.artifact!.id}`,
        'GET',
        undefined,
        judge.cookie,
      )
    ).status,
    200,
  );
});

test('thirty valid judges behind one school NAT can activate independent scoped sessions', async () => {
  const c = await contest();
  await submit(c);
  const passes = [];
  for (let i = 0; i < 30; i++)
    passes.push(
      await json(`/competitions/${c.id}/judge-passes`, 'POST', { label: `학교 심사위원 ${i + 1}` }),
    );
  const sessions = await Promise.all(
    passes.map((p) =>
      request(`/public/competitions/${c.id}/judge-session`, 'POST', { key: p.key }, ''),
    ),
  );
  assert.ok(
    sessions.every((r) => r.status === 200),
    JSON.stringify(sessions.map((r) => r.status)),
  );
  assert.equal(new Set(sessions.map((r) => r.headers.get('set-cookie')!.split(';')[0])).size, 30);
});

test('server reminder delivery is durable, scoped and deduplicated across restarts', async () => {
  const c = await contest({
    participantIds: [studentId],
    submissionDueAt: new Date(Date.now() + 30 * 60000).toISOString(),
  });
  await stop();
  await start();
  const first = (await json('/events', 'GET', undefined, student)).filter(
    (e: any) =>
      e.type === 'competition.updated' &&
      e.payload.competitionId === c.id &&
      e.payload.kind === 'deadline.near',
  );
  assert.equal(first.length, 1);
  assert.equal(
    (await json('/events', 'GET', undefined, second)).filter(
      (e: any) => e.type === 'competition.updated' && e.payload.competitionId === c.id,
    ).length,
    0,
  );
  await stop();
  await start();
  const repeated = (await json('/events', 'GET', undefined, student)).filter(
    (e: any) =>
      e.type === 'competition.updated' &&
      e.payload.competitionId === c.id &&
      e.payload.kind === 'deadline.near',
  );
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].id, first[0].id);
});
test('moving an unsubmitted participant to another class stops new private contest reminders', async () => {
  const invitation = await json('/invitations', 'POST', { label: '알림 반 격리' });
  const r = await request(
    '/register',
    'POST',
    {
      key: invitation.key,
      email: 'competition-notify-remap@example.com',
      name: '알림 이동 학생',
      password: 'competition-student-password',
      appearance: defaultAppearance,
    },
    '',
  );
  assert.equal(r.status, 201);
  const cookie = r.headers.get('set-cookie')!.split(';')[0],
    person = (await json('/state', 'GET', undefined, cookie)).me;
  const c = await contest({
    participantIds: [person.id],
    submissionDueAt: new Date(Date.now() + 30 * 60000).toISOString(),
  });
  const target = await json('/classes', 'POST', { name: '알림 분리반' });
  await json(`/classes/${target.id}/members`, 'PATCH', { memberIds: [person.id] });
  await stop();
  await start();
  const events = await json('/events', 'GET', undefined, cookie);
  assert.equal(
    events.filter(
      (event: any) =>
        event.type === 'competition.updated' &&
        event.payload.competitionId === c.id &&
        event.payload.kind === 'deadline.near',
    ).length,
    0,
  );
  assert.equal((await request(`/competitions/${c.id}`, 'GET', undefined, cookie)).status, 404);
});

test('offline restore clears live judge sessions while preserving scores and the source database', async () => {
  const c = await contest(),
    e = await submit(c);
  judging(c);
  const judge = await activate(c);
  await json(`/public/competitions/${c.id}/entries/${e.id}/scores`, 'POST', score, judge.cookie);
  const restored = join(directory, 'restored-competitions.sqlite');
  await copyDatabase(file, restored, { invalidateSessions: true });
  const db = new DatabaseSync(restored);
  try {
    assert.equal(
      (db.prepare('SELECT count(*) n FROM competition_judge_sessions').get() as { n: number }).n,
      0,
    );
    assert.equal((db.prepare('SELECT count(*) n FROM sessions').get() as { n: number }).n, 0);
    assert.equal(
      (
        db
          .prepare('SELECT count(*) n FROM competition_scores WHERE competition_id=?')
          .get(c.id) as { n: number }
      ).n,
      1,
    );
  } finally {
    db.close();
  }
  assert.ok(
    (
      await json<PublicCompetitionResponse>(
        `/public/competitions/${c.id}`,
        'GET',
        undefined,
        judge.cookie,
      )
    ).judge,
  );
});

test('restoring an older snapshot never resurrects a later-used or revoked judge KEY', async () => {
  const c = await contest();
  await submit(c);
  judging(c);
  const pass = await json(`/competitions/${c.id}/judge-passes`, 'POST', { label: '이전 백업 KEY' });
  const snapshot = join(directory, 'before-key-used.sqlite'),
    restored = join(directory, 'before-key-used-restored.sqlite');
  await copyDatabase(file, snapshot);
  assert.equal(
    (await request(`/public/competitions/${c.id}/judge-session`, 'POST', { key: pass.key }, ''))
      .status,
    200,
  );
  await json(`/competitions/${c.id}/judge-passes/${pass.pass.id}`, 'DELETE');
  await copyDatabase(snapshot, restored, { invalidateSessions: true });
  const old = new DatabaseSync(snapshot),
    recovered = new DatabaseSync(restored);
  try {
    assert.equal(
      old.prepare('SELECT used_at FROM competition_judge_passes WHERE id=?').get(pass.pass.id)!
        .used_at,
      null,
    );
    assert.equal(
      (recovered.prepare('SELECT count(*) n FROM competition_judge_passes').get() as { n: number })
        .n,
      0,
    );
    assert.equal(
      (
        recovered.prepare('SELECT count(*) n FROM competition_judge_sessions').get() as {
          n: number;
        }
      ).n,
      0,
    );
    assert.equal(
      (recovered.prepare('SELECT count(*) n FROM sessions').get() as { n: number }).n,
      0,
    );
    assert.ok(
      (recovered.prepare('SELECT count(*) n FROM competition_scores').get() as { n: number }).n > 0,
    );
  } finally {
    old.close();
    recovered.close();
  }
  assert.equal(
    fixture(
      (db) =>
        (
          db
            .prepare('SELECT revoked FROM competition_judge_passes WHERE id=?')
            .get(pass.pass.id) as { revoked: number }
        ).revoked,
    ),
    1,
  );
});
test('anonymous competition request bodies are bounded before KEY activation', async () => {
  const c = await contest(),
    pass = await json(`/competitions/${c.id}/judge-passes`, 'POST', { label: '요청 크기 제한' });
  assert.equal(
    (
      await request(
        `/public/competitions/${c.id}/judge-session`,
        'POST',
        { key: pass.key, padding: 'x'.repeat(20 * 1024) },
        '',
      )
    ).status,
    413,
  );
  assert.equal(
    (await request(`/public/competitions/${c.id}/judge-session`, 'POST', { key: pass.key }, ''))
      .status,
    200,
  );
});

test('restart preserves class membership, submitted versions, scores and live sessions without resetting data', async () => {
  const c = await contest(),
    e = await submit(c);
  judging(c);
  const judge = await activate(c);
  await json(`/public/competitions/${c.id}/entries/${e.id}/scores`, 'POST', score, judge.cookie);
  await stop();
  await start();
  const state = await json('/state', 'GET', undefined, student);
  assert.equal(state.me.id, studentId);
  assert.ok(state.classes.some((value: any) => value.id === classId));
  const detail = await json(`/competitions/${c.id}`);
  assert.equal(detail.results[0].average, 85);
  assert.equal(detail.entries[0].id, e.id);
  const publicView = await json<PublicCompetitionResponse>(
    `/public/competitions/${c.id}`,
    'GET',
    undefined,
    judge.cookie,
  );
  assert.ok(publicView.judge?.scoredEntryIds.includes(e.id));
});
