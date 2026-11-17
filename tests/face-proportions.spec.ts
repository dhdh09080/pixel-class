import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
test('all face/eye/size/spacing choices fit and small mouths remain visible across skin tones', async ({
  page,
}) => {
  await page.goto('/character-art');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const result = await page.evaluate(async () => {
    const cp = '/src/game/spriteCharacter.ts',
      sp = '/shared/sprite-appearance.ts',
      tp = '/shared/types.ts',
      ap = '/shared/appearance.ts',
      bp = '/src/game/sprite-assets/generated.ts';
    const { spriteDiagnostics, spriteCharacterCanvas, SPRITE_RIG } = await import(cp),
      { upgradeSprite } = await import(sp),
      { defaultAppearance } = await import(tp),
      { appearanceColors } = await import(ap),
      { SPRITE_ASSETS } = await import(bp);
    const bad = [],
      actualPixelBad = [];
    let cases = 0;
    const decode = (asset: any) => {
      const b = atob(asset.rle),
        data: number[] = [];
      for (let i = 0; i < b.length; i += 3)
        for (let n = 0; n < b.charCodeAt(i) + (b.charCodeAt(i + 1) << 8); n++)
          data.push(b.charCodeAt(i + 2));
      return data;
    };
    for (let faceShape = 0; faceShape < 4; faceShape++) {
      const face = SPRITE_ASSETS['face-' + faceShape],
        mask = decode(face),
        fx = SPRITE_RIG.faces[faceShape].x,
        fy = SPRITE_RIG.chinY - face.height;
      for (let eyeStyle = 0; eyeStyle < 9; eyeStyle++)
        for (let eyeSize = 0; eyeSize < 3; eyeSize++)
          for (let eyeSpacing = 0; eyeSpacing < 3; eyeSpacing++)
            for (const direction of ['down', 'right']) {
              const a = upgradeSprite({ ...defaultAppearance, eyes: '#01fe02' });
              a.sprite = {
                ...a.sprite,
                headwear: 'none',
                faceShape,
                eyeStyle,
                eyeSize,
                eyeSpacing,
              };
              const diag = spriteDiagnostics(a, direction),
                c = spriteCharacterCanvas(a, direction),
                data = c.getContext('2d')!.getImageData(0, 0, 120, 160).data;
              cases++;
              if (diag.irisOutsideFace || diag.edgePixels || diag.partialAlpha)
                bad.push({ faceShape, eyeStyle, eyeSize, eyeSpacing, direction, ...diag });
              let outside = 0;
              // Inspect the actual rendered green iris pixels, independently of eye-coordinate diagnostics.
              for (let y = 40; y < SPRITE_RIG.chinY; y++)
                for (let x = 20; x < 110; x++) {
                  const at = (y * 120 + x) * 4;
                  if (
                    !data[at + 3] ||
                    data[at + 1] < 35 ||
                    data[at + 1] <= Math.max(data[at], data[at + 2]) * 1.3
                  )
                    continue;
                  if (
                    x < fx ||
                    x >= fx + face.width ||
                    y < fy ||
                    y >= fy + face.height ||
                    !mask[(y - fy) * face.width + x - fx]
                  )
                    outside++;
                }
              if (outside)
                actualPixelBad.push({
                  faceShape,
                  eyeStyle,
                  eyeSize,
                  eyeSpacing,
                  direction,
                  outside,
                });
            }
    }
    const luminance = (rgb: number[]) =>
      rgb
        .map((n) => {
          n /= 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        })
        .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = appearanceColors.skin.map((skin: string) => {
      const a = upgradeSprite({ ...defaultAppearance, skin });
      a.sprite.headwear = 'none';
      const c = spriteCharacterCanvas(a),
        d = c.getContext('2d')!.getImageData(0, 0, 120, 160).data;
      const skinL = luminance([1, 3, 5].map((i) => parseInt(skin.slice(i, i + 2), 16))),
        ratios = [];
      for (let y = SPRITE_RIG.mouth[1]; y < SPRITE_RIG.mouth[1] + 2; y++)
        for (let x = SPRITE_RIG.mouth[0] - 2; x < SPRITE_RIG.mouth[0] + 3; x++) {
          const p = (y * 120 + x) * 4,
            L = luminance(Array.from(d.slice(p, p + 3)));
          ratios.push((Math.max(skinL, L) + 0.05) / (Math.min(skinL, L) + 0.05));
        }
      return { skin, ratio: Math.max(...ratios) };
    });
    return { cases, bad, actualPixelBad, contrast };
  });
  mkdirSync('docs/face-proportions/qa', { recursive: true });
  writeFileSync(
    'docs/face-proportions/qa/face-matrix.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  expect(result.actualPixelBad).toEqual([]);
  expect(result.bad).toEqual([]);
  for (const c of result.contrast) expect(c.ratio, c.skin).toBeGreaterThanOrEqual(2);
});
test('high resolution face-source components compile without variadic argument overflow', async ({
  page,
}) => {
  await page.goto('/character-art');
  const dimensions = await page.evaluate(async () => {
    const p = '/scripts/avatar-asset-raster.mjs';
    const { atlas } = await import(p);
    return (await atlas('/docs/face-proportions/source/face-bases.png', 4, 1)).map((p: any) => [
      p.canvas.width,
      p.canvas.height,
    ]);
  });
  expect(dimensions).toHaveLength(4);
  for (const [w, h] of dimensions) {
    expect(w).toBeGreaterThan(300);
    expect(h).toBeGreaterThan(300);
  }
});
