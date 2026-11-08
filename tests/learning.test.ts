import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyProject, defaultAppearance, type Project } from '../shared/types.js';
import {
  defaultAnalysis,
  roadmapTemplate,
  redactSensitive,
  aiProjectContext,
  codexTemplate,
  isStale,
  recommendedMaterials,
  normalizeProject,
} from '../shared/learning.js';
const dir = mkdtempSync(join(tmpdir(), 'pixel-learning-')),
  base = 'http://127.0.0.1:3015';
let child: ChildProcess,
  master = '',
  student = '',
  other = '',
  projectId = '',
  attachmentId = '',
  questionId = '',
  submissionId = '';
const request = async (
  path: string,
  body?: unknown,
  cookie = '',
  method = body ? 'POST' : 'GET',
) => {
  const res = await fetch(base + '/api' + path, {
    method,
    headers: { 'X-Pixel-Class': '1', 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { res, data };
};
before(async () => {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: '3015',
      DATABASE_PATH: join(dir, 'school.sqlite'),
      DEMO_MODE: 'false',
      MASTER_BOOTSTRAP_KEY: 'learning-bootstrap',
      NODE_ENV: 'test',
    },
    stdio: 'pipe',
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const m = await request('/bootstrap', {
    key: 'learning-bootstrap',
    email: 'learning-master@example.com',
    password: 'learning-master-password',
    name: '멘토',
  });
  master = m.res.headers.get('set-cookie')!.split(';')[0];
  for (let i = 0; i < 2; i++) {
    const invite = await request('/invitations', { label: `학생${i}` }, master);
    const s = await request('/register', {
      key: invite.data.key,
      email: `learning-student${i}@example.com`,
      password: 'learning-student-password',
      name: `교육생${i}`,
      appearance: defaultAppearance,
    });
    if (i === 0) student = s.res.headers.get('set-cookie')!.split(';')[0];
    else other = s.res.headers.get('set-cookie')!.split(';')[0];
  }
  const p = await request(
    '/projects',
    { ...emptyProject(), title: '현장 AI 도우미', purpose: '반복 기록 정리', isPublic: true },
    student,
  );
  projectId = p.data.id;
});
after(async () => {
  const stopped = new Promise((r) => child.once('exit', r));
  child.kill();
  await stopped;
  rmSync(dir, { recursive: true, force: true });
});
test('technical analysis and editable tailored roadmaps retain unknowns and enforce ownership', async () => {
  const analysis = { ...defaultAnalysis(), productType: 'WEB', database: true, aiModel: true };
  assert.equal(
    (await request(`/projects/${projectId}/learning`, { analysis }, other, 'PATCH')).res.status,
    403,
  );
  let r = await request(`/projects/${projectId}/learning`, { analysis }, student, 'PATCH');
  assert.equal(r.res.status, 200);
  assert.equal(r.data.analysis.frontend, null);
  r = await request(`/projects/${projectId}/roadmap/template`, { choice: 'AUTO' }, student);
  assert.ok(r.data.roadmap.some((s: any) => s.text === '모델 선정'));
  assert.equal(
    (await request(`/projects/${projectId}/roadmap/template`, { choice: 'DATA' }, student)).res
      .status,
    409,
  );
  const steps = [
    { id: 'custom-1', text: '프로토타입부터 만들기', description: '작은 범위로 검증', done: true },
    { id: 'custom-2', text: '동료에게 사용 부탁하기', description: '다음 학습 단계', done: false },
  ];
  r = await request(`/projects/${projectId}/roadmap`, { steps }, master, 'PUT');
  assert.equal(r.res.status, 200);
  assert.equal(r.data.roadmap[0].text, steps[0].text);
  assert.equal(
    (await request(`/projects/${projectId}/roadmap`, { steps }, other, 'PUT')).res.status,
    403,
  );
  const publicState = await request('/state', undefined, other);
  const p = publicState.data.projects.find((p: Project) => p.id === projectId);
  assert.equal(p.analysis, undefined);
  assert.equal(p.roadmap, undefined);
});
test('structured work records, question lifecycle, topic-specific feedback and answer notifications', async () => {
  const work = {
    completed: '첫 화면 완료',
    inProgress: '저장 기능',
    next: '테스트',
    blockers: 'API 오류',
    references: 'https://example.com/guide',
  };
  assert.equal(
    (
      await request(
        `/projects/${projectId}/entries`,
        { type: 'updates', text: '개발 기록', work },
        student,
      )
    ).res.status,
    200,
  );
  let r = await request(
    `/projects/${projectId}/entries`,
    { type: 'questions', text: '서버 인증키는 어디에 저장하나요?' },
    student,
  );
  questionId = r.data.questions.at(-1).id;
  assert.equal(r.data.questions.at(-1).status, 'NEW');
  assert.equal(r.data.helpRequested, true);
  assert.equal(
    (
      await request(
        `/projects/${projectId}/questions/${questionId}`,
        { answer: '가짜 답변' },
        student,
        'PATCH',
      )
    ).res.status,
    403,
  );
  assert.equal(
    (
      await request(
        `/projects/${projectId}/questions/${questionId}`,
        { status: 'ACKNOWLEDGED' },
        master,
        'PATCH',
      )
    ).res.status,
    200,
  );
  r = await request(
    `/projects/${projectId}/questions/${questionId}`,
    { answer: '서버 환경 변수로 보관하고 브라우저에는 보내지 마세요.' },
    master,
    'PATCH',
  );
  assert.equal(r.data.questions[0].status, 'ANSWERED');
  assert.equal(r.data.questions[0].answers[0].name, '멘토');
  const events = (await request('/events', undefined, student)).data;
  assert.ok(
    events.some(
      (e: any) => e.type === 'project.question.answered' && e.payload.questionId === questionId,
    ),
  );
  assert.ok(
    !(await request('/events', undefined, other)).data.some(
      (e: any) => e.type === 'project.question.answered',
    ),
  );
  await request(
    `/projects/${projectId}/questions/${questionId}`,
    { status: 'RESOLVED' },
    student,
    'PATCH',
  );
  r = await request(
    `/projects/${projectId}/entries`,
    {
      type: 'feedback',
      text: 'DB 테이블의 소유자 ID를 먼저 정리해 보세요.',
      topic: 'DB 설계',
      kind: '다음 과제',
    },
    master,
  );
  const feedback = r.data.feedback.at(-1);
  assert.equal(feedback.topic, 'DB 설계');
  r = await request(
    `/projects/${projectId}/feedback/${feedback.id}`,
    { status: 'DONE' },
    student,
    'PATCH',
  );
  assert.equal(r.data.feedback.at(-1).feedbackStatus, 'DONE');
  assert.equal(r.data.updates[0].work.blockers, 'API 오류');
});
test('private project files and immutable submission snapshots survive revision requests and resubmission', async () => {
  const r = await request(
    `/projects/${projectId}/attachments`,
    { fileName: 'demo.md', content: Buffer.from('# 시연 기록').toString('base64') },
    student,
  );
  assert.equal(r.res.status, 201);
  attachmentId = r.data.id;
  assert.equal(
    (await request(`/projects/${projectId}/attachments/${attachmentId}`, undefined, other)).res
      .status,
    403,
  );
  assert.equal(
    (await request(`/projects/${projectId}/attachments/${attachmentId}`, undefined, master)).res
      .status,
    200,
  );
  const snapshot = {
    overview: '제출 당시 개요',
    serviceUrl: 'https://example.com',
    githubUrl: 'https://github.com/example/project',
    features: '일지 입력',
    aiTools: 'Codex',
    lessons: '권한과 저장 방법을 배웠어요.',
    attachmentIds: [attachmentId],
  };
  let submitted = await request(`/projects/${projectId}/submissions`, snapshot, student);
  assert.equal(submitted.res.status, 201);
  submissionId = submitted.data.submissions[0].id;
  await request(`/projects/${projectId}`, { purpose: '나중에 수정한 개요' }, student, 'PATCH');
  assert.equal(
    (
      await request(
        `/projects/${projectId}/attachments/${attachmentId}`,
        undefined,
        student,
        'DELETE',
      )
    ).res.status,
    409,
  );
  assert.equal(
    (
      await request(
        `/projects/${projectId}/submissions/${submissionId}/review`,
        { decision: 'APPROVED', text: '스스로 승인' },
        student,
      )
    ).res.status,
    403,
  );
  let reviewed = await request(
    `/projects/${projectId}/submissions/${submissionId}/review`,
    { decision: 'CHANGES_REQUESTED', text: '잘못된 입력에 대한 안내를 추가해 주세요.' },
    master,
  );
  assert.equal(reviewed.data.submissions[0].overview, '제출 당시 개요');
  assert.equal(reviewed.data.submissions[0].status, 'CHANGES_REQUESTED');
  assert.equal(reviewed.data.approved, false);
  assert.equal(reviewed.data.status, 'BUILDING');
  submitted = await request(
    `/projects/${projectId}/submissions`,
    { ...snapshot, overview: '수정 후 재제출' },
    student,
  );
  const latest = submitted.data.submissions.at(-1);
  reviewed = await request(
    `/projects/${projectId}/submissions/${latest.id}/review`,
    { decision: 'APPROVED', text: '입력 오류 처리까지 확인했습니다.' },
    master,
  );
  assert.equal(reviewed.data.submissions.length, 2);
  assert.equal(reviewed.data.approved, true);
  assert.equal(reviewed.data.status, 'COMPLETED');
});
test('material topics, description search data and old project compatibility', async () => {
  const uploaded = await request(
    '/materials',
    {
      title: '기초 가이드',
      description: '인증키와 데이터 관리 안내',
      category: '기초',
      visibility: 'ACTIVE',
      fileName: 'guide.md',
      content: Buffer.from('교안').toString('base64'),
      topics: ['AI 프롬프트 작성'],
    },
    master,
  );
  assert.equal(uploaded.res.status, 200);
  const state = (await request('/state', undefined, student)).data;
  const p = state.projects.find((p: Project) => p.id === projectId),
    material = state.materials[0];
  assert.equal(recommendedMaterials(p, [material]).length, 1);
  assert.equal(
    (await request(`/materials/${material.id}`, { topics: ['DB 기초'] }, other, 'PATCH')).res
      .status,
    403,
  );
  assert.equal(
    (await request(`/materials/${material.id}`, { topics: ['DB 기초'] }, master, 'PATCH')).res
      .status,
    200,
  );
  const old = {
    ...p,
    analysis: undefined,
    roadmap: undefined,
    submissions: undefined,
    attachments: undefined,
  };
  const normalized = normalizeProject(old);
  assert.deepEqual(normalized.roadmap, []);
  assert.equal(normalized.analysis!.database, null);
});
test('roadmap variants, stale records and sensitive AI context have deterministic honest behavior', () => {
  assert.ok(
    roadmapTemplate({ ...defaultAnalysis(), database: true }).some((s) => s.text === 'DB 설계'),
  );
  assert.ok(
    roadmapTemplate({ ...defaultAnalysis(), externalApi: true }).some(
      (s) => s.text === 'API 제공 여부 확인',
    ),
  );
  const p = {
    ...emptyProject(),
    id: 'unit',
    schoolId: 's',
    ownerId: 'u',
    title: 'AI 프로젝트',
    tasks: [],
    questions: [],
    updates: [
      {
        id: 'work',
        name: 'n',
        author: 'u',
        createdAt: '2020-01-01',
        text: 'api_key=do-not-send sk-abcdefghijklmnop user@example.com 010-1234-5678',
        work: {
          completed: '구현',
          inProgress: '',
          next: '',
          blockers: 'password=secret-value',
          references: '',
        },
      },
    ],
    feedback: [],
    aiMessages: [],
    approved: false,
    createdAt: '2020-01-01',
    updatedAt: new Date().toISOString(),
  } as Project;
  assert.equal(isStale(p), true);
  const context = aiProjectContext(p);
  assert.ok(!context.includes('secret-value'));
  assert.ok(!context.includes('do-not-send'));
  assert.ok(!codexTemplate(p).includes('secret-value'));
  assert.ok(redactSensitive('sk-abcdefghijklmnop user@example.com').includes('[비밀키 제외]'));
  assert.ok(!redactSensitive('{"api_key":"json-secret-value"}').includes('json-secret-value'));
  assert.ok(
    !redactSensitive('known-real-secret', ['known-real-secret']).includes('known-real-secret'),
  );
});
