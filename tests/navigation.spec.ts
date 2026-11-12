import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
for (const width of [1280, 390])
  test(`MASTER navigation and footer remain reachable at ${width}px without page overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 844 });
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await page.locator('.demo-switch').getByRole('button', { name: 'MASTER', exact: true }).click();
    await expect(page.locator('.header-profile small')).toHaveText('MASTER');
    const sidebar = page.locator('.sidebar'),
      guide = sidebar.getByRole('button', { name: '이용 안내', exact: true }),
      avatar = sidebar.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true });
    for (const button of [guide, avatar]) {
      await expect(button).toBeInViewport();
      const b = (await button.boundingBox())!;
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(width === 1280 ? 720 : 844);
    }
    for (const name of [
      '교실',
      '프로젝트',
      '자료실',
      '수업과 과제',
      '전시실',
      '경진대회',
      '교무실',
    ]) {
      const button = sidebar.getByRole('button', { name, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-current', 'page');
    }
    await guide.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
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
  });
