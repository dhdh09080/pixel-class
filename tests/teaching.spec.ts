import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('teaching day: invite, select character, enroll, assign, submit, feedback and recover a student', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.locator('.demo-switch').getByRole('button', { name: 'MASTER', exact: true }).click();
  await expect(page.locator('.header-profile small')).toHaveText('MASTER');
  await page.getByRole('button', { name: '교무실', exact: true }).click();
  await page.getByRole('button', { name: '입학 초대', exact: true }).click();
  await page.getByText('여러 학생 초대 링크 한 번에 만들기', { exact: true }).click();
  await page.getByLabel('초대할 학생 수').fill('1');
  await page.getByRole('button', { name: '개별 초대 링크 일괄 발급' }).click();
  const links = page.getByLabel('개별 초대 링크 목록');
  await expect(links).toHaveValue(/invite=/);
  const url = (await links.inputValue()).split(': ').slice(1).join(': ');
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 390, height: 844 },
  });
  const student = await context.newPage();
  const email = 'today-' + Date.now() + '@example.com';
  const errors: string[] = [];
  student.on('pageerror', (e) => errors.push(e.message));
  try {
    await student.goto(url);
    await student.getByLabel('이름', { exact: true }).fill('오늘의 교육생');
    await student.getByLabel('이메일', { exact: true }).fill(email);
    await student.getByLabel('비밀번호', { exact: true }).fill('today-student-password');
    await student.getByRole('button', { name: '캐릭터 스타일 2', exact: true }).click();
    await expect(
      student.getByRole('button', { name: '캐릭터 스타일 2', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      (await new AxeBuilder({ page: student }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    await student.getByRole('button', { name: '캐릭터 스타일 4', exact: true }).click();
    await student.getByRole('button', { name: '입학하고 교실 입장하기' }).click();
    await expect(student.locator('canvas')).toBeVisible();
    const original = await (await context.request.get('/api/state')).json();
    expect(original.me.appearance.accessory).toBe(2);
    await expect
      .poll(async () =>
        (await (await page.request.get('/api/state')).json()).members.some(
          (m: any) => m.id === original.me.id,
        ),
      )
      .toBe(true);
    await page.getByRole('button', { name: '수업과 과제', exact: true }).click();
    await page.getByText('새 과제 배정하기', { exact: true }).click();
    await page.getByLabel('과제 제목', { exact: true }).fill('오늘 교육 결과물');
    await page.getByLabel('할 일과 제출 안내').fill('나의 첫 화면과 배운 점을 제출해 주세요.');
    await page.getByLabel('마감일 · 한국 시간').fill('2099-11-10T18:00');
    await page.getByLabel('과제 대상').selectOption(original.me.id);
    await page.getByRole('button', { name: '과제 배정', exact: true }).click();
    const card = page.locator('.assignment-card').filter({ hasText: '오늘 교육 결과물' });
    await expect(card).toContainText('미제출 1명');
    await student.getByRole('button', { name: '수업과 과제', exact: true }).click();
    await student
      .getByLabel('오늘 교육 결과물 제출 내용')
      .fill('첫 화면을 만들었고 입력과 저장을 배웠어요.');
    await student
      .getByLabel('오늘 교육 결과물 결과물 링크 (선택)')
      .fill('https://example.com/my-project');
    await student.getByRole('button', { name: '과제 제출', exact: true }).click();
    await expect(student.locator('.student-submission')).toContainText('제출 완료');
    await expect(card).toContainText('제출 1명 · 미제출 0명');
    await card.getByText('학생별 제출물과 피드백', { exact: true }).click();
    await card
      .getByLabel('과제 피드백', { exact: true })
      .fill('잘했어요. 다음에는 저장한 목록을 만들어 보세요.');
    await card.getByRole('button', { name: '과제 피드백 저장' }).click();
    await expect(student.locator('.homework-feedback')).toContainText('저장한 목록');
    expect(
      (await new AxeBuilder({ page: student }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await student.screenshot({
      path: test.info().outputPath('student-homework.png'),
      fullPage: true,
    });
    await page.screenshot({ path: test.info().outputPath('teacher-homework.png'), fullPage: true });
    await page.getByRole('button', { name: '내 계정과 운영', exact: true }).click();
    await expect(page.getByRole('heading', { name: '학교 저장 공간과 백업' })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: '학교 첨부파일 저장 공간' })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    await page.getByRole('button', { name: '교무실', exact: true }).click();
    await page.getByText('학생 비밀번호 복구', { exact: true }).click();
    await page.getByLabel('복구할 학생').selectOption(original.me.id);
    await page.getByRole('button', { name: '복구 링크 발급', exact: true }).click();
    const recovery = page.getByLabel('학생에게 전달할 복구 링크');
    await expect(recovery).toHaveValue(/reset=/);
    await student.goto(await recovery.inputValue());
    await expect(student.getByRole('heading', { name: '비밀번호를 다시 설정해요' })).toBeVisible();
    await student.getByLabel('비밀번호', { exact: true }).fill('today-student-new-password');
    await student.getByRole('button', { name: '새 비밀번호 저장', exact: true }).click();
    await expect(student.getByRole('heading', { name: '다시 만나 반가워요' })).toBeVisible();
    await student.getByLabel('이메일', { exact: true }).fill(email);
    await student.getByLabel('비밀번호', { exact: true }).fill('today-student-new-password');
    await student.getByRole('button', { name: '교실 입장하기', exact: true }).click();
    await expect(student.locator('canvas')).toBeVisible();
    const restored = await (await context.request.get('/api/state')).json();
    expect(restored.me.id).toBe(original.me.id);
    expect(restored.me.appearance).toEqual(original.me.appearance);
    await student.getByRole('button', { name: '수업과 과제', exact: true }).click();
    await expect(student.locator('.homework-feedback')).toContainText('저장한 목록');
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
