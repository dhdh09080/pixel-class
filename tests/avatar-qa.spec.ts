import { test, expect } from '@playwright/test';
test('occupational headwear keeps front insignia off rear views while preserving selectable equipment', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  const result = await page.evaluate(async () => {
    const characterPath = '/src/game/character.ts',
      typesPath = '/shared/types.ts';
    const { characterCanvas, CHARACTER_WIDTH, CHARACTER_HEIGHT, CHARACTER_DENSITY } = await import(
        characterPath
      ),
      { defaultAppearance } = await import(typesPath);
    return [5, 6, 7, 8].map((helmetStyle) => {
      const count = (direction: 'down' | 'up') => {
        const c = characterCanvas(
            { ...defaultAppearance, helmetStyle, helmetPattern: 0, accentColor: '#ff00ff' },
            direction,
          ),
          data = c.getContext('2d')!.getImageData(0, 0, CHARACTER_WIDTH, CHARACTER_HEIGHT).data;
        let n = 0;
        for (let y = 20 * CHARACTER_DENSITY; y < 32 * CHARACTER_DENSITY; y++)
          for (let x = 20 * CHARACTER_DENSITY; x < 40 * CHARACTER_DENSITY; x++) {
            const i = (y * CHARACTER_WIDTH + x) * 4;
            if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 255 && data[i + 3] === 255)
              n++;
          }
        return n;
      };
      return { helmetStyle, front: count('down'), rear: count('up') };
    });
  });
  for (const item of result) {
    expect(item.front).toBeGreaterThan(0);
    expect(item.rear, `front insignia visible behind headwear ${item.helmetStyle}`).toBe(0);
  }
});
