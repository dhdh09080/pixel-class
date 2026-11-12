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

/** Retain only the latest complete layout; a changed anchor/order/viewport invalidates it. */
export class NameplateLayoutCache {
  private key = '';
  private result: ReadonlyMap<string, LabelRect | undefined> = new Map();
  computations = 0;
  hits = 0;
  layout(items: { id: string; anchor: LabelRect }[], bounds: LabelBounds) {
    const key = JSON.stringify([
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      items.map((i) => [i.id, i.anchor.x, i.anchor.y, i.anchor.width, i.anchor.height]),
    ]);
    if (key === this.key) {
      this.hits++;
      return this.result;
    }
    const occupied: LabelRect[] = [],
      result = new Map<string, LabelRect | undefined>();
    for (const item of items) {
      const value = placeNameplate(item.anchor, occupied, bounds);
      result.set(item.id, value);
      if (value) occupied.push(value);
    }
    this.key = key;
    this.result = result;
    this.computations++;
    return result;
  }
}
