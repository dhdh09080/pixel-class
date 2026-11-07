import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { emptyProject, defaultAppearance } from '../shared/types';
const headers = { 'X-Pixel-Class': '1' };
const open = async (page: Page) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.map-online')).toContainText('접속 중');
};
const role = async (page: Page, value: '학생' | 'MASTER') => {
  await page.locator('.demo-switch').getByRole('button', { name: value, exact: true }).click();
  await expect(page.locator('.header-profile small')).toHaveText(
    value === 'MASTER' ? 'MASTER' : 'STUDENT',
  );
};
test('technical plan, editable roadmap, Codex draft, work logs, answered questions and review revisions work end to end', async ({
  page,
  context,
  browser,
}) => {
  await open(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const response = await context.request.post('/api/projects', {
    headers,
    data: {
      ...emptyProject(),
      title: 'v02 현장 데이터 서비스',
      purpose: '안전한 기록 관리',
      features: '입력과 목록',
      aiTools: 'Codex',
    },
  });
  const created = await response.json();
  await page.getByRole('button', { name: '내 프로젝트', exact: true }).click();
  await page.locator('.project-card').filter({ hasText: created.title }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: '기술·로드맵', exact: true }).click();
  await modal.getByLabel('만드는 서비스 형태').selectOption('WEB');
  await modal.getByLabel('데이터베이스 필요 여부').selectOption('true');
  await modal.getByLabel('서버(백엔드) 필요 여부').selectOption('true');
  await modal.getByRole('button', { name: '기술 구성 저장', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await context.request.get('/api/state')).json()).projects.find(
          (p: any) => p.id === created.id,
        ).analysis.database,
    )
    .toBe(true);
  await modal.getByRole('button', { name: '템플릿 불러오기' }).click();
  await expect(modal.locator('.roadmap-step')).toHaveCount(6);
  await modal
    .getByRole('textbox', { name: '로드맵 1 단계 이름', exact: true })
    .fill('요구사항을 작게 정리');
  await modal.getByRole('button', { name: '로드맵 저장', exact: true }).click();
  await expect(modal.getByRole('button', { name: '로드맵 저장', exact: true })).toBeEnabled();
  await expect(modal.getByRole('textbox', { name: '로드맵 1 단계 이름', exact: true })).toHaveValue(
    '요구사항을 작게 정리',
  );
  await modal.getByRole('checkbox', { name: '요구사항을 작게 정리 단계 완료' }).check();
  await modal.getByRole('button', { name: '로드맵 저장', exact: true }).click();
  await expect(modal.getByRole('button', { name: '로드맵 저장', exact: true })).toBeEnabled();
  await modal.getByRole('button', { name: 'Codex 지시문', exact: true }).click();
  const prompt = modal.getByLabel('Codex 지시문 초안');
  await expect(prompt).toHaveValue(/v02 현장 데이터 서비스/);
  await prompt.fill((await prompt.inputValue()) + '\n테스트 결과를 한국어로 설명해 주세요.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await modal.getByRole('button', { name: '지시문 복사' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('테스트 결과를 한국어로');
  await modal.getByRole('button', { name: '개발 기록', exact: true }).click();
  await modal.getByLabel('오늘 완료한 작업').fill('요구사항 정리를 끝냈어요.');
  await modal.getByLabel('해결하지 못한 문제').fill('서버 API 연결이 막혔어요.');
  await modal.getByRole('button', { name: '기록 남기기', exact: true }).click();
  await expect(modal.locator('.timeline-entry')).toContainText('요구사항 정리를 끝냈어요.');
  await modal.getByRole('button', { name: '질문', exact: true }).click();
  await modal
    .getByRole('textbox', { name: '기록 내용', exact: true })
    .fill('v02 질문: API 오류를 어떻게 확인하나요?');
  await modal.getByRole('button', { name: '선생님 도움 요청', exact: true }).click();
  await expect(modal.locator('.question-status')).toHaveText('새 질문');
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  try {
    const teacher = await other.newPage();
    await open(teacher);
    await role(teacher, 'MASTER');
    await teacher.getByRole('button', { name: '교무실', exact: true }).click();
    await teacher.getByRole('button', { name: '질문과 상담', exact: true }).click();
    const thread = teacher.locator('.question-thread').filter({ hasText: 'v02 질문:' });
    await thread.getByLabel('질문 처리 상태').selectOption('ACKNOWLEDGED');
    await thread
      .getByRole('textbox', { name: '질문 답변' })
      .fill('네트워크 탭에서 응답 상태와 메시지를 먼저 확인해 보세요.');
    await thread.getByRole('button', { name: '답변 등록' }).click();
    await expect(modal.locator('.question-answer')).toContainText('네트워크 탭');
    await modal.getByRole('button', { name: '해결됐어요' }).click();
    await expect(modal.locator('.question-status')).toHaveText('해결됨');
    await modal.getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByRole('button', { name: /알림 \d+개/ }).click();
    await expect(page.getByRole('dialog')).toContainText('질문에 답변이 도착했어요');
    await page.getByRole('dialog').getByRole('button', { name: '모두 확인했어요' }).click();
    await page.locator('.project-card').filter({ hasText: created.title }).click();
    await modal.getByRole('button', { name: '최종 제출', exact: true }).click();
    await modal.getByLabel('프로젝트 첨부파일').setInputFiles({
      name: '시연-기록.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# 시연 기록'),
    });
    await modal.getByRole('button', { name: '첨부 저장' }).click();
    await expect(modal.locator('.attachment-row')).toContainText('시연-기록.md');
    await modal
      .getByRole('textbox', { name: '개발하며 배운 점' })
      .fill('작은 단계와 권한의 중요성을 배웠어요.');
    await modal.getByRole('button', { name: '최종 제출하기', exact: true }).click();
    await expect(modal).toContainText('1차 제출');
    await teacher.getByRole('button', { name: '프로젝트 지도', exact: true }).click();
    await teacher
      .locator('.mentoring-list article')
      .filter({ hasText: created.title })
      .getByRole('button', { name: '프로젝트 지도' })
      .click();
    const teacherModal = teacher.getByRole('dialog');
    await teacherModal.getByRole('button', { name: '최종 제출', exact: true }).click();
    await teacherModal
      .getByLabel('구체적인 검토 피드백')
      .fill('입력 오류 안내를 추가한 다음 다시 제출해 주세요.');
    await teacherModal.getByRole('button', { name: '검토 결과 저장' }).click();
    await expect(modal.locator('.submission-record')).toContainText('수정 요청');
    await expect(modal.locator('.submission-record')).toContainText('입력 오류 안내');
    await modal.getByRole('button', { name: '최종 제출하기', exact: true }).click();
    await expect(modal.locator('.submission-record')).toHaveCount(2);
    const pending = teacherModal.locator('.submission-record').filter({ hasText: '2차 제출' });
    await pending.getByLabel('최종 검토 결과').selectOption('APPROVED');
    await pending.getByLabel('구체적인 검토 피드백').fill('작은 기능과 오류 안내까지 확인했어요.');
    await pending.getByRole('button', { name: '검토 결과 저장' }).click();
    await expect(modal.locator('.submission-record').first()).toContainText('승인');
    await page.screenshot({ path: 'docs/v02-project-review.png', fullPage: true });
    await teacherModal.getByRole('button', { name: '닫기', exact: true }).click();
    await teacher.getByRole('button', { name: '학생과 학적', exact: true }).click();
    await teacher
      .locator('.student-row')
      .filter({ hasText: '김민수' })
      .getByRole('button', { name: '학생 상담' })
      .click();
    await expect(teacher.getByRole('dialog')).toContainText('서버 API 연결이 막혔어요.');
    await teacher.screenshot({ path: 'docs/v02-mentoring.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});
test('materials match technology topics and description search; new learning panels remain accessible', async ({
  page,
  context,
}) => {
  await open(page);
  await role(page, 'MASTER');
  await page.getByRole('button', { name: '자료실', exact: true }).click();
  await page
    .locator('.material-card')
    .filter({ hasText: 'AI와 함께 만드는' })
    .getByRole('button', { name: /기술 주제 설정/ })
    .click();
  await page.getByRole('dialog').getByRole('checkbox', { name: 'DB 기초' }).check();
  await page.getByRole('dialog').getByRole('button', { name: '기술 주제 저장' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('textbox', { name: '교안 제목 검색' }).fill('부담 없이');
  await expect(page.locator('.material-card')).toHaveCount(1);
  await role(page, '학생');
  const created = await (
    await context.request.post('/api/projects', {
      headers,
      data: { ...emptyProject(), title: 'v02 교안 연결 프로젝트' },
    })
  ).json();
  await context.request.patch(`/api/projects/${created.id}/learning`, {
    headers,
    data: {
      analysis: {
        productType: 'WEB',
        frontend: null,
        backend: null,
        database: true,
        externalApi: null,
        aiModel: null,
        deployment: null,
        difficulty: '',
      },
    },
  });
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: '내 프로젝트', exact: true }).click();
  await page.locator('.project-card').filter({ hasText: 'v02 교안 연결 프로젝트' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '기술·로드맵', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.recommended-materials')).toContainText(
    'AI와 함께 만드는',
  );
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});
test('expanded classroom renders 30+ characters, follows a collision-safe route and supports focus and zoom', async ({
  page,
  context,
}) => {
  test.setTimeout(75000);
  const accepted: { userId: string; x: number; y: number }[] = [];
  page.on('websocket', (socket) =>
    socket.on('framereceived', (event) => {
      try {
        const message = JSON.parse(String(event.payload));
        if (message.type === 'move') accepted.push(message);
      } catch {}
    }),
  );
  await open(page);
  await role(page, 'MASTER');
  for (let i = 0; i < 30; i++) {
    const inv = await (
      await context.request.post('/api/invitations', { headers, data: { label: `확장 검증 ${i}` } })
    ).json();
    const enrolled = await fetch('http://127.0.0.1:5174/api/register', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: inv.key,
        email: `ui-scale-${i}@example.com`,
        password: 'ui-scale-student-password',
        name: `확장 메이커 ${i}`,
        appearance: defaultAppearance,
      }),
    });
    expect(enrolled.status).toBe(201);
  }
  const login = await context.request.post('/api/login', {
    headers,
    data: { email: 'ui-scale-29@example.com', password: 'ui-scale-student-password' },
  });
  expect(login.status()).toBe(200);
  await expect
    .poll(async () => (await (await context.request.get('/api/state')).json()).desks.length)
    .toBeGreaterThanOrEqual(30);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.map-online')).toContainText('접속 중');
  const s = await (await context.request.get('/api/state')).json();
  expect(s.world.height).toBeGreaterThan(2000);
  const world = page.locator('.game-host');
  await expect(world).toHaveAttribute('data-y', String(s.world.height - 75));
  const oldZoom = Number(await world.getAttribute('data-zoom'));
  await page.locator('canvas').hover();
  await page.mouse.wheel(0, -120);
  await expect
    .poll(async () => Number(await world.getAttribute('data-zoom')))
    .toBeGreaterThan(oldZoom);
  await page.getByRole('button', { name: '전체 화면', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await page.getByRole('button', { name: '교실 확대', exact: true }).click();
  await page.getByRole('button', { name: '교실 축소', exact: true }).click();
  await page.getByRole('button', { name: '집중 모드', exact: true }).click();
  await expect(page.locator('.game-container')).toHaveClass(/focus-mode/);
  await page.getByRole('button', { name: '집중 모드 종료', exact: true }).click();
  await page.getByRole('button', { name: '선생님에게', exact: true }).click();
  await expect
    .poll(
      async () =>
        Math.hypot(
          Number(await world.getAttribute('data-x')) - 372,
          Number(await world.getAttribute('data-y')) - 245,
        ),
      { timeout: 25000 },
    )
    .toBeLessThan(8);
  await page.screenshot({ path: 'docs/v02-expanded-classroom.png', fullPage: true });
  await page.getByRole('button', { name: '내 책상으로', exact: true }).click();
  const desk = s.desks.find((d: any) => d.id === s.me.deskId);
  await expect
    .poll(
      async () =>
        Math.hypot(
          Number(await world.getAttribute('data-x')) - desk.x,
          Number(await world.getAttribute('data-y')) - (desk.y + 80),
        ),
      { timeout: 25000 },
    )
    .toBeLessThan(8);
  await expect
    .poll(
      () => {
        const last = accepted.filter((position) => position.userId === s.me.id).at(-1);
        return last ? Math.hypot(last.x - desk.x, last.y - desk.y - 80) : Infinity;
      },
      { timeout: 5000 },
    )
    .toBeLessThan(30);
  await page.getByRole('button', { name: '내 위치', exact: true }).click();
  await page.screenshot({ path: 'docs/v02-classroom-back-rows.png', fullPage: true });
  await page.getByRole('button', { name: '내 프로젝트', exact: true }).click();
  await page.getByRole('button', { name: '교실', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.map-online')).toContainText('접속 중');
  await expect
    .poll(async () =>
      Math.hypot(
        Number(await world.getAttribute('data-x')) - desk.x,
        Number(await world.getAttribute('data-y')) - (desk.y + 80),
      ),
    )
    .toBeLessThan(30);
  await page.getByRole('button', { name: '교실 조작 안내' }).click();
  const before = await world.getAttribute('data-x');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  expect(await world.getAttribute('data-x')).toBe(before);
  await page.keyboard.press('Escape');
});
