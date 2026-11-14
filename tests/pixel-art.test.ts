import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PixelArt } from '../src/game/pixelArt';

test('density two supports a single native dot instead of duplicating a coarse 2×2 block', () => {
  const art = new PixelArt(16, 16, 2);
  art.rect(2.5, 3.5, 0.5, 0.5, '#ffffff');
  assert.equal(art.pixels.filter(Boolean).length, 1);
  assert.equal(art.pixels[7 * 16 + 5], 0xffffffff);
  assert.equal(art.pixels[7 * 16 + 6], 0);
});

test('layer outlines remain one native pixel at both drawing densities', () => {
  for (const density of [1, 2]) {
    const art = new PixelArt(24, 24, density);
    art.layer((part) => part.rect(4, 4, 3, 3, '#ffffff'), '#000000');
    const start = 4 * density;
    assert.equal(art.pixels[(start - 1) * 24 + start], 0xff000000);
    assert.equal(art.pixels[(start - 2) * 24 + start], 0);
    assert.equal(art.pixels[start * 24 + start], 0xffffffff);
  }
});

test('thin round eyewear retains the original face pixels inside the lens', () => {
  const art = new PixelArt(24, 24, 2);
  art.rect(0, 0, 12, 12, '#e8bb99');
  const face = art.pixels[12 * 24 + 12];
  art.ring(2, 2, 8, 8, '#334455');
  assert.equal(art.pixels[12 * 24 + 12], face);
  assert.notEqual(art.pixels[4 * 24 + 12], face);
  assert.equal(art.pixels[4 * 24 + 4], face);
});

test('curved silhouettes and strokes use only transparent or solid native pixels', () => {
  const art = new PixelArt(32, 32, 2);
  art.path(
    [
      ['M', 2, 12],
      ['C', 2, 0, 14, 0, 14, 12],
      ['Q', 8, 15, 2, 12],
    ],
    '#ffaa77',
  );
  art.curve(
    [
      [2, 12],
      [2, 0],
      [14, 0],
      [14, 12],
    ],
    '#443344',
  );
  assert.equal(art.pixels[4 * 32 + 4], 0);
  assert.notEqual(art.pixels[16 * 32 + 16], 0);
  for (const color of art.pixels) assert.ok(color === 0 || color >>> 24 === 255);
  const rows = Array.from(
    { length: 24 },
    (_, y) => art.pixels.slice(y * 32, (y + 1) * 32).filter(Boolean).length,
  );
  assert.ok(
    new Set(rows.filter(Boolean)).size > 5,
    'rounded contour needs several native step widths',
  );
});

test('density one keeps existing furniture coordinates and clips safely at canvas boundaries', () => {
  const art = new PixelArt(8, 8);
  art.rect(-2, -1, 5, 3, '#112233');
  assert.equal(art.pixels.filter(Boolean).length, 6);
  art.line(
    [
      [0, 7],
      [7, 7],
    ],
    '#ffffff',
  );
  assert.equal(art.pixels.slice(7 * 8).filter((pixel) => pixel === 0xffffffff).length, 8);
});
