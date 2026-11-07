export type WorldSize = { width: number; height: number };
export type Point = { x: number; y: number };
export const WORLD: WorldSize = { width: 1120, height: 700 };
export const DESK_COLUMNS = [300, 535, 770];
export const MAX_DESK_ROWS = 40;
export const deskSlots = () =>
  Array.from({ length: MAX_DESK_ROWS * 3 }, (_, i) => ({
    x: DESK_COLUMNS[i % 3],
    y: 307 + Math.floor(i / 3) * 180,
  }));
export const initialDesks = deskSlots()
  .slice(0, 6)
  .map((p, i) => ({ id: `desk-${i + 1}`, ...p }));
export function worldSize(desks: Point[], minimum: WorldSize = WORLD): WorldSize {
  return {
    width: WORLD.width,
    height: Math.max(WORLD.height, minimum.height, ...desks.map((d) => d.y + 213)),
  };
}
export const spawnPoint = (world: WorldSize) => ({ x: 560, y: world.height - 75 });
export type Rect = { x: number; y: number; w: number; h: number };
export const staticObstacles: Rect[] = [
  { x: 420, y: 155, w: 170, h: 60 },
  { x: 65, y: 240, w: 116, h: 96 },
  { x: 965, y: 210, w: 100, h: 134 },
  { x: 950, y: 470, w: 112, h: 120 },
  { x: 70, y: 465, w: 100, h: 107 },
];
export const deskObstacle = (d: Point): Rect => ({ x: d.x - 55, y: d.y - 28, w: 110, h: 60 });
export function canStand(x: number, y: number, desks: Point[], world = worldSize(desks)) {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 45 &&
    x <= world.width - 45 &&
    y >= 220 &&
    y <= world.height - 40 &&
    ![...staticObstacles, ...desks.map(deskObstacle)].some(
      (r) => x > r.x - 14 && x < r.x + r.w + 14 && y > r.y - 8 && y < r.y + r.h + 12,
    )
  );
}
export function validDesk(x: number, y: number, desks: Point[]) {
  // Only the three desk lanes may be used: uninterrupted side and cross aisles remain open.
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    DESK_COLUMNS.some((c) => Math.abs(c - x) <= 25) &&
    y >= 285 &&
    y <= 307 + (MAX_DESK_ROWS - 1) * 180 + 25 &&
    !desks.some((d) => Math.abs(d.x - x) < 150 && Math.abs(d.y - y) < 120)
  );
}
export const nextDeskSlot = (desks: Point[]) => deskSlots().find((p) => validDesk(p.x, p.y, desks));
export function segmentClear(a: Point, b: Point, desks: Point[], world = worldSize(desks)) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
  for (let i = 0; i <= n; i++)
    if (!canStand(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, desks, world))
      return false;
  return true;
}
/** Four-neighbor A* on a 20px grid; shortcuts are permitted only after collision sampling. */
export function findPath(
  start: Point,
  target: Point,
  desks: Point[],
  world = worldSize(desks),
): Point[] {
  if (!canStand(start.x, start.y, desks, world)) return [];
  if (canStand(target.x, target.y, desks, world) && segmentClear(start, target, desks, world))
    return [target];
  const step = 20,
    cols = Math.floor((world.width - 80) / step) + 1,
    rows = Math.floor((world.height - 260) / step) + 1;
  const point = (i: number): Point => ({
    x: 40 + (i % cols) * step,
    y: 220 + Math.floor(i / cols) * step,
  });
  const blocked = new Uint8Array(cols * rows);
  for (let i = 0; i < blocked.length; i++) {
    const p = point(i);
    blocked[i] = canStand(p.x, p.y, desks, world) ? 0 : 1;
  }
  const nearest = (p: Point, connect: boolean) => {
    const candidates = Array.from(blocked.keys())
      .filter((i) => !blocked[i])
      .map((i) => ({ i, d: Math.hypot(point(i).x - p.x, point(i).y - p.y) }))
      .sort((a, b) => a.d - b.d);
    return candidates.find((c) => !connect || segmentClear(p, point(c.i), desks, world))?.i ?? -1;
  };
  const from = nearest(start, true),
    to = nearest(target, false);
  if (from < 0 || to < 0) return [];
  const g = new Float64Array(blocked.length).fill(Infinity),
    parent = new Int32Array(blocked.length).fill(-1),
    closed = new Uint8Array(blocked.length);
  g[from] = 0;
  const goal = point(to),
    h = (i: number) => {
      const p = point(i);
      return (Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y)) / step;
    };
  const open = [from];
  while (open.length) {
    let at = 0;
    for (let j = 1; j < open.length; j++)
      if (g[open[j]] + h(open[j]) < g[open[at]] + h(open[at])) at = j;
    const current = open.splice(at, 1)[0];
    if (current === to) {
      const path: Point[] = [];
      for (let i = to; i !== -1; i = parent[i]) path.unshift(point(i));
      if (
        canStand(target.x, target.y, desks, world) &&
        segmentClear(path.at(-1)!, target, desks, world)
      )
        path.push(target);
      const simplified: Point[] = [];
      let anchor = start;
      for (let i = 0; i < path.length;) {
        let far = i;
        while (far + 1 < path.length && segmentClear(anchor, path[far + 1], desks, world)) far++;
        simplified.push(path[far]);
        anchor = path[far];
        i = far + 1;
      }
      return simplified;
    }
    closed[current] = 1;
    for (const neighbor of [current - 1, current + 1, current - cols, current + cols]) {
      if (
        neighbor < 0 ||
        neighbor >= blocked.length ||
        closed[neighbor] ||
        blocked[neighbor] ||
        Math.abs((neighbor % cols) - (current % cols)) > 1
      )
        continue;
      if (g[current] + 1 < g[neighbor]) {
        parent[neighbor] = current;
        g[neighbor] = g[current] + 1;
        if (!open.includes(neighbor)) open.push(neighbor);
      }
    }
  }
  return [];
}
