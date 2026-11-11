import type { Appearance } from '../../shared/types';
export const tint = (hex: string, target: string, amount: number) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(
        parseInt(hex.slice(i, i + 2), 16) * (1 - amount) +
          parseInt(target.slice(i, i + 2), 16) * amount,
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
type Point = [number, number];
/** Curved pixel clusters, a coherent upper-left light and one-native-pixel strands. */
export function hairArt(c: CanvasRenderingContext2D, a: Appearance, rear: boolean, back: boolean) {
  const base = a.hair,
    edge = tint(base, '#272338', 0.52),
    shadow = tint(base, '#30243f', 0.3),
    middle = tint(base, '#e7bda5', 0.15),
    light = tint(base, '#e2d9df', 0.28),
    glint = tint(base, '#e4d3c3', 0.29);
  const shape = (draw: () => void, color: string, outline = true) => {
    c.beginPath();
    draw();
    c.closePath();
    c.fillStyle = color;
    c.fill();
    if (outline) {
      c.lineWidth = 0.65;
      c.strokeStyle = edge;
      c.stroke();
    }
  };
  const line = (points: number[], color: string, width = 0.5) => {
    c.beginPath();
    c.moveTo(points[0], points[1]);
    c.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  };
  const mass = (long: boolean, wave = false) => {
    const bottom = long ? 100 : 83;
    const draw = () => {
      c.moveTo(22, 38);
      c.bezierCurveTo(9, 49, 20, 67, 14, bottom - 11);
      c.quadraticCurveTo(17, bottom + 1, 34, bottom - 4);
      c.quadraticCurveTo(46, bottom - 9, 59, bottom - 3);
      c.quadraticCurveTo(75, bottom + 2, 82, bottom - 10);
      c.bezierCurveTo(72, 70, 86, 43, 74, 25);
      c.bezierCurveTo(66, 10, 31, 8, 22, 24);
    };
    shape(draw, shadow);
    c.save();
    c.clip();
    for (let i = 0; i < 14; i++) {
      const x = 20 + i * 4.2,
        sway = wave ? Math.sin(i * 1.6) * 8 : (i - 6) * 0.7;
      line(
        [48 + (x - 48) * 0.6, 14, x - 6, 35, x + 8 + sway, 76, x - 2 + sway, bottom],
        i % 3 === 0 ? light : i % 3 === 1 ? base : middle,
        3.4,
      );
      line(
        [x + 1, 35, x - 5, 53, x + 7 + sway, 74, x - 3 + sway, bottom - 3],
        i % 2 ? shadow : light,
        0.5,
      );
      if (i % 3 === 0) line([x - 1, 51, x - 3, 58, x + 1, 66, x + 2, 73], glint, 0.5);
    }
    c.restore();
  };
  const lock = (x: number, y: number, w: number, h: number, lean: number) => {
    const draw = () => {
      c.moveTo(x, y + 6);
      c.bezierCurveTo(x + w * 0.25, y - 5, x + w * 0.84, y - 3, x + w, y + 5);
      c.bezierCurveTo(
        x + w + lean,
        y + h * 0.5,
        x + w * 0.58 + lean,
        y + h * 0.8,
        x + w * 0.28 + lean,
        y + h,
      );
      c.quadraticCurveTo(x + w * 0.05 + lean, y + h - 1, x + w * 0.13, y + h * 0.65);
      c.quadraticCurveTo(x - 2, y + h * 0.35, x, y + 6);
    };
    shape(draw, base, false);
    c.save();
    c.clip();
    for (let i = 0; i < 4; i++) {
      const xx = x + 2 + (i * w) / 4;
      line(
        [xx, y, xx - 2, y + h * 0.25, xx + lean + 5, y + h * 0.68, x + w * 0.28 + lean, y + h],
        i % 2 ? middle : shadow,
        i % 2 ? 1.1 : 0.5,
      );
    }
    line([x + 3, y + 9, x + w * 0.25, y + 5, x + w * 0.65, y + 6, x + w - 2, y + 11], light, 1);
    line([x + 4, y + 8, x + w * 0.28, y + 6, x + w * 0.66, y + 7, x + w - 3, y + 10], glint, 0.5);
    c.restore();
  };
  const ribbon = (x: number, y: number, size = 1) => {
    c.save();
    c.translate(x, y);
    c.scale(size, size);
    const trim = a.accentColor || '#e7d5a6';
    shape(() => {
      c.moveTo(0, 1);
      c.quadraticCurveTo(-9, -6, -8, 2);
      c.quadraticCurveTo(-9, 7, 0, 3);
      c.quadraticCurveTo(9, 8, 8, 1);
      c.quadraticCurveTo(8, -5, 0, 1);
    }, trim);
    line([-6, 0, -4, 0, -2, 1, -1, 2], tint(trim, '#fff8e9', 0.5), 0.7);
    shape(
      () => {
        c.moveTo(-1, 2);
        c.lineTo(-4, 10);
        c.lineTo(0, 8);
        c.lineTo(2, 3);
      },
      trim,
      false,
    );
    shape(
      () => {
        c.moveTo(1, 2);
        c.lineTo(5, 9);
        c.lineTo(6, 5);
        c.lineTo(3, 2);
      },
      trim,
      false,
    );
    c.fillStyle = tint(trim, '#fff3ce', 0.5);
    c.fillRect(-1, 0, 2, 4);
    c.restore();
  };
  if (rear) {
    if ([1, 3, 7].includes(a.hairstyle))
      mass(a.hairstyle !== 3, a.hairstyle === 7 || a.hairstyle === 3);
    if (a.hairstyle === 4) {
      shape(() => {
        c.moveTo(66, 23);
        c.bezierCurveTo(89, 13, 91, 44, 78, 62);
        c.bezierCurveTo(70, 75, 88, 82, 77, 97);
        c.quadraticCurveTo(79, 85, 69, 78);
        c.bezierCurveTo(60, 63, 76, 40, 65, 32);
      }, base);
      for (let i = 0; i < 4; i++)
        line([70 + i * 1.8, 26, 87, 47, 65 + i, 67, 77, 92], i % 2 ? shadow : light, 0.6);
      ribbon(72, 30, 0.7);
    }
    if (a.hairstyle === 8)
      for (const x of [20, 70]) {
        for (let y = 39; y < 95; y += 5) {
          lock(x - 2, y, 8, 10, y % 10 ? 2 : -2);
        }
        ribbon(x + 2, 93, 0.65);
      }
    if (a.hairstyle === 5)
      for (const x of [18, 75]) {
        shape(() => {
          c.ellipse(x, 23, 11, 12, 0, 0, Math.PI * 2);
        }, base);
        for (let i = 0; i < 4; i++)
          line([x - 7 + i * 2, 17, x - 4, 9, x + 9, 21, x - 2, 29], i % 2 ? shadow : light, 0.7);
        ribbon(x, 31, 0.65);
      }
    return;
  }
  if (back) {
    if ([1, 3, 7].includes(a.hairstyle)) {
      mass(a.hairstyle !== 3, a.hairstyle !== 1);
      return;
    }
    shape(() => {
      c.moveTo(19, 48);
      c.bezierCurveTo(11, 15, 34, 9, 51, 13);
      c.bezierCurveTo(76, 10, 84, 33, 75, 56);
      c.quadraticCurveTo(74, 74, 49, 76);
      c.quadraticCurveTo(21, 76, 19, 48);
    }, base);
    c.save();
    c.clip();
    for (let i = 0; i < 14; i++)
      line(
        [45, 15, 18 + i * 4, 20, 20 + i * 4, 54, 23 + i * 3.8, 75],
        i % 3 === 0 ? light : i % 3 === 1 ? shadow : middle,
        i % 3 === 0 ? 1 : 0.5,
      );
    line([23, 31, 36, 22, 61, 21, 73, 32], light, 1);
    c.restore();
    return;
  }
  shape(() => {
    c.moveTo(18, 53);
    c.bezierCurveTo(9, 22, 29, 10, 48, 13);
    c.bezierCurveTo(75, 8, 84, 30, 77, 54);
    c.lineTo(70, 49);
    c.bezierCurveTo(68, 27, 30, 27, 25, 53);
  }, base);
  const fringes: Record<number, number[][]> = {
    0: [
      [20, 24, 18, 25, -2],
      [30, 18, 16, 31, 1],
      [42, 17, 16, 32, 0],
      [54, 20, 16, 27, 3],
      [65, 27, 11, 25, 1],
    ],
    1: [
      [19, 25, 11, 25, -2],
      [27, 20, 11, 27, 0],
      [36, 19, 10, 27, 0],
      [44, 19, 11, 28, 1],
      [53, 20, 11, 27, 1],
      [62, 24, 13, 27, 2],
    ],
    2: [
      [20, 27, 13, 21, 0],
      [30, 23, 13, 23, 0],
      [41, 21, 13, 24, 1],
      [53, 23, 13, 23, 2],
      [64, 27, 12, 22, 0],
    ],
    3: [
      [19, 25, 21, 29, -3],
      [32, 18, 19, 29, 3],
      [49, 18, 22, 30, 5],
      [65, 29, 11, 28, 2],
    ],
    4: [
      [20, 23, 19, 29, -1],
      [33, 18, 17, 28, 1],
      [46, 18, 18, 28, 3],
      [60, 25, 15, 28, 4],
    ],
    5: [
      [20, 23, 20, 30, -3],
      [34, 17, 18, 31, 0],
      [49, 18, 20, 29, 4],
      [64, 28, 12, 25, 3],
    ],
    6: [
      [20, 24, 26, 31, 8],
      [37, 17, 24, 28, 10],
      [57, 23, 19, 24, 6],
    ],
    7: [
      [18, 24, 19, 29, -2],
      [31, 16, 18, 32, 2],
      [45, 16, 18, 29, 5],
      [58, 24, 18, 31, 4],
    ],
    8: [
      [20, 24, 18, 28, -2],
      [32, 18, 18, 28, 0],
      [46, 18, 18, 28, 3],
      [61, 24, 15, 30, 4],
    ],
    9: [
      [21, 27, 20, 24, -2],
      [33, 18, 23, 28, 3],
      [51, 20, 23, 29, 5],
    ],
  };
  for (const f of fringes[a.hairstyle] || fringes[0]) lock(f[0], f[1], f[2], f[3], f[4]);
  if ([1, 3, 7].includes(a.hairstyle))
    for (const [x, lean] of [
      [17, -3],
      [70, 5],
    ] as Point[])
      lock(x, 43, 9, a.hairstyle === 3 ? 34 : 49, lean);
  if (a.hairstyle === 0)
    for (const [x, lean] of [
      [19, -2],
      [70, 3],
    ] as Point[])
      lock(x, 42, 7, 20, lean);
  if (a.hairstyle === 9) lock(19, 40, 8, 17, -2);
}
