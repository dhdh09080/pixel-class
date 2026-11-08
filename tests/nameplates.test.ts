import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeNameplate, overlaps, type LabelRect } from '../shared/nameplates';
test('dense nameplates remain within the camera and yield instead of overlapping', () => {
  for (const zoom of [0.65, 1, 1.8]) {
    const bounds = { x: 0, y: 0, width: 390 / zoom, height: 380 / zoom };
    const placed: LabelRect[] = [];
    for (let i = 0; i < 30; i++) {
      const label = placeNameplate(
        {
          x: i % 2 ? 0 : bounds.width,
          y: bounds.height - 50,
          width: 130 / zoom,
          height: 26 / zoom,
        },
        placed,
        bounds,
      );
      if (label) placed.push(label);
    }
    assert.ok(placed.length > 0 && placed.length < 30);
    for (const [i, a] of placed.entries()) {
      assert.ok(a.x - a.width / 2 >= 0 && a.x + a.width / 2 <= bounds.width);
      assert.ok(a.y - a.height / 2 >= 0 && a.y + a.height / 2 <= bounds.height);
      assert.ok(placed.slice(i + 1).every((b) => !overlaps(a, b)));
    }
  }
});
