import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  placeNameplate,
  overlaps,
  NameplateLayoutCache,
  type LabelRect,
} from '../shared/nameplates';
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
test('stationary nameplates reuse one bounded layout and invalidate position, priority and camera changes', () => {
  const cache = new NameplateLayoutCache(),
    bounds = { x: 0, y: 0, width: 800, height: 600 };
  const items = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    anchor: { x: 300 + (i % 3), y: 500, width: 100, height: 24 },
  }));
  const initial = cache.layout(items, bounds);
  for (let i = 0; i < 300; i++)
    assert.equal(
      cache.layout(
        items.map((item) => ({ ...item, anchor: { ...item.anchor } })),
        { ...bounds },
      ),
      initial,
    );
  assert.equal(cache.computations, 1);
  assert.equal(cache.hits, 300);
  const changed = items.map((v, i) =>
    i === 0 ? { ...v, anchor: { ...v.anchor, x: v.anchor.x + 1 } } : v,
  );
  assert.notEqual(cache.layout(changed, bounds), initial);
  const before = cache.computations;
  cache.layout(changed.toReversed(), bounds);
  cache.layout(changed, { ...bounds, width: 390 });
  assert.equal(cache.computations, before + 2);
  const visible = [...initial.values()].filter((v): v is LabelRect => !!v);
  for (const [i, a] of visible.entries())
    assert.ok(visible.slice(i + 1).every((b) => !overlaps(a, b)));
});
