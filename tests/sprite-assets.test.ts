import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { SPRITE_ASSETS } from '../src/game/sprite-assets/generated';
import {
  spriteChoices,
  spriteSamples,
  upgradeSprite,
  archiveSpriteAppearance,
} from '../shared/sprite-appearance';
import { appearanceSchema } from '../shared/appearance-schema';
import { defaultAppearance } from '../shared/types';
function pngPixels(file: Buffer) {
  assert.equal(file.toString('hex', 0, 8), '89504e470d0a1a0a');
  const width = file.readUInt32BE(16),
    height = file.readUInt32BE(20);
  assert.equal(file[24], 8);
  assert.equal(file[25], 6);
  const chunks: Buffer[] = [];
  for (let at = 8; at < file.length;) {
    const n = file.readUInt32BE(at),
      tag = file.toString('ascii', at + 4, at + 8);
    if (tag === 'IDAT') chunks.push(file.subarray(at + 8, at + 8 + n));
    at += n + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)),
    stride = width * 4,
    out = Buffer.alloc(width * height * 4);
  let input = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[input++];
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x,
        left = x >= 4 ? out[at - 4] : 0,
        up = y ? out[at - stride] : 0,
        corner = y && x >= 4 ? out[at - stride - 4] : 0;
      let predict = 0;
      if (filter === 1) predict = left;
      else if (filter === 2) predict = up;
      else if (filter === 3) predict = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - corner,
          dl = Math.abs(p - left),
          du = Math.abs(p - up),
          dc = Math.abs(p - corner);
        predict = dl <= du && dl <= dc ? left : du <= dc ? up : corner;
      } else assert.equal(filter, 0);
      out[at] = (raw[input++] + predict) & 255;
    }
  }
  return { width, height, pixels: out };
}
test('PNG-authored sprite layers match their exact compiled pixels, binary alpha and recorded checksum', () => {
  const names = Object.keys(SPRITE_ASSETS);
  assert.ok(names.length >= 100);
  assert.deepEqual(
    readdirSync('src/game/sprite-assets/png')
      .filter((x) => x.endsWith('.png'))
      .sort(),
    names.map((x) => x + '.png').sort(),
  );
  for (const [name, asset] of Object.entries(SPRITE_ASSETS)) {
    const file = readFileSync('src/game/sprite-assets/png/' + name + '.png');
    assert.equal(createHash('sha256').update(file).digest('hex'), asset.sha256, name);
    const png = pngPixels(file);
    assert.equal(png.width, asset.width);
    assert.equal(png.height, asset.height);
    const packed = Buffer.from(asset.rle, 'base64');
    let at = 0;
    for (let i = 0; i < packed.length; i += 3) {
      const n = packed.readUInt16LE(i),
        index = packed[i + 2];
      assert.ok(n > 0 && index < asset.palette.length, name);
      for (let p = 0; p < n; p++, at++) {
        if (!index) assert.equal(png.pixels[at * 4 + 3], 0, name);
        else {
          assert.equal(png.pixels[at * 4 + 3], 255, name);
          const rgb = asset.palette[index].hex;
          for (let c = 0; c < 3; c++)
            assert.equal(
              png.pixels[at * 4 + c],
              parseInt(rgb.slice(1 + c * 2, 3 + c * 2), 16),
              name,
            );
        }
      }
    }
    assert.equal(at, asset.width * asset.height, name);
  }
});
test('all curated v2 choices validate while unsupported versions, URLs and malformed indexes are rejected', () => {
  const a = upgradeSprite(defaultAppearance);
  assert.equal(appearanceSchema.safeParse(a).success, true);
  for (const [key, values] of Object.entries(spriteChoices)) {
    for (let i = 0; i < values.length; i++)
      assert.equal(
        appearanceSchema.safeParse({ ...a, sprite: { ...a.sprite, [key]: i } }).success,
        true,
        key,
      );
    for (const i of [-1, values.length, 1.2, '1'])
      assert.equal(
        appearanceSchema.safeParse({ ...a, sprite: { ...a.sprite, [key]: i } }).success,
        false,
        key,
      );
  }
  for (const sprite of [
    { version: 3 },
    { ...a.sprite, source: 'https://example.invalid/file.png' },
    { ...a.sprite, headwear: 'javascript:bad' },
    { version: 1, faceShape: 0 },
  ])
    assert.equal(appearanceSchema.safeParse({ ...a, sprite }).success, false);
  for (const sample of spriteSamples) {
    const { name, ...look } = sample;
    assert.ok(name);
    assert.equal(appearanceSchema.safeParse({ ...defaultAppearance, ...look }).success, true);
  }
});
test('read-time migration is deterministic, leaves original student appearance untouched and supports explicit v1 recovery', () => {
  const legacy = Object.freeze({
    ...defaultAppearance,
    hairstyle: 16,
    outfit: 24,
    skin: '#734b38',
    body: 2,
  });
  const snapshot = JSON.stringify(legacy),
    a = upgradeSprite(legacy),
    b = upgradeSprite(legacy);
  assert.equal(JSON.stringify(legacy), snapshot);
  assert.deepEqual(a, b);
  assert.notEqual(a, legacy);
  for (const [key, value] of Object.entries(legacy))
    assert.deepEqual(a[key as keyof typeof a], value);
  assert.equal(a.sprite.version, 2);
  assert.equal(a.sprite.hairStyle, 7);
  assert.equal(a.sprite.outfitStyle, 7);
  assert.equal(a.sprite.faceShape, 3);
  assert.deepEqual(upgradeSprite(a), a);
  assert.notEqual(upgradeSprite(a).sprite, a.sprite);
  const customized = { ...a, sprite: { ...a.sprite, eyeSize: 2, eyeSpacing: 0, hairStyle: 6 } };
  const archived = archiveSpriteAppearance(customized);
  assert.equal(archived.sprite?.version, 1);
  assert.deepEqual(upgradeSprite(archived), customized);
  assert.equal(appearanceSchema.safeParse(archived).success, true);
  const recovered = { ...legacy, sprite: { version: 1 as const } };
  assert.equal(appearanceSchema.safeParse(recovered).success, true);
  assert.equal(upgradeSprite(recovered).sprite.version, 2);
});
