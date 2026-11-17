import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPRITE_ASSETS } from '../src/game/sprite-assets/generated';
import type { SpriteAsset } from '../src/game/spriteTypes';

function pixels(asset: SpriteAsset) {
  const out: number[] = [],
    bytes = Buffer.from(asset.rle, 'base64');
  for (let i = 0; i < bytes.length; i += 3)
    for (let j = 0; j < bytes.readUInt16LE(i); j++) out.push(bytes[i + 2]);
  return out;
}
function eyeMeasures(asset: SpriteAsset) {
  const data = pixels(asset),
    split = asset.splitX ?? asset.width / 2;
  return [0, 1].map((side) => {
    let l = asset.width,
      r = -1,
      t = asset.height,
      b = -1,
      n = 0,
      xs = 0;
    for (let y = 0; y < asset.height; y++)
      for (let x = 0; x < asset.width; x++) {
        const i = data[y * asset.width + x];
        if (!i || Number(x >= split) !== side) continue;
        l = Math.min(l, x);
        r = Math.max(r, x);
        t = Math.min(t, y);
        b = Math.max(b, y);
        if (asset.palette[i].material === 'eyes') {
          n++;
          xs += x;
        }
      }
    return {
      width: r - l + 1,
      height: b - t + 1,
      top: t,
      bottom: b,
      gaze: n ? (xs / n - l) / (r - l) : undefined,
    };
  });
}
test('paired eye artwork keeps near/far proportions, baseline and gaze coherent instead of a half-width far eye', () => {
  const before = JSON.parse(
    readFileSync('docs/face-proportions/before/geometry-assets.json', 'utf8'),
  ).assets as Record<string, SpriteAsset>;
  const old = eyeMeasures(before['eyes-0']);
  assert.ok(
    old[1].width / old[0].width < 0.8,
    'frozen original reproduces disproportionate far eye',
  );
  for (let i = 0; i < 9; i++) {
    const [a, b] = eyeMeasures(SPRITE_ASSETS['eyes-' + i]);
    assert.ok(b.width / a.width >= 0.9 && b.width / a.width <= 1.1, `eye ${i}: width ratio`);
    assert.equal(a.top, b.top, `eye ${i}: top`);
    assert.equal(a.bottom, b.bottom, `eye ${i}: baseline`);
    if (a.gaze !== undefined && b.gaze !== undefined)
      assert.ok(Math.abs(a.gaze - b.gaze) < 0.1, `eye ${i}: divergent gaze`);
  }
});
test('new face layers stay clean and tapered while the existing hair, clothing and equipment PNG bytes stay intact', () => {
  const before = JSON.parse(
    readFileSync('docs/face-proportions/before/asset-identity.json', 'utf8'),
  ) as Record<string, string>;
  let retained = 0;
  for (const [key, asset] of Object.entries(SPRITE_ASSETS)) {
    if (!/^(face|eyes|brows|mouth)-/.test(key)) {
      assert.equal(asset.sha256, before[key], key);
      retained++;
    }
  }
  assert.equal(retained, 82);
  for (let i = 0; i < 4; i++) {
    const a = SPRITE_ASSETS['face-' + i],
      d = pixels(a);
    assert.ok(
      a.palette.slice(1).every((p) => p.material === 'skin'),
      'no pigment/blush speckles',
    );
    const row = (y: number) => d.slice(y * a.width, (y + 1) * a.width).filter(Boolean).length;
    assert.ok(
      row(Math.floor(a.height * 0.85)) < row(Math.floor(a.height * 0.55)),
      'jaw tapers below cheeks',
    );
    assert.ok(SPRITE_ASSETS['mouth-' + i].width <= 6, 'small mouth');
    assert.ok(
      SPRITE_ASSETS['mouth-' + i].palette.some((p) => p.material === 'mouth'),
      'skin-aware lip pigment',
    );
  }
});
