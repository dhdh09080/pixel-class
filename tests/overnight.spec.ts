import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
test('MASTER operations show verified local backups, real runtime metrics and separate offsite limits at laptop and mobile sizes', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.locator('.demo-switch').getByRole('button', { name: 'MASTER', exact: true }).click();
  await page.getByRole('button', { name: '내 계정과 운영', exact: true }).click();
  const panel = page.getByRole('region', { name: '학교 운영 상태' });
  await expect(panel.getByText('마지막 API 응답 정상 · SQLite · 단일 인스턴스')).toBeVisible();
  await panel.getByRole('button', { name: '지금 서버 백업', exact: true }).click();
  await expect(panel.getByText(/마지막 무결성 검사 통과/)).toBeVisible();
  await panel.getByRole('button', { name: '백업 무결성 다시 확인' }).click();
  await expect(
    page.getByText('백업 파일의 해시와 DB 무결성을 확인했어요.', { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText('같은 Volume에 저장 · 별도 보관 확인 안 됨')).toBeVisible();
  mkdirSync('docs/overnight/operations', { recursive: true });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(panel.getByRole('link', { name: '학교 백업 내려받기' })).toBeVisible();
    expect(
      await panel
        .locator('.operations-actions .button')
        .evaluateAll((buttons) =>
          buttons.every(
            (button) =>
              button.scrollWidth <= button.clientWidth &&
              button.getBoundingClientRect().height >= 44,
          ),
        ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `docs/overnight/operations/status-${width}.png`,
      fullPage: true,
    });
  }
});
test('external judge polling pauses in hidden tabs, deduplicates pending reads and refreshes on visibility', async ({
  page,
}) => {
  const id = '11111111-1111-4111-8111-111111111111';
  let requests = 0,
    release: () => void = () => {};
  const response = {
    competition: {
      id,
      name: '백그라운드 요청 검증 대회',
      description: '네트워크를 불필요하게 사용하지 않아요.',
      state: 'UPCOMING',
      opensAt: '2030-01-01T00:00:00Z',
      submissionDueAt: '2030-01-02T00:00:00Z',
      judgingStartsAt: '2030-01-03T00:00:00Z',
      judgingEndsAt: '2030-01-04T00:00:00Z',
      resultsAt: '2030-01-05T00:00:00Z',
      visibility: 'PUBLIC',
      awardNames: [],
      minJudges: 1,
    },
    entries: [],
    serverNow: new Date().toISOString(),
  };
  await page.route(`**/api/public/competitions/${id}`, async (route) => {
    requests++;
    if (requests === 2)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill({
      json:
        requests === 2
          ? {
              ...response,
              competition: { ...response.competition, description: '재개한 응답 반영' },
            }
          : response,
    });
  });
  await page.clock.install();
  await page.goto('/competition/' + id);
  await expect(page.getByRole('heading', { name: response.competition.name })).toBeVisible();
  expect(requests).toBe(1);
  await page.evaluate(() =>
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }),
  );
  await page.clock.fastForward(120000);
  // Fetch dispatch crosses the renderer/network boundary after virtual timers run.
  // Observe a real quiet interval so an unconditional poll cannot pass by racing this assertion.
  await page.waitForTimeout(250);
  expect(requests).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => requests).toBe(2);
  await page.clock.fastForward(120000);
  await page.waitForTimeout(250);
  expect(requests).toBe(2);
  release();
  await expect(page.getByText('재개한 응답 반영', { exact: true })).toBeVisible();
  await page.clock.fastForward(60000);
  await expect.poll(() => requests).toBe(3);
});
