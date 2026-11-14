import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const evidence = 'docs/rounded-120';

test('fine native avatar art preserves clean edges, all equipment bounds and exact left/right mirroring', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  const result = await page.evaluate(async () => {
    const path = '/src/game/character.ts',
      types = '/shared/types.ts',
      catalog = '/shared/appearance.ts';
    const { characterCanvas, CHARACTER_WIDTH, CHARACTER_HEIGHT, CHARACTER_SCALE } = await import(
      path
    );
    const { defaultAppearance } = await import(types),
      { appearanceOptions } = await import(catalog);
    const clipped: string[] = [];
    for (const key of ['hairstyle', 'outfit', 'helmetStyle']) {
      for (let index = 0; index < appearanceOptions[key].length; index++) {
        for (const direction of ['down', 'up', 'right', 'left']) {
          for (let frame = 0; frame < 3; frame++) {
            const c = characterCanvas(
              { ...defaultAppearance, helmetStyle: 1, [key]: index },
              direction,
              frame,
            );
            const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
            let edge = false;
            for (let y = 0; y < c.height; y++)
              for (let x = 0; x < c.width; x++) {
                const alpha = d[(y * c.width + x) * 4 + 3];
                if (alpha !== 0 && alpha !== 255) throw Error('Antialiased native pixel');
                if ((x === 0 || y === 0 || x === c.width - 1 || y === c.height - 1) && alpha)
                  edge = true;
              }
            if (edge) clipped.push(`${key}/${index}/${direction}/${frame}`);
          }
        }
      }
    }
    const fixture = {
      ...defaultAppearance,
      helmetStyle: 1,
      hairstyle: 10,
      accessory: 1,
      outfit: 24,
    };
    const pixels = (direction: string) =>
      characterCanvas(fixture, direction)
        .getContext('2d')!
        .getImageData(0, 0, CHARACTER_WIDTH, CHARACTER_HEIGHT).data;
    const left = pixels('left'),
      right = pixels('right');
    let mismatch = 0;
    for (let y = 0; y < CHARACTER_HEIGHT; y++)
      for (let x = 0; x < CHARACTER_WIDTH; x++)
        for (let channel = 0; channel < 4; channel++)
          if (
            left[(y * CHARACTER_WIDTH + x) * 4 + channel] !==
            right[(y * CHARACTER_WIDTH + CHARACTER_WIDTH - 1 - x) * 4 + channel]
          )
            mismatch++;
    return {
      clipped,
      mismatch,
      world: [CHARACTER_WIDTH * CHARACTER_SCALE, CHARACTER_HEIGHT * CHARACTER_SCALE],
    };
  });
  expect(result.clipped).toEqual([]);
  expect(result.mismatch).toBe(0);
  expect(result.world[0]).toBeCloseTo(55.2);
  expect(result.world[1]).toBeCloseTo(73.6);
});

test('thirty unique layered avatars generate a bounded texture workload at the unchanged world size', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  const measurement = await page.evaluate(async () => {
    const path = '/src/game/character.ts',
      types = '/shared/types.ts';
    const { characterCanvas } = await import(path),
      { defaultAppearance } = await import(types);
    const start = performance.now();
    let count = 0,
      bytes = 0;
    for (let person = 0; person < 30; person++) {
      const appearance = {
        ...defaultAppearance,
        hairstyle: person % 18,
        outfit: person % 25,
        helmetStyle: person % 15,
      };
      for (const direction of ['down', 'left', 'up', 'right'])
        for (let frame = 0; frame < 3; frame++) {
          const c = characterCanvas(appearance, direction, frame);
          bytes += c.width * c.height * 4;
          count++;
        }
      const c = characterCanvas(appearance, 'up', 0, true);
      bytes += c.width * c.height * 4;
      count++;
    }
    return {
      people: 30,
      textures: count,
      rawTextureBytes: bytes,
      generationMs: performance.now() - start,
      scope:
        'isolated Chromium raster generation; not 30 simultaneous browsers or a frame-rate guarantee',
    };
  });
  expect(measurement.textures).toBe(390);
  expect(measurement.rawTextureBytes).toBe(29_952_000);
  // Broad regression guard, not a claim about real users' hardware.
  expect(measurement.generationMs).toBeLessThan(25000);
  mkdirSync(evidence, { recursive: true });
  writeFileSync(`${evidence}/texture-workload.json`, JSON.stringify(measurement, null, 2) + '\n');
  await testInfo.attach('texture-workload', {
    body: JSON.stringify(measurement),
    contentType: 'application/json',
  });
});

for (const width of [1366, 390])
  test(`rounded avatar preview and classroom remain usable at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('.map-online')).toContainText('접속 중');
    const original = (await (await context.request.get('/api/state')).json()).me.appearance;
    const fixture = {
      ...original,
      hairstyle: 1,
      helmetStyle: 1,
      accessory: 0,
      eyeShape: 5,
      outfit: 3,
      hair: '#be965e',
      eyes: '#497da4',
      outfitColor: '#ded4bd',
      accentColor: '#af7c91',
    };
    try {
      expect(
        (
          await context.request.patch('/api/me', {
            headers: { 'X-Pixel-Class': '1' },
            data: { appearance: fixture },
          })
        ).ok(),
      ).toBeTruthy();
      await page.reload();
      await expect(page.locator('.map-online')).toContainText('접속 중');
      await page.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true }).click();
      const dialog = page.getByRole('dialog'),
        preview = dialog.locator('.character-preview > .avatar');
      await expect(preview).toBeVisible();
      const dimensions = await preview.evaluate((img: HTMLImageElement) => ({
        width: img.naturalWidth,
        height: img.naturalHeight,
      }));
      expect(dimensions).toEqual({ width: 120, height: 160 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: `${evidence}/after-studio-${width}.png`, fullPage: true });
      await dialog.getByRole('button', { name: '취소', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      const y = await page.evaluate(() => scrollY);
      await page.keyboard.press('ArrowDown');
      expect(await page.evaluate(() => scrollY)).toBe(y);
      await page.screenshot({ path: `${evidence}/after-classroom-${width}.png`, fullPage: true });
      expect(errors).toEqual([]);
    } finally {
      expect(
        (
          await context.request.patch('/api/me', {
            headers: { 'X-Pixel-Class': '1' },
            data: { appearance: original },
          })
        ).ok(),
      ).toBeTruthy();
    }
  });
