export const WORLD = { width: 1120, height: 700 };
export const initialDesks = [
  { id: 'desk-1', x: 300, y: 307 },
  { id: 'desk-2', x: 535, y: 307 },
  { id: 'desk-3', x: 770, y: 307 },
  { id: 'desk-4', x: 300, y: 487 },
  { id: 'desk-5', x: 535, y: 487 },
  { id: 'desk-6', x: 770, y: 487 },
];
export type Rect = { x: number; y: number; w: number; h: number };
export const staticObstacles: Rect[] = [
  { x: 420, y: 155, w: 170, h: 60 },
  { x: 65, y: 240, w: 116, h: 96 },
  { x: 965, y: 210, w: 100, h: 134 },
  { x: 950, y: 470, w: 112, h: 120 },
  { x: 70, y: 465, w: 100, h: 107 },
];
export const deskObstacle = (d: { x: number; y: number }): Rect => ({
  x: d.x - 55,
  y: d.y - 28,
  w: 110,
  h: 60,
});
export function canStand(x: number, y: number, desks: { x: number; y: number }[]) {
  return (
    x >= 45 &&
    x <= 1075 &&
    y >= 220 &&
    y <= 660 &&
    ![...staticObstacles, ...desks.map(deskObstacle)].some(
      (r) => x > r.x - 14 && x < r.x + r.w + 14 && y > r.y - 8 && y < r.y + r.h + 12,
    )
  );
}
export function validDesk(x: number, y: number, desks: { x: number; y: number }[]) {
  if (x < 230 || x > 870 || y < 285 || y > 565) return false;
  return !desks.some((d) => Math.abs(d.x - x) < 150 && Math.abs(d.y - y) < 120);
}
