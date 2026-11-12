import { test, expect, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultAppearance, emptyProject, type AppState } from '../shared/types';
import type {
  Competition,
  CompetitionDetailResponse,
  CompetitionListResponse,
} from '../shared/competitions';

const base = 'http://127.0.0.1:3063';
const dir = mkdtempSync(join(tmpdir(), 'pixel-competition-browser-'));
const key = randomBytes(32).toString('hex'),
  password = randomBytes(24).toString('hex');
const headers = { 'X-Pixel-Class': '1' };
let server: ChildProcess;
const kstInput = (date: number) => new Date(date + 9 * 3600000).toISOString().slice(0, 16);
async function request<T>(
  context: BrowserContext,
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  const response = await context.request.fetch(`/api${path}`, {
    method,
    headers,
    ...(data ? { data } : {}),
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
test.beforeAll(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DEMO_MODE: 'false',
      HOST: '127.0.0.1',
      PORT: '3063',
      DATABASE_PATH: join(dir, 'school.sqlite'),
      MASTER_BOOTSTRAP_KEY: key,
      PUBLIC_ORIGIN: base,
      COOKIE_SECURE: 'false',
      ALLOW_INSECURE_LOCALHOST: 'true',
      OPENAI_API_KEY: '',
      OPENAI_MODEL: '',
      PIXEL_RUNTIME: '',
      RAILWAY_PROJECT_ID: '',
    },
    stdio: 'pipe',
  });
  let ready = false,
    output = '';
  server.stderr?.on('data', (v) => (output += String(v)));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(ready, output).toBeTruthy();
  mkdirSync('docs/competitions', { recursive: true });
});
test.afterAll(async () => {
  if (server?.exitCode === null) {
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await stopped;
  }
  rmSync(dir, { recursive: true, force: true });
});

test('real MASTER and STUDENT create class, submit safely, judge, publish and archive in independent production sessions', async ({
  browser,
}) => {
  test.setTimeout(150000);
  const master = await browser.newContext({
    baseURL: base,
    viewport: { width: 1366, height: 768 },
  });
  const student = await browser.newContext({
    baseURL: base,
    viewport: { width: 1366, height: 768 },
  });
  const judge = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 900 } });
  const stranger = await browser.newContext({
    baseURL: base,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const errors: string[] = [];
  try {
    await request(master, '/bootstrap', 'POST', {
      key,
      email: 'competition-master@example.test',
      password,
      name: '경진대회 검증 선생님',
    });
    const invite = await request<{ key: string }>(master, '/invitations', 'POST', {
      label: '경진대회 통합 검증 학생',
    });
    await request(student, '/register', 'POST', {
      key: invite.key,
      email: 'competition-student@example.test',
      password,
      name: '경진대회 검증 학생',
      appearance: defaultAppearance,
    });
    const studentState = await request<AppState>(student, '/state');
    const project = await request<{ id: string }>(student, '/projects', 'POST', {
      ...emptyProject(),
      title: '우리 현장의 AI 도우미',
      purpose: 'INTERNAL-PRIVATE-PROJECT-PURPOSE',
      features: '입력 기록을 모으고 검색해요',
    });
    const mp = await master.newPage();
    mp.on('pageerror', (e) => errors.push(e.message));
    await mp.goto('/');
    await expect(mp.locator('canvas')).toBeVisible();
    await mp.getByRole('button', { name: '경진대회', exact: true }).click();
    await mp.getByText('반 구성과 학생 배정', { exact: true }).click();
    await mp.getByLabel('새 반 이름').fill('AI 서비스 실험반');
    await mp.getByRole('button', { name: '반 만들기', exact: true }).click();
    const classRow = mp
      .locator('.competition-class-row')
      .filter({ has: mp.getByRole('heading', { name: /AI 서비스 실험반/ }) });
    await expect(classRow).toBeVisible();
    await classRow.getByRole('checkbox').check();
    await classRow.getByRole('button', { name: '이 반의 학생 배정 저장' }).click();
    await expect(classRow.getByRole('heading')).toContainText('1명');
    await mp.getByRole('button', { name: '대회 만들기', exact: true }).click();
    const modal = mp.getByRole('dialog');
    await modal.getByLabel('대회 이름').fill('우리 반 첫 AI 쇼케이스');
    await modal
      .getByLabel('대회 소개와 참가 안내')
      .fill('현장에서 배운 문제를 AI 서비스로 만들고 함께 소개해요.');
    await modal.getByLabel('참가 반').selectOption({ label: 'AI 서비스 실험반' });
    const now = Date.now();
    for (const [label, offset] of [
      ['작품 접수 시작', -86400000],
      ['작품 제출 마감', 86400000],
      ['심사 시작', 90000000],
      ['심사 종료', 93600000],
      ['결과 발표 예정', 97200000],
    ] as const)
      await modal.getByLabel(label, { exact: true }).fill(kstInput(now + offset));
    await modal.getByRole('button', { name: '준비 상태로 만들기' }).click();
    await expect(modal).toHaveCount(0);
    await expect(
      mp.getByRole('heading', { name: '우리 반 첫 AI 쇼케이스', exact: true }),
    ).toBeVisible();
    await mp.getByRole('button', { name: '대회 공개', exact: true }).click();
    await mp
      .getByRole('dialog')
      .getByRole('button', { name: '대회 공개하기', exact: true })
      .click();
    await expect(mp.getByRole('dialog')).toHaveCount(0);
    await mp.screenshot({ path: 'docs/competitions/master-laptop.png', fullPage: true });
    const list = await request<CompetitionListResponse>(master, '/competitions');
    const competition = list.competitions.find((c) => c.name === '우리 반 첫 AI 쇼케이스')!;
    expect(competition).toBeTruthy();
    const sp = await student.newPage();
    sp.on('pageerror', (e) => errors.push(e.message));
    await sp.goto('/');
    await expect(sp.locator('.competition-event-strip')).toContainText(competition.name);
    await expect(sp.locator('canvas')).toBeVisible();
    await sp.screenshot({ path: 'docs/competitions/classroom-event-laptop.png', fullPage: true });
    await sp.getByRole('button', { name: '대회 확인', exact: true }).click();
    await sp.getByRole('button', { name: '대회 자세히 보기' }).click();
    await sp.getByRole('button', { name: '내 서비스 출품하기' }).click();
    const submission = sp.getByRole('dialog');
    await submission.getByLabel('작품 표시 이름').fill('초록빛 메이커');
    await submission.getByLabel('서비스 결과물 주소').fill('https://example.com/my-ai-service');
    for (const [label, value] of [
      ['서비스 이름', '현장 AI 도우미'],
      ['서비스를 만든 목적', '현장의 기록을 쉽게 찾아요.'],
      ['주요 기능', '기록 검색과 요약'],
      ['사용 방법', '질문을 입력하면 관련 기록을 찾아줘요.'],
    ] as const)
      await submission.getByLabel(label, { exact: true }).fill(value);
    await submission.getByRole('checkbox').check();
    await submission.getByRole('button', { name: '작품 제출하기', exact: true }).click();
    await expect(submission).toHaveCount(0);
    await expect(sp.getByText('제출 완료', { exact: true })).toBeVisible();
    await sp.getByRole('button', { name: '출품작 수정하기' }).click();
    await sp
      .getByRole('dialog')
      .getByRole('button', { name: 'HTML 파일 업로드', exact: true })
      .click();
    await sp
      .getByRole('dialog')
      .getByLabel('소개서 HTML 파일')
      .setInputFiles({
        name: '소개서.html',
        mimeType: 'text/html',
        buffer: Buffer.from(
          '<h1>현장 AI 도우미</h1><p>기록 검색과 요약을 도와요.</p><script>parent.__competitionXss=1</script><img src=x onerror="parent.__competitionXss=2"><iframe src="/api/state"></iframe><form action="/api/logout"><input type=submit></form>',
        ),
      });
    await sp.getByRole('dialog').getByRole('checkbox').check();
    await sp.getByRole('dialog').getByRole('button', { name: '출품작 다시 제출' }).click();
    await expect(sp.getByRole('dialog')).toHaveCount(0);
    await sp.reload();
    await sp.getByRole('button', { name: '경진대회', exact: true }).click();
    await sp.getByRole('button', { name: '대회 자세히 보기' }).click();
    await expect(sp.getByText('제출 완료', { exact: true })).toBeVisible();
    await sp.getByRole('button', { name: '제출 버전 비교', exact: true }).click();
    const history = sp.getByRole('dialog');
    await expect(history.getByText(/버전 1 → 버전 2/)).toBeVisible();
    await expect(history.getByRole('heading', { name: '소개서 원본', exact: true })).toBeVisible();
    await expect(history.locator('iframe').first()).toHaveAttribute('sandbox', '');
    mkdirSync('docs/overnight/competition', { recursive: true });
    await sp.setViewportSize({ width: 390, height: 844 });
    expect(await sp.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await sp.screenshot({ path: 'docs/overnight/competition/history-390.png', fullPage: true });
    await history.getByRole('button', { name: '닫기', exact: true }).click();
    await sp.setViewportSize({ width: 1366, height: 768 });
    await sp.getByRole('button', { name: '공개 내용 미리보기' }).click();
    const preview = sp.getByRole('dialog').locator('iframe');
    await expect(preview).toHaveAttribute('sandbox', '');
    await expect(preview).toHaveAttribute('srcdoc', /default-src 'none'/);
    expect(
      await sp.evaluate(
        () => (window as unknown as { __competitionXss?: number }).__competitionXss,
      ),
    ).toBeUndefined();
    await sp.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
    await sp.screenshot({ path: 'docs/competitions/student-laptop.png', fullPage: true });
    // Compress only the test competition's schedule before judging. The server clock stays real.
    const updated = await request<Competition>(master, `/competitions/${competition.id}`, 'PATCH', {
      revision: competition.revision,
      submissionDueAt: new Date(Date.now() + 1000).toISOString(),
      judgingStartsAt: new Date(Date.now() + 2500).toISOString(),
      judgingEndsAt: new Date(Date.now() + 24000).toISOString(),
      resultsAt: new Date(Date.now() + 24500).toISOString(),
    });
    const pass = await request<{ key: string }>(
      master,
      `/competitions/${competition.id}/judge-passes`,
      'POST',
      { label: '외부 심사위원 A' },
    );
    const publicPage = await stranger.newPage();
    publicPage.on('pageerror', (e) => errors.push(e.message));
    // Models the real deployment's private /assets gate while public bundle aliases remain available.
    await publicPage.route('**/assets/**', (route) =>
      route.fulfill({ status: 401, body: 'Private school assets' }),
    );
    const accountRequests: string[] = [];
    publicPage.on('request', (r) => {
      if (/\/api\/(state|config|demo|login)/.test(r.url())) accountRequests.push(r.url());
    });
    await publicPage.goto(`/competition/${competition.id}`);
    await expect(publicPage.getByRole('heading', { name: competition.name })).toBeVisible();
    await expect(publicPage.getByText('초대된 심사자에게 공개하는 작품이에요')).toBeVisible();
    await publicPage.getByLabel('심사 KEY').fill('invalid-key-which-is-long-enough-000000');
    await publicPage.getByRole('button', { name: '심사 참여하기', exact: true }).click();
    await expect(publicPage.getByRole('alert')).toContainText('유효하지 않거나');
    expect(accountRequests).toEqual([]);
    expect((await stranger.request.get('/api/state')).status()).toBe(401);
    expect(
      await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await publicPage.screenshot({ path: 'docs/competitions/public-mobile.png', fullPage: true });
    await expect
      .poll(
        async () =>
          (await request<CompetitionDetailResponse>(master, `/competitions/${competition.id}`))
            .competition.state,
      )
      .toBe('JUDGING');
    const jp = await judge.newPage();
    jp.on('pageerror', (e) => errors.push(e.message));
    await jp.route('**/assets/**', (route) =>
      route.fulfill({ status: 401, body: 'Private school assets' }),
    );
    await jp.goto(`/competition/${competition.id}#judge=${pass.key}`);
    await expect(jp.getByText(/외부 심사위원 A · 심사 연결됨/)).toBeVisible();
    expect(new URL(jp.url()).hash).toBe('');
    await jp.getByRole('button', { name: '작품 살펴보기 · 평가' }).click();
    const publicData = await request<{ entries: unknown[] }>(
      judge,
      `/public/competitions/${competition.id}`,
    );
    const serialized = JSON.stringify(publicData);
    expect(serialized).not.toContain('competition-student@example.test');
    expect(serialized).not.toContain('INTERNAL-PRIVATE-PROJECT-PURPOSE');
    expect(serialized).not.toContain(studentState.me.id);
    await expect(
      jp.frameLocator('iframe').getByRole('heading', { name: '현장 AI 도우미' }),
    ).toBeVisible();
    const iframe = jp.locator('iframe');
    await expect(iframe).toHaveAttribute('sandbox', '');
    const html = await iframe.getAttribute('srcdoc');
    expect(html).not.toMatch(/<script|onerror|<iframe|<form/i);
    expect(
      await jp.evaluate(
        () => (window as unknown as { __competitionXss?: number }).__competitionXss,
      ),
    ).toBeUndefined();
    for (const [label, value] of [
      ['실용성', '32'],
      ['활용성', '27'],
      ['완성도', '18'],
      ['창의성', '14'],
    ] as const)
      await jp.getByLabel(label, { exact: true }).fill(value);
    await expect(jp.locator('.competition-score-total')).toContainText('91');
    await jp.screenshot({ path: 'docs/competitions/judging-desktop.png', fullPage: true });
    await jp.getByRole('button', { name: '점수 확인하고 제출하기' }).click();
    await jp
      .getByRole('dialog')
      .getByRole('button', { name: '평가 최종 제출', exact: true })
      .click();
    await expect(jp.getByText('이미 평가한 작품이에요')).toBeVisible();
    await jp.reload();
    await jp.getByRole('button', { name: '작품 살펴보기', exact: true }).click();
    await expect(jp.getByText('이미 평가한 작품이에요')).toBeVisible();
    await expect(jp.getByLabel('실용성')).toHaveCount(0);
    await mp.reload();
    await mp.getByRole('button', { name: '경진대회', exact: true }).click();
    await mp.getByRole('button', { name: '대회 자세히 보기' }).click();
    const reviews = mp.locator('.competition-score-reviews');
    await reviews.locator('summary').click();
    await expect(reviews.getByText('집계 포함', { exact: true })).toBeVisible();
    await reviews.getByRole('button', { name: '집계에서 제외', exact: true }).click();
    await mp
      .getByRole('dialog')
      .getByLabel('평가 검토 사유')
      .fill('검토 과정에서 시험 평가를 제외합니다');
    await mp
      .getByRole('dialog')
      .getByRole('button', { name: '사유 기록하고 제외', exact: true })
      .click();
    await expect(mp.getByRole('dialog')).toHaveCount(0);
    await expect(reviews.getByText('집계 제외', { exact: true })).toBeVisible();
    await expect(mp.locator('.competition-result')).toContainText('최소 심사 수 미달');
    await reviews.getByRole('button', { name: '집계에 복원', exact: true }).click();
    await mp
      .getByRole('dialog')
      .getByLabel('평가 검토 사유')
      .fill('검토를 완료해 원래 평가를 복원합니다');
    await mp
      .getByRole('dialog')
      .getByRole('button', { name: '사유 기록하고 복원', exact: true })
      .click();
    await expect(mp.getByRole('dialog')).toHaveCount(0);
    await expect(mp.locator('.competition-result')).toContainText('91.00');
    await mp.screenshot({
      path: 'docs/overnight/competition/score-review-1366.png',
      fullPage: true,
    });
    const reused = await stranger.request.post(
      `/api/public/competitions/${competition.id}/judge-session`,
      { headers, data: { key: pass.key } },
    );
    expect(reused.status()).toBe(403);
    const violations = (
      await new AxeBuilder({ page: jp })
        .setLegacyMode()
        .options({ iframes: false })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations;
    expect(violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual(
      [],
    );
    await expect
      .poll(
        async () => {
          const latest = await request<CompetitionDetailResponse>(
            master,
            `/competitions/${competition.id}`,
          );
          return (
            latest.competition.state === 'JUDGING_CLOSED' &&
            Date.parse(latest.serverNow) >= Date.parse(latest.competition.resultsAt)
          );
        },
        { timeout: 30000 },
      )
      .toBe(true);
    await request(master, `/competitions/${competition.id}/action`, 'POST', {
      action: 'publishResults',
      reason: '검증 완료 후 결과 발표',
    });
    await mp.reload();
    await mp.getByRole('button', { name: '경진대회', exact: true }).click();
    await mp.getByRole('button', { name: '대회 자세히 보기' }).click();
    await expect(mp.getByText('공개한 결과', { exact: true })).toBeVisible();
    await expect(mp.locator('.competition-result')).toContainText('91.00');
    await mp.getByRole('button', { name: '대회 보관하기', exact: true }).click();
    await mp
      .getByRole('dialog')
      .getByRole('button', { name: '대회 보관하기', exact: true })
      .click();
    await expect(mp.getByRole('dialog')).toHaveCount(0);
    await sp.goto('/');
    await expect(sp.locator('canvas')).toBeVisible();
    await expect(sp.locator('.competition-event-strip')).toHaveCount(0);
    expect(
      (await stranger.request.get(`/api/public/competitions/${competition.id}`)).status(),
    ).toBe(404);
    expect(errors).toEqual([]);
    expect(updated.id).toBe(competition.id);
    expect(project.id).toBeTruthy();
  } finally {
    await Promise.all([master.close(), student.close(), judge.close(), stranger.close()]);
  }
});

test('public showcase and score confirmation fit five viewports, and idle classroom refreshes server phase', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const master = await browser.newContext({ baseURL: base });
  const student = await browser.newContext({ baseURL: base });
  const mobile = await browser.newContext({
    baseURL: base,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const desktop = await browser.newContext({ baseURL: base });
  try {
    const config = await request<{ bootstrap: boolean }>(master, '/config');
    await request(master, config.bootstrap ? '/bootstrap' : '/login', 'POST', {
      ...(config.bootstrap ? { key, name: '경진대회 검증 선생님' } : {}),
      email: 'competition-master@example.test',
      password,
    });
    const invitation = await request<{ key: string }>(master, '/invitations', 'POST', {
      label: '반응형 경진대회 검증',
    });
    await request(student, '/register', 'POST', {
      key: invitation.key,
      email: 'competition-mobile-student@example.test',
      password,
      name: '긴 한국어 이름을 가진 반응형 검증 학생',
      appearance: defaultAppearance,
    });
    const person = (await request<AppState>(student, '/state')).me;
    const project = await request<{ id: string }>(student, '/projects', 'POST', {
      ...emptyProject(),
      title: '긴 이름도 읽기 편한 우리 현장의 인공지능 기록 관리 서비스',
    });
    const classes = await request<CompetitionListResponse>(master, '/competitions');
    const start = Date.now();
    const competition = await request<Competition>(master, '/competitions', 'POST', {
      name: '우리 반에서 함께 만든 AI 서비스의 가능성을 나누는 경진대회',
      description:
        '긴 한국어 이름과 설명도 작은 화면에서 자연스럽게 읽을 수 있어야 해요. 서로의 서비스를 살펴보고 성장하는 시간을 가져요.',
      classId: classes.activeClassId,
      participantIds: [person.id],
      opensAt: new Date(start + 6000).toISOString(),
      submissionDueAt: new Date(start + 60000).toISOString(),
      judgingStartsAt: new Date(start + 62000).toISOString(),
      judgingEndsAt: new Date(start + 300000).toISOString(),
      resultsAt: new Date(start + 301000).toISOString(),
      visibility: 'PUBLIC',
      allowRealNames: false,
      minJudges: 1,
      awardNames: ['함께 성장상'],
    });
    await request(master, `/competitions/${competition.id}/action`, 'POST', { action: 'publish' });
    const classPage = await student.newPage();
    await classPage.clock.install();
    await classPage.goto('/');
    await expect(classPage.locator('.competition-event-strip')).toContainText('접수 예정');
    await expect(classPage.locator('canvas')).toBeVisible();
    // Advance only the browser's poll timer after the real server crosses the opening time.
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, start + 6100 - Date.now())));
    await classPage.clock.fastForward(61000);
    await expect(classPage.locator('.competition-event-strip')).toContainText('작품 접수 중');
    await request(student, `/competitions/${competition.id}/entry`, 'PUT', {
      projectId: project.id,
      title: '긴 이름도 읽기 편한 우리 현장의 인공지능 기록 관리 서비스',
      displayName: '성장하는 AI 메이커',
      serviceUrl: 'https://example.com/service',
      consentPublic: true,
      intro: {
        serviceName: 'AI 기록 관리',
        purpose: '업무 기록을 쉽게 검색해요.',
        features: '검색, 요약, 주제별 정리',
        usage: '기록을 입력하고 필요한 내용을 질문해요.',
      },
    });
    const current = (
      await request<{ competition: Competition }>(master, `/competitions/${competition.id}`)
    ).competition;
    await request(master, `/competitions/${competition.id}`, 'PATCH', {
      revision: current.revision,
      submissionDueAt: new Date(Date.now() + 500).toISOString(),
      judgingStartsAt: new Date(Date.now() + 1200).toISOString(),
    });
    const pass = await request<{ key: string }>(
      master,
      `/competitions/${competition.id}/judge-passes`,
      'POST',
      { label: '모바일 심사위원' },
    );
    const page = await desktop.newPage();
    await page.goto(`/competition/${competition.id}`);
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [1366, 768],
      [1280, 720],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(page.getByRole('heading', { name: competition.name })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBeTruthy();
      await page.screenshot({ path: `docs/competitions/showcase-${width}.png`, fullPage: true });
    }
    await expect
      .poll(
        async () =>
          (await request<{ competition: Competition }>(master, `/competitions/${competition.id}`))
            .competition.state,
      )
      .toBe('JUDGING');
    const judgePage = await mobile.newPage();
    await judgePage.goto(`/competition/${competition.id}#judge=${pass.key}`);
    await expect(judgePage.getByText('모바일 심사위원 · 심사 연결됨')).toBeVisible();
    await judgePage.getByRole('button', { name: '작품 살펴보기 · 평가' }).click();
    await expect(
      judgePage.frameLocator('iframe').getByRole('heading', { name: '서비스 이름', exact: true }),
    ).toBeVisible();
    await judgePage.getByRole('link', { name: '평가 항목으로 바로가기' }).click();
    await judgePage.getByLabel('실용성', { exact: true }).fill('36');
    for (const [label, value] of [
      ['활용성', '30'],
      ['완성도', '20'],
      ['창의성', '15'],
    ] as const)
      await judgePage.getByLabel(label, { exact: true }).fill(value);
    await judgePage.getByRole('button', { name: '점수 확인하고 제출하기' }).click();
    await expect(judgePage.getByRole('dialog')).toHaveCount(0);
    await judgePage.getByLabel('실용성', { exact: true }).fill('35');
    await judgePage.getByRole('button', { name: '점수 확인하고 제출하기' }).click();
    const dialog = judgePage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
        );
      }),
    ).toBeTruthy();
    await judgePage.screenshot({
      path: 'docs/competitions/judge-confirmation-390.png',
      fullPage: true,
    });
    const findings = (
      await new AxeBuilder({ page: judgePage })
        .setLegacyMode()
        .options({ iframes: false })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations;
    expect(findings.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
    await judgePage.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(judgePage.getByRole('button', { name: '점수 확인하고 제출하기' })).toBeFocused();
    await judgePage.locator('iframe').scrollIntoViewIfNeeded();
    await expect(
      judgePage.frameLocator('iframe').getByRole('heading', { name: '서비스 이름', exact: true }),
    ).toBeVisible();
    await judgePage.screenshot({ path: 'docs/competitions/judge-healthy-390.png', fullPage: true });
    expect(
      await judgePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    const masterMobile = await master.newPage();
    await masterMobile.setViewportSize({ width: 390, height: 844 });
    await masterMobile.goto('/');
    await masterMobile.getByRole('button', { name: '경진대회', exact: true }).click();
    await expect(masterMobile.getByRole('heading', { name: '우리 반 AI 경진대회' })).toBeVisible();
    expect(
      await masterMobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await masterMobile.screenshot({ path: 'docs/competitions/master-390.png', fullPage: true });
  } finally {
    await Promise.all([master.close(), student.close(), mobile.close(), desktop.close()]);
  }
});

test('MASTER can explicitly repair a moved participant and retains submitted-history participants', async ({
  browser,
}) => {
  test.setTimeout(60000);
  const master = await browser.newContext({ baseURL: base });
  const moved = await browser.newContext({ baseURL: base });
  const remaining = await browser.newContext({
    baseURL: base,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const config = await request<{ bootstrap: boolean }>(master, '/config');
    await request(master, config.bootstrap ? '/bootstrap' : '/login', 'POST', {
      ...(config.bootstrap ? { key, name: '경진대회 검증 선생님' } : {}),
      email: 'competition-master@example.test',
      password,
    });
    const ids: string[] = [];
    for (const [context, name, email] of [
      [moved, '반을 옮긴 참가 학생', 'roster-moved@example.test'],
      [remaining, '원래 반의 참가 학생', 'roster-remaining@example.test'],
    ] as const) {
      const invite = await request<{ key: string }>(master, '/invitations', 'POST', {
        label: '참가 명단 회귀 검증',
      });
      await request(context, '/register', 'POST', {
        key: invite.key,
        email,
        password,
        name,
        appearance: defaultAppearance,
      });
      ids.push((await request<AppState>(context, '/state')).me.id);
    }
    const originalClass = await request<{ id: string }>(master, '/classes', 'POST', {
      name: '참가 명단 검증반',
    });
    const nextClass = await request<{ id: string }>(master, '/classes', 'POST', {
      name: '이동한 학생의 새 반',
    });
    await request(master, `/classes/${originalClass.id}/members`, 'PATCH', { memberIds: ids });
    const now = Date.now();
    const competition = await request<Competition>(master, '/competitions', 'POST', {
      name: '참가 명단 정리 회귀 대회',
      description: '반 이동 후 명단을 명시적으로 정리하고 기존 출품 기록을 보존해요.',
      classId: originalClass.id,
      participantIds: ids,
      opensAt: new Date(now - 86400000).toISOString(),
      submissionDueAt: new Date(now + 3600000).toISOString(),
      judgingStartsAt: new Date(now + 7200000).toISOString(),
      judgingEndsAt: new Date(now + 10800000).toISOString(),
      resultsAt: new Date(now + 14400000).toISOString(),
    });
    await request(master, `/classes/${nextClass.id}/members`, 'PATCH', { memberIds: [ids[0]] });
    const page = await master.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: '경진대회', exact: true }).click();
    await page
      .locator('.competition-card')
      .filter({ has: page.getByRole('heading', { name: competition.name, exact: true }) })
      .getByRole('button', { name: '대회 자세히 보기' })
      .click();
    await page.getByRole('button', { name: '설정 수정', exact: true }).click();
    const editor = page.getByRole('dialog');
    await expect(editor.getByText('참가 명단을 확인해 주세요', { exact: true })).toBeVisible();
    await expect(editor.getByRole('alert')).toContainText('반을 옮긴 참가 학생');
    await expect(editor.getByRole('button', { name: '설정 저장', exact: true })).toBeDisabled();
    await editor.getByRole('button', { name: '현재 반 참가 명단으로 정리', exact: true }).click();
    await expect(editor.getByRole('button', { name: '설정 저장', exact: true })).toBeEnabled();
    await editor.getByRole('button', { name: '설정 저장', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const repaired = await request<CompetitionDetailResponse>(
      master,
      `/competitions/${competition.id}`,
    );
    expect(repaired.competition.participantIds).toEqual([ids[1]]);
    const learner = await remaining.newPage();
    await learner.goto('/');
    await expect(learner.locator('canvas')).toBeVisible();
    const down = learner.getByRole('button', { name: '터치로 아래쪽 이동', exact: true });
    await expect(down).toBeEnabled();
    await down.scrollIntoViewIfNeeded();
    const touchTargetAvailable = () =>
      down.evaluate((button) => {
        const box = button.getBoundingClientRect(),
          sidebar = document.querySelector('.sidebar')?.getBoundingClientRect();
        const x = box.x + box.width / 2,
          y = box.y + box.height / 2;
        const hit = document.elementFromPoint(x, y);
        return (
          box.top >= 0 &&
          box.bottom <= Math.min(innerHeight, sidebar?.top ?? innerHeight) &&
          !!hit &&
          (hit === button || button.contains(hit))
        );
      });
    await expect.poll(touchTargetAvailable).toBe(true);
    await expect(learner.locator('.competition-event-strip')).toHaveCount(0);
    await request(master, `/competitions/${competition.id}/action`, 'POST', { action: 'publish' });
    await expect(learner.locator('.competition-event-strip')).toContainText(competition.name);
    await expect.poll(touchTargetAvailable).toBe(true);
    const scrollBefore = await learner.evaluate(() => scrollY);
    const yBefore = Number(await learner.locator('.game-host').getAttribute('data-y'));
    const downBox = (await down.boundingBox())!;
    await learner.mouse.move(downBox.x + downBox.width / 2, downBox.y + downBox.height / 2);
    await learner.mouse.down();
    await learner.waitForTimeout(180);
    await learner.mouse.up();
    await expect
      .poll(async () => Number(await learner.locator('.game-host').getAttribute('data-y')))
      .toBeGreaterThan(yBefore);
    await learner.keyboard.down('ArrowDown');
    await learner.waitForTimeout(100);
    await learner.keyboard.up('ArrowDown');
    expect(await learner.evaluate(() => scrollY)).toBe(scrollBefore);
    await learner.screenshot({ path: 'docs/competitions/classroom-event-arrival-390.png' });
    const project = await request<{ id: string }>(remaining, '/projects', 'POST', {
      ...emptyProject(),
      title: '보존해야 하는 임시 출품 프로젝트',
    });
    await request(remaining, `/competitions/${competition.id}/entry`, 'PUT', {
      projectId: project.id,
      title: '보존해야 하는 임시 출품작',
      displayName: '명단 검증 메이커',
      intro: { serviceName: '임시 소개서' },
      submit: false,
    });
    await request(master, `/classes/${nextClass.id}/members`, 'PATCH', { memberIds: ids });
    await page.reload();
    await page.getByRole('button', { name: '경진대회', exact: true }).click();
    await page
      .locator('.competition-card')
      .filter({ has: page.getByRole('heading', { name: competition.name, exact: true }) })
      .getByRole('button', { name: '대회 자세히 보기' })
      .click();
    await page.getByRole('button', { name: '설정 수정', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      '출품 이력이 있는 대회는 기존 참가자를 제외할 수 없어요',
    );
    await expect(
      page.getByRole('dialog').getByRole('button', { name: '현재 반 참가 명단으로 정리' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('dialog').getByRole('button', { name: '설정 저장', exact: true }),
    ).toBeDisabled();
    const preserved = await request<CompetitionDetailResponse>(
      master,
      `/competitions/${competition.id}`,
    );
    expect(preserved.competition.participantIds).toEqual([ids[1]]);
    expect(preserved.entries).toHaveLength(1);
    expect(preserved.entries[0].title).toBe('보존해야 하는 임시 출품작');
  } finally {
    await Promise.all([master.close(), moved.close(), remaining.close()]);
  }
});
