import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { defaultAppearance } from '../shared/types';

const evidence = 'docs/signup-flow';
async function account(page: Page) {
  await page.getByLabel('이메일', { exact: true }).fill('learner@example.test');
  await page.getByLabel('비밀번호', { exact: true }).fill('classroom-test-password');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('classroom-test-password');
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/enrollment/config', (route) =>
    route.fulfill({
      json: {
        approvalRegistrationEnabled: true,
        acceptingApplications: true,
        schoolName: '다희의 AI 교실',
        demo: false,
        bootstrap: false,
        aiConfigured: false,
      },
    }),
  );
  await page.route('**/api/enrollment/session', (route) =>
    route.fulfill({ status: 401, json: { error: '로그인이 필요합니다.' } }),
  );
});

test('signup separates account and character, preserves back navigation, and writes only at final submission', async ({
  page,
}) => {
  const submissions: Record<string, any>[] = [];
  await page.route('**/api/enrollment/register', (route) => {
    submissions.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: '연결을 다시 확인해 주세요.' } });
  });
  await page.goto('/join');
  await expect(page.getByRole('heading', { name: '교실에 로그인해요' })).toBeVisible();
  await page.getByRole('button', { name: '회원가입 신청', exact: true }).click();
  await expect(page.getByRole('heading', { name: '먼저 계정을 만들어요' })).toBeFocused();
  await expect(page.getByLabel('이름', { exact: true })).toHaveCount(0);
  await account(page);
  await page.getByRole('button', { name: '다음: 캐릭터 선택' }).click();
  await expect(page.getByRole('heading', { name: '교실에서 만날 나의 모습' })).toBeFocused();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveCount(0);
  expect(submissions).toEqual([]);
  await page.getByLabel('이름', { exact: true }).fill('처음 온 학생');
  await page.getByRole('button', { name: '캐릭터 스타일 2', exact: true }).click();
  const selected = await page.locator('.signup-preview img').getAttribute('src');
  await page.getByRole('button', { name: '회원가입 신청', exact: true }).click();
  await expect(page.getByRole('heading', { name: '교실에서 만날 나의 모습' })).toBeVisible();
  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  await expect(page.getByLabel('이메일', { exact: true })).toHaveValue('learner@example.test');
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('classroom-test-password');
  await page.getByRole('button', { name: '다음: 캐릭터 선택' }).click();
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('처음 온 학생');
  await expect(page.locator('.signup-preview img')).toHaveAttribute('src', selected!);
  await page.getByRole('button', { name: '가입 신청 보내기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('연결을 다시 확인해 주세요.');
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    email: 'learner@example.test',
    name: '처음 온 학생',
    appearance: { hairstyle: 1 },
  });
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('처음 온 학생');
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(
    'classroom-test-password',
  );
});

test('password mismatch, duplicate email and pending submission keep the correct step and prevent duplicate writes', async ({
  page,
}) => {
  await page.goto('/join?register=1');
  await account(page);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('different-test-password');
  await page.getByRole('button', { name: '다음: 캐릭터 선택' }).click();
  await expect(page.getByLabel('비밀번호 확인', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('비밀번호 확인', { exact: true })).toBeFocused();
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('classroom-test-password');
  await page.getByRole('button', { name: '다음: 캐릭터 선택' }).click();
  await page.getByLabel('이름', { exact: true }).fill('중복 신청 검사');
  let writes = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/enrollment/register', async (route) => {
    writes++;
    await pending;
    await route.fulfill({
      status: 409,
      json: { error: '이미 가입한 이메일이에요. 로그인해 주세요.' },
    });
  });
  await page.getByRole('button', { name: '가입 신청 보내기', exact: true }).click();
  await expect(page.getByRole('button', { name: '신청을 보내는 중…' })).toBeDisabled();
  await page.keyboard.press('Enter');
  expect(writes).toBe(1);
  release();
  await expect(page.getByRole('heading', { name: '먼저 계정을 만들어요' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('이미 가입한 이메일');
  await expect(page.getByLabel('이메일', { exact: true })).toHaveValue('learner@example.test');
});

test('character studio cancellation preserves the chosen look and recovery is a secondary login action', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/join?register=1');
  await account(page);
  await page.getByRole('button', { name: '다음: 캐릭터 선택' }).click();
  expect(
    await page
      .locator('.enrollment-form-stage')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await page.getByLabel('이름', { exact: true }).fill('꾸미기 학생');
  const original = await page.locator('.signup-preview img').getAttribute('src');
  await page.getByRole('button', { name: '더 자세히 꾸미기', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '헤어스타일: 웨이브 단발', exact: true }).click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.signup-preview img')).toHaveAttribute('src', original!);
  await expect(page.getByRole('button', { name: '더 자세히 꾸미기', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: '비밀번호를 잊으셨나요?', exact: true }).click();
  await expect(page.getByRole('heading', { name: '비밀번호를 다시 설정해요' })).toBeVisible();
  await expect(page.getByLabel('비밀번호 복구 KEY')).toBeVisible();
});

test('recovery saves a new password and pending-account login returns to the approval screen', async ({
  page,
}) => {
  const reset = 'a'.repeat(64);
  let signedIn = false;
  await page.route('**/api/enrollment/session', (route) =>
    signedIn
      ? route.fulfill({
          json: {
            id: 'qa-pending',
            name: '대기 학생',
            appearance: defaultAppearance,
            status: 'PENDING',
            schoolName: '다희의 AI 교실',
          },
        })
      : route.fulfill({ status: 401, json: { error: '로그인이 필요합니다.' } }),
  );
  await page.route('**/api/enrollment/recover', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      key: reset,
      password: 'new-classroom-password',
    });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/join?reset=' + reset);
  await page.getByLabel('비밀번호', { exact: true }).fill('new-classroom-password');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('new-classroom-password');
  await page.getByRole('button', { name: '새 비밀번호 저장' }).click();
  await expect(page.getByRole('heading', { name: '교실에 로그인해요' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('새 비밀번호를 저장했어요');
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('');
  await expect(page).toHaveURL(/\?login=1$/);
  await page.route('**/api/enrollment/login', (route) => {
    signedIn = true;
    return route.fulfill({ json: { ok: true, status: 'PENDING' } });
  });
  await page.getByLabel('이메일', { exact: true }).fill('pending@example.test');
  await page.getByLabel('비밀번호', { exact: true }).fill('new-classroom-password');
  await page.getByRole('button', { name: '로그인하고 교실로' }).click();
  await expect(page.getByRole('heading', { name: '가입 신청을 보냈어요' })).toBeVisible();
  await expect(page).toHaveURL(/\/join$/);
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test(
    'login and signup steps fit the viewport and pass AA checks at ' + viewport.width,
    async ({ page }) => {
      const samples: {
        step: string;
        primaryButtonBottom: number;
        viewportHeight: number;
        noHorizontalOverflow: boolean;
        axeAaViolations: number;
      }[] = [];
      await page.setViewportSize(viewport);
      mkdirSync(evidence, { recursive: true });
      await page.goto('/join');
      for (const step of ['login', 'account', 'character']) {
        if (step === 'account')
          await page.getByRole('button', { name: '회원가입 신청', exact: true }).click();
        if (step === 'character') {
          await account(page);
          await page.getByRole('button', { name: '다음: 캐릭터 선택' }).click();
        }
        const button = page.getByRole('button', {
          name:
            step === 'login'
              ? '로그인하고 교실로'
              : step === 'account'
                ? '다음: 캐릭터 선택'
                : '가입 신청 보내기',
          exact: true,
        });
        const bounds = await button.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.screenshot({
          path: evidence + '/' + step + '-' + viewport.width + '.png',
          fullPage: true,
        });
        samples.push({
          step,
          primaryButtonBottom: bounds!.y + bounds!.height,
          viewportHeight: viewport.height,
          noHorizontalOverflow: true,
          axeAaViolations: 0,
        });
      }
      writeFileSync(
        evidence + '/metrics-' + viewport.width + '.json',
        JSON.stringify(
          {
            environment: 'local Playwright with enrollment API mocked; no account created',
            viewport,
            samples,
          },
          null,
          2,
        ) + '\n',
      );
    },
  );
}
