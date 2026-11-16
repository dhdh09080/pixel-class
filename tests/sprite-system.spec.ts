import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const evidence = 'docs/sprite-redesign/qa';
async function openStudio(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.map-online')).toContainText('접속 중');
  await page.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true }).click();
  const d = page.getByRole('dialog'),
    m = d.getByRole('button', { name: '새 캐릭터로 꾸미기', exact: true });
  if (await m.count()) await m.click();
  return d;
}
test('eight genuine sprite samples have clean bounds, native pixels and two visible aligned irises', async ({
  page,
}) => {
  await page.goto('/character-art');
  await expect(page.getByRole('heading', { name: '작은 도트, 저마다의 이야기' })).toBeVisible();
  const result = await page.evaluate(async () => {
    const p = '/src/game/spriteCharacter.ts',
      s = '/shared/sprite-appearance.ts',
      t = '/shared/types.ts',
      c = '/src/game/character.ts';
    const { spriteDiagnostics } = await import(p),
      { spriteSamples } = await import(s),
      { defaultAppearance } = await import(t),
      { legacyCharacterCanvas } = await import(c);
    const samples = spriteSamples.map(({ name, ...look }: { name: string }) => ({
      name,
      ...spriteDiagnostics({ ...defaultAppearance, ...look }),
    }));
    const reference = new Image();
    reference.src = '/docs/rounded-120/after-0.png';
    await reference.decode();
    const can = document.createElement('canvas');
    can.width = 120;
    can.height = 160;
    can.getContext('2d')!.drawImage(reference, 0, 0);
    const old = can.getContext('2d')!.getImageData(0, 0, 120, 160).data,
      newOld = legacyCharacterCanvas(defaultAppearance)
        .getContext('2d')!
        .getImageData(0, 0, 120, 160).data;
    return {
      samples,
      legacyMismatches: Array.from(old).filter((value, i) => value !== newOld[i]).length,
    };
  });
  mkdirSync(evidence, { recursive: true });
  writeFileSync(`${evidence}/sample-diagnostics.json`, JSON.stringify(result, null, 2) + '\n');
  expect(result.legacyMismatches).toBe(0);
  for (const r of result.samples) {
    expect(r.edgePixels, r.name).toBe(0);
    expect(r.partialAlpha, r.name).toBe(0);
    expect(r.irisOutsideFace, r.name).toBe(0);
    expect(r.eyeBaselineDifference, r.name).toBeLessThanOrEqual(3);
    for (const v of r.irisVisible) expect(v, r.name).toBeGreaterThanOrEqual(50);
    expect(r.colors, r.name).toBeLessThanOrEqual(96);
  }
});
test('each v2 shape, eye size/spacing and equipment choice changes actual art without rewriting legacy values', async ({
  page,
}) => {
  await page.goto('/character-art');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const counts = await page.evaluate(async () => {
    const cp = '/src/game/character.ts',
      sp = '/shared/sprite-appearance.ts',
      tp = '/shared/types.ts',
      ap = '/shared/appearance.ts';
    const { characterCanvas } = await import(cp),
      { upgradeSprite, spriteChoices } = await import(sp),
      { defaultAppearance } = await import(tp),
      { appearanceOptions } = await import(ap);
    const a = upgradeSprite(defaultAppearance);
    a.sprite.headwear = 'none';
    const counts = Object.fromEntries(
      Object.entries(spriteChoices).map(([key, values]: [string, any]) => [
        key,
        [
          new Set(
            values.map((_: string, i: number) =>
              characterCanvas({ ...a, sprite: { ...a.sprite, [key]: i } }).toDataURL(),
            ),
          ).size,
          values.length,
        ],
      ]),
    );
    counts.expression = [
      new Set(
        appearanceOptions.expression.map((_: string, expression: number) =>
          characterCanvas({ ...a, expression }).toDataURL(),
        ),
      ).size,
      appearanceOptions.expression.length,
    ];
    return counts;
  });
  for (const [key, values] of Object.entries(counts) as [string, number[]][])
    expect(values[0], key).toBe(values[1]);
});
test('face and eye controls keep irises inside every face shape across hair, size and spacing variants', async ({
  page,
}) => {
  await page.goto('/character-art');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const failures = await page.evaluate(async () => {
    const sp = '/shared/sprite-appearance.ts',
      tp = '/shared/types.ts',
      cp = '/src/game/spriteCharacter.ts';
    const { upgradeSprite } = await import(sp),
      { defaultAppearance } = await import(tp),
      { spriteDiagnostics } = await import(cp);
    const bad = [];
    for (let faceShape = 0; faceShape < 4; faceShape++)
      for (let hairStyle = 0; hairStyle < 8; hairStyle++)
        for (let eyeSize = 0; eyeSize < 3; eyeSize++)
          for (let eyeSpacing = 0; eyeSpacing < 3; eyeSpacing++) {
            const a = upgradeSprite({ ...defaultAppearance, eyes: '#278bd4' });
            a.sprite = {
              ...a.sprite,
              headwear: 'none',
              faceShape,
              hairStyle,
              eyeSize,
              eyeSpacing,
              eyeStyle: 0,
            };
            const d = spriteDiagnostics(a);
            if (d.irisOutsideFace || d.edgePixels || d.partialAlpha)
              bad.push({ faceShape, hairStyle, eyeSize, eyeSpacing, ...d });
          }
    return bad;
  });
  expect(failures).toEqual([]);
});
for (const width of [1366, 1280, 390])
  test(`sprite gallery and editor are accessible and fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 1280 ? 720 : 768 });
    await page.goto('/character-art');
    await expect(page.locator('.art-sample-card')).toHaveCount(8);
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
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/gallery-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '이전·새 모습', exact: true }).click();
    await page.screenshot({ path: `${evidence}/comparison-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '부위별 에셋', exact: true }).click();
    await expect(page.locator('.art-layer-grid article')).toHaveCount(8);
    const d = await openStudio(page);
    await expect(d.locator('select')).toHaveCount(0);
    await d.getByRole('button', { name: '얼굴', exact: true }).click();
    expect(
      await d.locator('.preview-name').evaluate((el) => {
        const r = el.getBoundingClientRect(),
          body = el.closest('dialog')!.querySelector('.modal-body')!.getBoundingClientRect();
        return r.top >= body.top && r.bottom <= body.bottom;
      }),
    ).toBe(true);
    await expect(
      d.getByRole('button', { name: '얼굴형: 갸름한 다이아형', exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: `${evidence}/studio-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await d.getByRole('button', { name: '취소', exact: true }).click();
  });
test('student saves independent v2 facial parts, reopens identical pixels and retains them in the classroom', async ({
  page,
  context,
}) => {
  const d = await openStudio(page);
  const original = (await (await context.request.get('/api/state')).json()).me.appearance;
  try {
    await d.getByRole('button', { name: '새 스타일 프리셋: 로즈 트윈', exact: true }).click();
    await d.getByRole('button', { name: '얼굴', exact: true }).click();
    expect(
      await d.locator('.preview-name').evaluate((el) => {
        const r = el.getBoundingClientRect(),
          body = el.closest('dialog')!.querySelector('.modal-body')!.getBoundingClientRect();
        return r.top >= body.top && r.bottom <= body.bottom;
      }),
    ).toBe(true);
    await d.getByRole('button', { name: '얼굴형: 포근한 볼형', exact: true }).click();
    await d.getByRole('button', { name: '눈매: 도도한 고양이 눈', exact: true }).click();
    await d.getByRole('button', { name: '눈 크기: 크게', exact: true }).click();
    await d.getByRole('button', { name: '눈 간격: 조금 좁게', exact: true }).click();
    await d.getByRole('button', { name: '액세서리: 실버 링 귀걸이', exact: true }).click();
    const before = await d.locator('.character-preview > .avatar').getAttribute('src');
    await d.getByRole('button', { name: '이 모습으로 저장하기', exact: true }).click();
    await expect(d).not.toBeVisible();
    const saved = (await (await context.request.get('/api/state')).json()).me.appearance;
    expect(saved.sprite).toMatchObject({
      version: 2,
      faceShape: 3,
      eyeStyle: 1,
      eyeSize: 2,
      eyeSpacing: 0,
      accessoryStyle: 3,
    });
    expect(saved.skin).toBe(original.skin);
    expect(saved.body).toBe(original.body);
    await page.reload();
    await expect(page.locator('.map-online')).toContainText('접속 중');
    await page.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true }).click();
    await expect(page.getByRole('dialog').locator('.character-preview > .avatar')).toHaveAttribute(
      'src',
      before!,
    );
    await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
    const scroll = await page.evaluate(() => scrollY);
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await page.screenshot({ path: `${evidence}/classroom-saved.png`, fullPage: true });
  } finally {
    await context.request.patch('/api/me', {
      headers: { 'X-Pixel-Class': '1' },
      data: { appearance: original },
    });
  }
});
test('rig origins preserve world foot coordinates when mirrored and reduced motion stops the sample walk loop', async ({
  page,
}) => {
  await page.goto('/character-art');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const data = await page.evaluate(async () => {
    const p = '/src/game/character.ts',
      s = '/shared/sprite-appearance.ts',
      t = '/shared/types.ts';
    const { characterOrigin } = await import(p),
      { upgradeSprite } = await import(s),
      { defaultAppearance } = await import(t);
    const a = upgradeSprite(defaultAppearance);
    return {
      down: characterOrigin(a, 'down'),
      left: characterOrigin(a, 'left'),
      legacy: characterOrigin({ ...a, sprite: { version: 1 } }, 'left'),
    };
  });
  expect(data.down.x * 120).toBeCloseTo(70);
  expect(data.left.x * 120).toBeCloseTo(50);
  expect(data.down.y * 160).toBeCloseTo(156);
  expect(data.legacy).toEqual({ x: 0.5, y: 1 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '걷기', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('움직임 줄이기');
});

test('all curated outfits and hair keep complete silhouettes in every body, pose and helmet state; rear views hide facial features', async ({
  page,
}) => {
  await page.goto('/character-art');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const result = await page.evaluate(async () => {
    const p = '/src/game/character.ts',
      s = '/shared/sprite-appearance.ts',
      t = '/shared/types.ts';
    const { characterCanvas } = await import(p),
      { spriteSamples } = await import(s),
      { defaultAppearance } = await import(t);
    const clipped = [];
    for (let i = 0; i < 8; i++)
      for (let body = 0; body < 4; body++)
        for (const headwear of ['none', 'hardhat'])
          for (const direction of ['down', 'up', 'left', 'right'])
            for (let frame = 0; frame < 3; frame++) {
              const a = {
                ...defaultAppearance,
                ...spriteSamples[i],
                body,
                sprite: { ...spriteSamples[i].sprite, headwear },
              };
              const c = characterCanvas(a, direction, frame);
              const d = c.getContext('2d')!.getImageData(0, 0, 120, 160).data;
              let edge = 0;
              for (let y = 0; y < 160; y++)
                for (let x = 0; x < 120; x++)
                  if ((!x || !y || x === 119 || y === 159) && d[(y * 120 + x) * 4 + 3]) edge++;
              if (edge) clipped.push({ i, body, headwear, direction, frame, edge });
            }
    const a = { ...defaultAppearance, ...spriteSamples[1] };
    const rear = characterCanvas(a, 'up').toDataURL();
    const changed = characterCanvas(
      {
        ...a,
        eyes: '#ff00ff',
        expression: 5,
        sprite: { ...a.sprite, faceShape: 3, eyeStyle: 8, browStyle: 3, mouthStyle: 3 },
      },
      'up',
    ).toDataURL();
    return { clipped, rearSame: rear === changed };
  });
  expect(result.clipped).toEqual([]);
  expect(result.rearSame).toBe(true);
});
