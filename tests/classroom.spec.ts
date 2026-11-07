import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { emptyProject, defaultAppearance, type AppState, type Invitation } from '../shared/types';
const headers = { 'X-Pixel-Class': '1' };
async function openClass(page: Page) {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.map-online')).toContainText('접속 중');
}
async function switchRole(page: Page, role: '학생' | 'MASTER') {
  await page.locator('.demo-switch').getByRole('button', { name: role, exact: true }).click();
  await expect(page.locator('.header-profile small')).toHaveText(
    role === '학생' ? 'STUDENT' : 'MASTER',
  );
}
async function state(context: BrowserContext): Promise<AppState> {
  return (await context.request.get('/api/state')).json();
}
test('classroom renders, moves, collides, opens desks, and has no runtime errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openClass(page);
  const world = page.locator('.game-host');
  await expect(world).toHaveAttribute('data-x', '560');
  const scroll = await page.evaluate(() => window.scrollY);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.up('ArrowDown');
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(280);
  await page.keyboard.up('ArrowLeft');
  const x = Number(await world.getAttribute('data-x'));
  expect(x).toBeLessThan(545);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1650);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(150);
  const y = Number(await world.getAttribute('data-y'));
  expect(y).toBeGreaterThan(530);
  expect(y).toBeLessThan(560);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + (300 / 1120) * box.width, box.y + (307 / 700) * box.height);
  await expect(page.getByRole('dialog')).toContainText('김민수');
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '교실 조작 안내' }).click();
  await expect(page.getByRole('dialog')).toContainText('WASD');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'docs/classroom-desktop.png', fullPage: true });
});
test('student creates, updates, records, submits, receives MASTER feedback and persists on reload', async ({
  page,
  context,
}) => {
  await openClass(page);
  await page.getByRole('button', { name: '내 프로젝트', exact: true }).click();
  await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('프로젝트 이름').fill('브라우저 검증 프로젝트');
  await modal.getByLabel('프로젝트 목적').fill('현장 업무 시간을 줄이는 서비스');
  await modal.getByLabel('주요 기능').fill('기록 입력과 검색');
  await modal.getByRole('button', { name: '프로젝트 시작하기' }).click();
  await expect(modal).toContainText('브라우저 검증 프로젝트');
  await modal.getByRole('textbox', { name: '새 할 일' }).fill('첫 번째 화면 완성');
  await modal.getByRole('button', { name: '추가', exact: true }).click();
  await modal.getByRole('button', { name: '첫 번째 화면 완성', exact: true }).click();
  await expect(modal.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await modal.getByRole('button', { name: '개발 기록', exact: true }).click();
  await modal
    .getByRole('textbox', { name: '기록 내용' })
    .fill('입력 화면을 완성했어요. 다음에는 저장 기능을 추가할게요.');
  await modal.getByRole('button', { name: '기록 남기기' }).click();
  await expect(modal).toContainText('입력 화면을 완성했어요.');
  await modal.getByRole('button', { name: '질문', exact: true }).click();
  await modal
    .getByRole('textbox', { name: '기록 내용' })
    .fill('데이터를 어디에 저장하면 좋을까요?');
  await modal.getByRole('button', { name: '기록 남기기' }).click();
  await expect(modal).toContainText('데이터를 어디에 저장하면 좋을까요?');
  await modal.getByRole('button', { name: '프로젝트', exact: true }).click();
  await modal.getByRole('button', { name: '수정', exact: true }).click();
  await modal.getByLabel('프로젝트 이름').fill('수정한 검증 프로젝트');
  await modal.getByRole('button', { name: '변경사항 저장' }).click();
  await expect(modal).toContainText('수정한 검증 프로젝트');
  await modal.getByRole('button', { name: '검토 요청하기' }).click();
  await expect(modal.locator('.status')).toHaveText('검토 대기');
  await modal.getByRole('button', { name: '닫기', exact: true }).click();
  await switchRole(page, 'MASTER');
  await page.getByRole('button', { name: '교무실', exact: true }).click();
  await page.getByRole('button', { name: '프로젝트 지도', exact: true }).click();
  await page
    .locator('.mentoring-list article')
    .filter({ hasText: '수정한 검증 프로젝트' })
    .getByRole('button', { name: '프로젝트 지도' })
    .click();
  await modal.getByRole('button', { name: 'MASTER 피드백', exact: true }).click();
  await modal
    .getByRole('textbox', { name: 'MASTER 피드백 내용' })
    .fill('SQLite 저장부터 작은 단계로 시작해 보세요.');
  await modal.getByRole('button', { name: '피드백 남기기' }).click();
  await expect(modal).toContainText('SQLite 저장부터');
  await modal.getByRole('button', { name: '프로젝트', exact: true }).click();
  await modal.getByRole('button', { name: '검토 승인 및 완료 처리' }).click();
  await expect(modal.locator('.status')).toHaveText('완료');
  await modal.getByRole('button', { name: '닫기', exact: true }).click();
  await switchRole(page, '학생');
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  const s = await state(context);
  const p = s.projects.find((p) => p.title === '수정한 검증 프로젝트')!;
  expect(p.tasks[0].done).toBe(true);
  expect(p.updates[0].text).toContain('입력 화면');
  expect(p.questions[0].text).toContain('데이터');
  expect(p.feedback[0].text).toContain('SQLite');
  expect(p.approved).toBe(true);
});
test('customization saves the same character across reload and role changes', async ({
  page,
  context,
}) => {
  await openClass(page);
  await page.getByRole('button', { name: '나의 캐릭터 꾸미기' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('이름', { exact: true }).fill('김민수');
  await modal.getByLabel('헤어스타일').selectOption('1');
  await modal.getByLabel('얼굴 장식').selectOption('1');
  await modal.getByRole('button', { name: '이 모습으로 저장하기' }).click();
  await expect(modal).not.toBeVisible();
  const before = await state(context);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  const after = await state(context);
  expect(after.me.id).toBe(before.me.id);
  expect(after.me.appearance.hairstyle).toBe(1);
  expect(after.me.appearance.accessory).toBe(1);
});
test('invitation admission, two browsers, movement synchronization, chat and privacy', async ({
  page,
  browser,
  context,
}) => {
  await openClass(page);
  await switchRole(page, 'MASTER');
  await page.getByRole('button', { name: '교무실', exact: true }).click();
  await page.getByRole('button', { name: '입학 초대', exact: true }).click();
  await page.getByRole('textbox', { name: '초대 이름' }).fill('브라우저 신규 학생');
  await page.getByRole('button', { name: '초대 발급', exact: true }).click();
  const key = await page.locator('.invite-result code').innerText();
  expect(key.length).toBeGreaterThan(20);
  const other = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const student = await other.newPage();
  const studentErrors: string[] = [];
  student.on('pageerror', (e) => studentErrors.push(e.message));
  await student.goto('/?invite=' + key);
  await student.getByLabel('입학 초대 KEY').fill(key);
  await student.getByLabel('이름', { exact: true }).fill('새로운 메이커');
  await student.getByLabel('이메일').fill('browser-student@example.com');
  await student.getByLabel('비밀번호', { exact: true }).fill('browser-student-password');
  await student.getByRole('button', { name: '입학하고 교실 입장하기' }).click();
  await expect(student.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: '교실', exact: true }).click();
  await expect(page.locator('.map-online')).toContainText('2명');
  const s = await state(other);
  expect(s.me.deskId).toBeTruthy();
  expect(s.projects).not.toContainEqual(expect.objectContaining({ title: '수정한 검증 프로젝트' }));
  const moves: Record<string, unknown>[] = [];
  page.on('websocket', (ws) =>
    ws.on('framereceived', (event) => {
      try {
        const value = JSON.parse(String(event.payload));
        if (value.type === 'move') moves.push(value);
      } catch {}
    }),
  );
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await student.keyboard.down('ArrowRight');
  await student.waitForTimeout(380);
  await student.keyboard.up('ArrowRight');
  await expect.poll(() => moves.some((m) => m.userId === s.me.id && Number(m.x) > 580)).toBe(true);
  await student.getByRole('button', { name: '교실 이야기' }).click();
  await student.getByRole('textbox', { name: '교실 채팅 메시지' }).fill('두 브라우저 채팅 검증');
  await student.getByRole('button', { name: '채팅 보내기' }).click();
  await page.getByRole('button', { name: '교실 이야기' }).click();
  await expect(page.locator('.chat-messages')).toContainText('두 브라우저 채팅 검증');
  await page.getByRole('button', { name: '교무실', exact: true }).click();
  await page.getByRole('button', { name: '학생과 학적' }).click();
  const row = page.locator('.student-row').filter({ hasText: '새로운 메이커' });
  await row.getByRole('button', { name: '학적 관리' }).click();
  await row.getByLabel('학적 상태').selectOption('ON_LEAVE');
  await row.getByLabel('변경 사유').fill('브라우저 권한 검증을 위한 휴학');
  await row.getByRole('button', { name: '학적 변경 저장' }).click();
  await expect(student.getByRole('heading', { name: '잠시 쉬어가는 중이에요.' })).toBeVisible();
  expect(studentErrors).toEqual([]);
  await other.close();
});
test('materials upload, search, version replacement and authenticated download', async ({
  page,
  context,
}) => {
  await openClass(page);
  await switchRole(page, 'MASTER');
  await page.getByRole('button', { name: '자료실', exact: true }).click();
  await page.getByRole('button', { name: '교안 올리기' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('교안 제목').fill('브라우저 테스트 교안');
  await modal.getByLabel('설명', { exact: true }).fill('로컬 비공개 파일 검증');
  await modal.locator('input[type=file]').setInputFiles({
    name: 'test-guide.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# 테스트 교안\n안녕하세요'),
  });
  await modal.getByRole('button', { name: '교안 저장하기' }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole('textbox', { name: '교안 제목 검색' }).fill('브라우저 테스트');
  const card = page.locator('.material-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('v1');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('link', { name: '다운로드' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('test-guide.md');
  await card.getByRole('button', { name: '브라우저 테스트 교안 새 버전 업로드' }).click();
  await modal.locator('input[type=file]').setInputFiles({
    name: 'test-guide-v2.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# v2'),
  });
  await modal.getByRole('button', { name: '교안 저장하기' }).click();
  await expect(card).toContainText('v2');
});
test('mobile layout keeps controls usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openClass(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'docs/classroom-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '내 프로젝트', exact: true }).click();
  await expect(page.getByRole('heading', { name: '나의 프로젝트', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByLabel('프로젝트 이름').fill('모바일 임시 프로젝트');
  await page.getByRole('dialog').getByRole('button', { name: '프로젝트 시작하기' }).click();
  await expect(page.getByRole('dialog')).toContainText('모바일 임시 프로젝트');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '프로젝트 삭제', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: '삭제 확인', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.locator('.project-card').filter({ hasText: '모바일 임시 프로젝트' }),
  ).toHaveCount(0);
});

test('classroom and project form pass automated WCAG A/AA checks', async ({ page }) => {
  await openClass(page);
  const classroom = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(classroom.violations).toEqual([]);
  await page.getByRole('button', { name: '프로젝트 추가', exact: true }).click();
  const form = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(form.violations).toEqual([]);
});
