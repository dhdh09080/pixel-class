import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
const open = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.map-online')).toContainText('접속 중');
};
test('classroom arrows do not scroll when a game toolbar or touch button retains focus', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  await page.getByRole('button', { name: '교실 확대', exact: true }).click();
  const before = await page.evaluate(() => scrollY);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowDown');
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await page.setViewportSize({ width: 390, height: 844 });
  const down = page.getByRole('button', { name: '터치로 아래쪽 이동', exact: true });
  await down.focus();
  await expect
    .poll(() =>
      down.evaluate((button) => {
        const box = button.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === button;
      }),
    )
    .toBe(true);
  const mobileScroll = await page.evaluate(() => scrollY);
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => scrollY)).toBe(mobileScroll);
  const box = (await down.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(mobileScroll);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: '교실 조작 안내', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
});
test('MASTER changes school labels in the UI and retains them on refresh with a direct classroom shortcut', async ({
  page,
}) => {
  await open(page);
  await page.locator('.demo-switch').getByRole('button', { name: 'MASTER', exact: true }).click();
  await expect(page.locator('.header-profile small')).toHaveText('MASTER');
  await page.getByRole('button', { name: '학교·교실 이름 바꾸기', exact: true }).click();
  await page.getByLabel('학교 이름', { exact: true }).fill('다희의 AI 교실');
  await page.getByLabel('기수 이름', { exact: true }).fill('나의 AI 서비스 3기');
  await page.getByLabel('교실 이름', { exact: true }).fill('다희의 프로젝트 스튜디오');
  await page.getByRole('button', { name: '학교 이름 저장하기', exact: true }).click();
  await expect(page.locator('.breadcrumbs')).toContainText('나의 AI 서비스 3기');
  await page.reload();
  await expect(page.locator('.breadcrumbs')).toContainText('나의 AI 서비스 3기');
  await expect(
    page.getByRole('heading', { name: '다희의 프로젝트 스튜디오', exact: true }),
  ).toBeVisible();
  // Restore shared demo labels so unrelated regression tests keep deterministic state.
  await page.getByRole('button', { name: '학교·교실 이름 바꾸기', exact: true }).click();
  await page.getByLabel('기수 이름', { exact: true }).fill('AI 메이커스 1기');
  await page.getByLabel('교실 이름', { exact: true }).fill('다희의 AI 교실');
  await page.getByRole('button', { name: '학교 이름 저장하기', exact: true }).click();
});
for (const width of [1440, 390])
  test(`visual character studio at ${width}px selects, saves and renders detailed clothing without dropdowns`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await open(page);
    await page.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('select')).toHaveCount(0);
    await dialog.getByRole('button', { name: '헤어스타일: 양갈래 브레이드', exact: true }).click();
    await dialog.getByRole('button', { name: '모자', exact: true }).click();
    await dialog.getByRole('button', { name: '모자 종류: 모자 벗기', exact: true }).click();
    await dialog.getByRole('button', { name: '의상', exact: true }).click();
    await dialog.getByRole('button', { name: '의상 종류: 리본 드레스', exact: true }).click();
    await dialog.getByRole('button', { name: '의상 색상 #a85e73', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: '의상 종류: 리본 드레스', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    const preview = dialog.locator('.character-preview > .avatar');
    const src = await preview.getAttribute('src');
    const dimensions = await preview.evaluate((image: HTMLImageElement) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    }));
    expect(dimensions).toEqual({ width: 192, height: 256 });
    await dialog.getByRole('button', { name: '캐릭터 오른쪽으로 돌리기' }).click();
    await expect(preview).not.toHaveAttribute('src', src!);
    await dialog.getByRole('button', { name: '캐릭터 왼쪽으로 돌리기' }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    for (const category of ['얼굴', '체형', '모자', '의상']) {
      await dialog.getByRole('button', { name: category, exact: true }).click();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    mkdirSync('docs/character-studio', { recursive: true });
    await page.screenshot({ path: `docs/character-studio/after-${width}.png`, fullPage: true });
    await dialog.getByRole('button', { name: '이 모습으로 저장하기', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(page.locator('canvas')).toBeVisible();
    const state = await (await context.request.get('/api/state')).json();
    expect(state.me.appearance.outfit).toBe(3);
    expect(state.me.appearance.hairstyle).toBe(8);
    expect(state.me.appearance.helmetStyle).toBe(1);
    expect(state.me.appearance.outfitColor).toBe('#a85e73');
    await page.screenshot({ path: `docs/character-studio/classroom-${width}.png`, fullPage: true });
  });

test('every visual catalog option renders distinct pixels, with matching logical character dimensions in every pose', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const characterPath = '/src/game/character.ts',
      appearancePath = '/shared/appearance.ts',
      typePath = '/shared/types.ts';
    const { characterCanvas, CHARACTER_SCALE, CHARACTER_WIDTH, CHARACTER_HEIGHT } = await import(
      characterPath
    );
    const { appearanceOptions } = await import(appearancePath);
    const { defaultAppearance } = await import(typePath);
    const counts: Record<string, number[]> = {};
    for (const [key, values] of Object.entries(appearanceOptions) as [string, string[]][]) {
      const images = new Set(
        values.map((_, index) =>
          characterCanvas({
            ...defaultAppearance,
            helmetStyle: key === 'helmetPattern' ? 0 : 1,
            [key]: index,
          }).toDataURL(),
        ),
      );
      counts[key] = [images.size, values.length];
    }
    const poses = [];
    for (const direction of ['down', 'right', 'up', 'left'])
      for (let frame = 0; frame < 3; frame++) {
        const sprite = characterCanvas(defaultAppearance, direction, frame);
        poses.push([sprite.width, sprite.height]);
      }
    const seated = characterCanvas(defaultAppearance, 'up', 0, true);
    // A rear view must not expose the front face through the hair's lower curve.
    // An unmistakable red skin fixture separates face pixels from hair/hat colors.
    const rearFacePixels = appearanceOptions.hairstyle.map((_: string, hairstyle: number) => {
      const sprite = characterCanvas(
        { ...defaultAppearance, skin: '#ff0000', helmetStyle: 1, hairstyle },
        'up',
      );
      const pixels = sprite
        .getContext('2d')!
        .getImageData(0, 0, CHARACTER_WIDTH, CHARACTER_HEIGHT).data;
      let count = 0;
      for (let y = 88; y < 140; y++)
        for (let x = 48; x < 144; x++) {
          const at = (y * CHARACTER_WIDTH + x) * 4;
          if (pixels[at] > pixels[at + 1] * 2 && pixels[at] > pixels[at + 2] * 2) count++;
        }
      return count;
    });
    return {
      counts,
      poses,
      rearFacePixels,
      seated: [seated.width, seated.height],
      logicalHeight: CHARACTER_HEIGHT * CHARACTER_SCALE,
    };
  });
  for (const [unique, expected] of Object.values(result.counts)) expect(unique).toBe(expected);
  expect(result.rearFacePixels).toEqual(Array(10).fill(0));
  expect(result.poses).toHaveLength(12);
  for (const pose of result.poses) expect(pose).toEqual([192, 256]);
  expect(result.seated).toEqual([192, 256]);
  expect(result.logicalHeight).toBeCloseTo(64 * 1.15);
});

test('art-directed presets preserve skin and body, stay drafts until saved and retain their layers after refresh', async ({
  page,
  context,
}) => {
  await open(page);
  const original = (await (await context.request.get('/api/state')).json()).me;
  await page.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '스타일 프리셋: 크림 리본', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: '스타일 프리셋: 크림 리본', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect((await (await context.request.get('/api/state')).json()).me.appearance).toEqual(
    original.appearance,
  );
  await dialog.getByRole('button', { name: '이 모습으로 저장하기', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  const saved = (await (await context.request.get('/api/state')).json()).me.appearance;
  expect(saved).toMatchObject({
    skin: original.appearance.skin,
    body: original.appearance.body,
    hairstyle: 1,
    outfit: 3,
    helmetStyle: 1,
    outfitColor: '#ded4bd',
    accentColor: '#af7c91',
  });
  await page.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '스타일 프리셋: 라벤더 웨이브', exact: true }).click();
  await dialog.getByRole('button', { name: '모자', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: '모자 색상 #f7f6ed', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  expect((await (await context.request.get('/api/state')).json()).me.appearance).toEqual(saved);
  // Return this shared demo identity to its original look for unrelated regression flows.
  expect(
    (
      await context.request.patch('/api/me', {
        headers: { 'X-Pixel-Class': '1' },
        data: { appearance: original.appearance },
      })
    ).ok(),
  ).toBeTruthy();
});

test('fine native art adds real half-size details while preserving world and desk footprints', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const cp = '/src/game/character.ts',
      wp = '/src/game/worldArt.ts',
      tp = '/shared/types.ts';
    const { characterCanvas, CHARACTER_SCALE } = await import(cp),
      { worldCanvas, deskCanvas, robotCanvas, WORLD_ART_SCALE } = await import(wp),
      { defaultAppearance } = await import(tp);
    const character = characterCanvas({
      ...defaultAppearance,
      helmetStyle: 1,
      hairstyle: 1,
      outfit: 3,
    });
    const world = worldCanvas(700),
      desk = deskCanvas(),
      robot = robotCanvas();
    const details = (canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let blocks = 0,
        partial = 0;
      for (let at = 3; at < data.length; at += 4) if (data[at] > 0 && data[at] < 255) partial++;
      for (let y = 0; y < canvas.height - 1; y += 2)
        for (let x = 0; x < canvas.width - 1; x += 2) {
          const at = (y * canvas.width + x) * 4;
          if (
            [4, canvas.width * 4, canvas.width * 4 + 4].some((delta) =>
              [0, 1, 2, 3].some((channel) => data[at + channel] !== data[at + delta + channel]),
            )
          )
            blocks++;
        }
      return { blocks, partial };
    };
    return {
      character: [character.width, character.height],
      logical: [character.width * CHARACTER_SCALE, character.height * CHARACTER_SCALE],
      world: [world.width, world.height],
      robot: [robot.width, robot.height],
      desk: [desk.width, desk.height],
      worldLogical: [world.width * WORLD_ART_SCALE, world.height * WORLD_ART_SCALE],
      deskLogical: [desk.width * WORLD_ART_SCALE, desk.height * WORLD_ART_SCALE],
      characterDetails: details(character),
      worldDetails: details(world),
      deskDetails: details(desk),
      deterministic:
        character.toDataURL() ===
        characterCanvas({
          ...defaultAppearance,
          helmetStyle: 1,
          hairstyle: 1,
          outfit: 3,
        }).toDataURL(),
    };
  });
  expect(result.character).toEqual([192, 256]);
  expect(result.logical[0]).toBeCloseTo(55.2);
  expect(result.logical[1]).toBeCloseTo(73.6);
  expect(result.world).toEqual([2240, 1400]);
  expect(result.robot).toEqual([96, 112]);
  expect(result.worldLogical).toEqual([1120, 700]);
  expect(result.desk).toEqual([264, 232]);
  expect(result.deskLogical).toEqual([132, 116]);
  expect(result.characterDetails.blocks).toBeGreaterThan(300);
  expect(result.worldDetails.blocks).toBeGreaterThan(100);
  expect(result.deskDetails.blocks).toBeGreaterThan(30);
  expect(result.characterDetails.partial).toBe(0);
  expect(result.deterministic).toBe(true);
});
