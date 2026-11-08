export type LabelRect = { x: number; y: number; width: number; height: number };
export type LabelBounds = { x: number; y: number; width: number; height: number };
export function overlaps(a: LabelRect, b: LabelRect, gap = 4) {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap
  );
}
/** Priority callers place themselves first. Crowded secondary names yield rather than overlap. */
export function placeNameplate(
  anchor: LabelRect,
  occupied: LabelRect[],
  bounds: LabelBounds,
): LabelRect | undefined {
  const half = anchor.width / 2,
    vertical = anchor.height / 2;
  const left = bounds.x + half + 4,
    right = bounds.x + bounds.width - half - 4;
  if (left > right) return undefined;
  const x = Math.max(left, Math.min(right, anchor.x));
  for (let level = 0; level < 10; level++) {
    const y = anchor.y - level * (anchor.height + 5);
    const candidate = { ...anchor, x, y };
    if (y - vertical < bounds.y + 4 || y + vertical > bounds.y + bounds.height - 4) continue;
    if (!occupied.some((other) => overlaps(candidate, other))) return candidate;
  }
  return undefined;
}
