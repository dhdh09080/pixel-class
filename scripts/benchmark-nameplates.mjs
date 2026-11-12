import { placeNameplate, NameplateLayoutCache } from '../shared/nameplates.ts';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Run with node --import tsx scripts/benchmark-nameplates.mjs.
// This isolates stationary label layout; it does not measure browser FPS or Railway bills.
const bounds = { x: 0, y: 0, width: 800, height: 600 };
const items = Array.from({ length: 30 }, (_, i) => ({
  id: String(i),
  anchor: { x: 300 + (i % 3), y: 500, width: 100, height: 24 },
}));
const cache = new NameplateLayoutCache();
function original() {
  const occupied = [];
  for (const item of items) {
    const value = placeNameplate(item.anchor, occupied, bounds);
    if (value) occupied.push(value);
  }
  return occupied;
}
assert.deepEqual([...cache.layout(items, bounds).values()].filter(Boolean), original());
const iterations = 5000;
function time(operation) {
  const began = performance.now();
  for (let i = 0; i < iterations; i++) operation();
  return Number((performance.now() - began).toFixed(3));
}
for (let i = 0; i < 500; i++) {
  original();
  cache.layout(items, bounds);
}
const rounds = [];
for (let i = 0; i < 9; i++) {
  let beforeMs, afterMs;
  if (i % 2) {
    afterMs = time(() => cache.layout(items, bounds));
    beforeMs = time(original);
  } else {
    beforeMs = time(original);
    afterMs = time(() => cache.layout(items, bounds));
  }
  rounds.push({ beforeMs, afterMs });
}
const median = (key) => rounds.map((r) => r[key]).sort((a, b) => a - b)[4];
const beforeMs = median('beforeMs'),
  afterMs = median('afterMs');
const report = {
  measuredAt: new Date().toISOString(),
  kind: 'Nine alternating warm rounds of stationary crowded label placement only; not FPS, total CPU or billing. Host may run other QA.',
  iterationsPerRound: iterations,
  characters: items.length,
  rounds,
  medianBeforeMs: beforeMs,
  medianAfterMs: afterMs,
  observedMedianReductionPercent: Number(((1 - afterMs / beforeMs) * 100).toFixed(1)),
};
const output = process.env.QA_OUTPUT_DIR || 'docs/overnight/performance';
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'nameplate-repeat.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
