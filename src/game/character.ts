import { type Appearance } from '../../shared/types';
import { normalizeAppearance } from '../../shared/appearance';
import { hairArt } from './hairArt';
import { garmentArt } from './garmentArt';
export type Direction = 'down' | 'up' | 'left' | 'right';
export const CHARACTER_WIDTH = 192;
export const CHARACTER_HEIGHT = 256;
export const CHARACTER_SCALE = 0.2875;
const blend = (hex: string, target: string, ratio: number) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(
        parseInt(hex.slice(i, i + 2), 16) * (1 - ratio) +
          parseInt(target.slice(i, i + 2), 16) * ratio,
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

/** Rounded, original pixel art: integer scanlines keep the native pixel grid crisp. */
export function characterCanvas(
  input: Appearance,
  direction: Direction = 'down',
  frame = 0,
  seated = false,
) {
  const a = normalizeAppearance(input);
  const canvas = document.createElement('canvas');
  canvas.width = CHARACTER_WIDTH;
  canvas.height = CHARACTER_HEIGHT;
  const c = canvas.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.scale(2, 2);
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(
      Math.round(x * 2) / 2,
      Math.round(y * 2) / 2,
      Math.max(0, Math.round(w * 2) / 2),
      Math.max(0, Math.round(h * 2) / 2),
    );
  };
  const oval = (x: number, y: number, w: number, h: number, color: string, ring = false) => {
    for (let row = 0; row < h; row += 0.5) {
      const inset = Math.round(
        (w / 2) * (1 - Math.sqrt(Math.max(0, 1 - ((row + 0.25 - h / 2) / (h / 2)) ** 2))),
      );
      if (ring && row > 1 && row < h - 2) {
        r(x + inset, y + row, 1, 1, color);
        r(x + w - inset - 1, y + row, 1, 1, color);
      } else r(x + inset, y + row, w - inset * 2, 0.5, color);
    }
  };
  const round = (x: number, y: number, w: number, h: number, radius: number, color: string) => {
    for (let row = 0; row < h; row += 0.5) {
      const dy =
        row < radius ? radius - row - 0.5 : row >= h - radius ? row - (h - radius) + 0.5 : 0;
      const inset = dy ? Math.round(radius - Math.sqrt(Math.max(0, radius * radius - dy * dy))) : 0;
      r(x + inset, y + row, w - inset * 2, 0.5, color);
    }
  };
  const heart = (x: number, y: number, color: string) => {
    r(x + 1, y, 2, 1, color);
    r(x + 4, y, 2, 1, color);
    r(x, y + 1, 7, 2, color);
    r(x + 1, y + 3, 5, 1, color);
    r(x + 2, y + 4, 3, 1, color);
    r(x + 3, y + 5, 1, 1, color);
  };
  const star = (x: number, y: number, color: string) => {
    r(x + 2, y, 1, 5, color);
    r(x, y + 2, 5, 1, color);
    r(x + 1, y + 1, 3, 3, color);
  };
  const skin = a.skin,
    skinLight = blend(skin, '#fff4df', 0.13),
    skinShade = blend(skin, '#bb8271', 0.18);
  const hair = a.hair,
    hairShade = blend(hair, '#302b37', 0.22),
    hairLight = blend(hair, '#e9c9a4', 0.16);
  const cloth = a.outfitColor,
    clothShade = blend(cloth, '#394050', 0.22),
    clothLight = blend(cloth, '#fff0d6', 0.19),
    trim = a.accentColor;
  const ink = blend(a.eyes, '#433d45', 0.38),
    blush = blend(skin, '#eb9c9c', 0.44);
  const side = direction === 'left' || direction === 'right',
    back = direction === 'up';
  const step = frame === 1 ? -2 : frame === 2 ? 2 : 0;
  if (direction === 'left') {
    c.translate(96, 0);
    c.scale(-1, 1);
  }
  c.translate(0, frame ? -1 : 0);
  const width = [32, 28, 38, 30][a.body] ?? 32,
    x = 48 - width / 2,
    waist = seated ? 99 : a.body === 3 ? 100 : 104;
  hairArt(c, a, true, back);
  // Stubby legs and pill-shaped shoes retain the original world foot anchor.
  const shoe =
    a.outfit === 3 ? '#82636d' : a.outfit === 1 || a.outfit === 4 ? '#e8e4d9' : '#465267';
  for (const [lx, offset] of [
    [36, step],
    [51, -step],
  ]) {
    const foot = seated ? 112 : 121 + offset;
    round(lx, waist - 1, 10, foot - waist + 3, 3, a.outfit === 3 ? skinShade : clothShade);
    r(
      lx + 1,
      waist + 1,
      7,
      foot - waist - 1,
      a.outfit === 3 ? skinLight : a.outfit === 1 || a.outfit === 4 ? '#6e8499' : cloth,
    );
    round(lx - 2, foot, 14, 5, 2, shoe);
    r(lx, foot, 8, 1, blend(shoe, '#fff4df', 0.23));
    if ([1, 4].includes(a.outfit)) r(lx - 1, foot + 3, 12, 1, '#faf4e8');
  }
  // Small rounded shoulders, mittens and quiet clothing detail.
  round(x - 1, 77, width + 2, waist - 76, 9, clothShade);
  round(x + 1, 78, width - 2, waist - 79, 7, cloth);
  r(x + 5, 82, 1, waist - 85, clothLight);
  round(43, 72, 10, 9, 3, skinShade);
  r(44, 74, 8, 5, skinLight);
  for (const [ax, shift] of [
    [x - 6, -step],
    [x + width - 1, step],
  ]) {
    const ay = seated ? 84 : 80 + shift,
      short = [1, 3].includes(a.outfit);
    round(ax, ay, 8, short ? 10 : 18, 4, clothShade);
    round(ax + 1, ay + 1, 6, short ? 8 : 16, 3, clothLight);
    r(ax + 1, ay + (short ? 7 : 14), 6, 2, trim);
    oval(ax + 1, ay + (short ? 9 : 17), 7, short ? 12 : 8, skinShade);
    oval(ax + 2, ay + (short ? 9 : 17), 5, short ? 10 : 6, skinLight);
  }
  if (a.outfit === 0) {
    r(47, 80, 2, waist - 81, clothShade);
    r(x + 4, 81, width - 8, 2, '#b4c2c4');
    for (const px of [x + 6, x + width - 13]) {
      round(px, 87, 7, 7, 2, clothShade);
      r(px + 1, 87, 5, 1, trim);
    }
    r(46, 80, 4, 2, trim);
  } else if (a.outfit === 1) {
    oval(41, 77, 14, 7, clothShade);
    oval(42, 77, 12, 4, trim);
    heart(45, 89, trim);
    r(x + 4, waist - 2, width - 8, 1, clothShade);
  } else if (a.outfit === 2) {
    for (let y = 78; y < 94; y++) {
      const half = Math.max(2, Math.round((94 - y) / 2));
      r(48 - half, y, half * 2, 1, '#faf1df');
    }
    r(47, 82, 2, 10, trim);
    r(46, 80, 4, 3, trim);
    r(48, 97, 1, 1, trim);
    r(x + width - 10, 87, 5, 1, trim);
  } else if (a.outfit === 3) {
    for (let y = 89; y < waist + 4; y++) {
      const spread = Math.floor((y - 89) / 3);
      const left = x + 5 - spread,
        w = width - 10 + spread * 2;
      r(left, y, w, 1, clothShade);
      r(left + 1, y, w - 2, 1, cloth);
    }
    round(x, waist + 1, width, 3, 1, clothShade);
    r(x + 2, waist + 1, width - 4, 1, trim);
    for (let px = x + 6; px < x + width - 3; px += 7) r(px, 95, 1, waist - 95, clothLight);
    r(x + 4, 87, width - 8, 2, trim);
    oval(40, 79, 8, 5, trim);
    oval(48, 79, 8, 5, trim);
    r(47, 80, 2, 3, '#faf0dc');
  } else if (a.outfit === 4) {
    oval(37, 77, 22, 12, clothShade);
    oval(40, 77, 16, 8, clothLight);
    r(42, 85, 1, 7, trim);
    r(53, 85, 1, 7, trim);
    round(40, 95, 16, 5, 2, clothShade);
    r(x + 4, waist - 2, width - 8, 1, trim);
  } else if (a.outfit === 5) {
    for (let y = 78; y < 88; y++) {
      const half = Math.max(1, 7 - (y - 78));
      r(48 - half, y, half * 2, 1, trim);
    }
    r(47, 87, 2, waist - 88, clothShade);
    for (let y = 89; y < waist - 1; y += 5) r(48, y, 1, 1, trim);
    for (const px of [x + 5, x + width - 11]) round(px, 94, 6, 5, 1, clothShade);
  } else if (a.outfit === 6) {
    r(x + 4, 79, width - 8, 8, trim);
    r(37, 78, 3, 15, clothShade);
    r(56, 78, 3, 15, clothShade);
    round(38, 86, 20, 16, 3, clothLight);
    round(39, 87, 18, 14, 2, cloth);
    round(43, 90, 10, 6, 2, clothShade);
    r(38, 84, 2, 2, '#e8cf8b');
    r(56, 84, 2, 2, '#e8cf8b');
  } else {
    round(x - 1, 91, width + 2, waist - 88, 3, clothShade);
    r(x + 1, 92, width - 2, waist - 91, cloth);
    r(x + 2, 93, width - 4, 2, trim);
    round(45, 92, 6, 4, 1, clothShade);
    r(47, 93, 2, 2, trim);
    for (const px of [42, 53]) for (const y of [84, 99, 104]) r(px, y, 1, 1, clothShade);
    r(39, 79, 5, 4, clothLight);
    r(52, 79, 5, 4, clothLight);
  }
  garmentArt(c, a, x, width, waist, back, step, seated);
  if (back) {
    round(x + 3, 79, width - 6, waist - 81, 4, cloth);
    if (a.outfit === 4) {
      oval(37, 77, 22, 12, clothShade);
      oval(40, 78, 16, 7, clothLight);
    }
    if (a.outfit === 6) {
      r(38, 79, 2, 20, clothShade);
      r(56, 79, 2, 20, clothShade);
    }
    r(x + 6, 82, width - 12, 1, clothLight);
    r(47, 83, 1, 13, clothShade);
  }
  // Face is independent of the rear hair: no face/ear silhouette leaks in back views.
  if (!back) {
    for (const ex of [20, 69]) {
      oval(ex, 50, 7, 12, skinShade);
      oval(ex + 1, 51, 5, 9, skin);
      r(ex + 2, 54, 1, 4, blend(skin, '#a67d75', 0.2));
    }
    oval(side ? 26 : 22, 30, 52, 46, blend(skin, '#ae7680', 0.25));
    oval(side ? 27 : 23, 30, 50, 44, skin);
    oval(side ? 29 : 25, 33, 45, 39, skinLight);
    for (const bx of side ? [48] : [27, 64]) {
      oval(bx - 1, 61, 10, 5, blend(skinLight, '#efabb7', 0.24));
      oval(bx + 1, 62, 7, 3, blend(skinLight, '#e996ac', 0.22));
    }
    r(side ? 70 : 48, 62, 0.5, 1.5, skinShade);
    r(side ? 69.5 : 47.5, 61, 0.5, 0.5, '#fff1d8');
  }
  hairArt(c, a, false, back);
  if (!back) {
    const eyeY = 53,
      eyes = side ? [58] : [31, 55];
    for (let i = 0; i < eyes.length; i++) {
      const ex = eyes[i],
        wink = a.expression === 5 && i === eyes.length - 1;
      if (a.eyeShape === 1 || wink) {
        for (let dx = 0; dx < 9; dx += 0.5)
          r(ex + dx, eyeY + 3 + (dx - 4) ** 2 / 12, 0.5, 0.7, ink);
      } else {
        const eh =
          a.eyeShape === 3
            ? 6
            : a.eyeShape === 2
              ? 11
              : a.eyeShape === 4
                ? 12
                : a.eyeShape === 5
                  ? 11
                  : 10;
        const ew = a.eyeShape === 2 || a.eyeShape === 4 || a.eyeShape === 5 ? 12 : 10;
        const ey = eyeY + (a.eyeShape === 3 ? 3 : 0);
        c.beginPath();
        c.moveTo(ex, ey + 2);
        c.quadraticCurveTo(ex + ew / 2, ey - 2, ex + ew, ey + 2);
        c.quadraticCurveTo(ex + ew, ey + eh, ex + ew / 2, ey + eh);
        c.quadraticCurveTo(ex, ey + eh, ex, ey + 2);
        c.fillStyle = '#fff5e6';
        c.fill();
        const ix = ex + (side ? 4 : 3),
          iw = ew > 10 ? 7 : 6;
        oval(ix, ey + 0.5, iw, eh - 0.5, blend(a.eyes, '#26253c', 0.45));
        oval(ix + 0.5, ey + 2, iw - 1, eh - 3, a.eyes);
        oval(ix + 1, ey + eh - 4, iw - 2, 3, blend(a.eyes, '#d6efdf', 0.38));
        round(ix + 2, ey + 2, 2, Math.max(2, eh - 4), 1, '#302b3c');
        r(ix + 1, ey + 1.5, 1.5, 1.5, '#fffdf3');
        r(ix + 4.5, ey + eh - 3, 0.5, 1, '#fff5db');
        if (a.eyeShape === 4) {
          r(ix + 4, ey + 5, 0.5, 2, '#fffdf3');
          r(ix + 3.5, ey + 5.5, 1.5, 0.5, '#fffdf3');
        }
        c.beginPath();
        c.moveTo(ex - 0.5, ey + 2);
        c.quadraticCurveTo(ex + ew / 2, ey - 1.5, ex + ew + 0.5, ey + 2);
        c.lineWidth = a.eyeShape === 5 ? 1.2 : 0.85;
        c.strokeStyle = ink;
        c.stroke();
        r(ex + (i ? ew : -1), ey + 1, 1.5, 0.5, ink);
        r(ex + 2, ey + eh, ew - 3, 0.5, blend(skin, '#a67283', 0.25));
        if (a.eyeShape === 5) r(ex + (i ? ew - 0.5 : -1), ey, 1.5, 0.5, ink);
      }
      const by = a.expression === 2 || a.brows === 1 ? 49 : 50,
        brow = blend(hair, skinLight, 0.3);
      if (a.brows === 2) {
        r(ex + 1, by - 1, 4, 1, brow);
        r(ex, by, 1, 1, brow);
        r(ex + 5, by, 1, 1, brow);
      } else {
        r(ex, by, 6, a.brows === 4 ? 2 : 1, brow);
        if (a.brows === 0) r(ex, by + 1, 1, 1, brow);
        if (a.brows === 1) r(ex + 5, by - 1, 1, 1, brow);
        if (a.expression === 4) r(ex + (i ? 0 : 4), by + 1, 2, 1, brow);
      }
    }
    for (const bx of side ? [48] : [27, 63]) oval(bx, 63, 8, 3, blush);
    const mx = side ? 64 : 45,
      my = 68;
    const lip = blend(skin, '#a95f70', 0.66);
    if (a.mouth === 0) {
      r(mx, my, 2, 1, lip);
      r(mx + 2, my + 1, 3, 1, lip);
      r(mx + 5, my, 1, 1, lip);
    }
    if (a.mouth === 1) {
      round(mx - 1, my - 1, 8, 4, 2, lip);
      r(mx, my - 1, 6, 1, '#fff4e6');
      r(mx + 1, my + 1, 4, 1, '#e5a0a5');
    }
    if (a.mouth === 2) {
      oval(mx + 1, my - 1, 4, 4, lip);
      r(mx + 2, my, 2, 1, skinLight);
    }
    if (a.mouth === 3) {
      r(mx - 1, my, 2, 1, lip);
      r(mx + 1, my + 1, 2, 1, lip);
      r(mx + 3, my, 1, 1, lip);
      r(mx + 4, my + 1, 2, 1, lip);
      r(mx + 6, my, 2, 1, lip);
    }
    if (a.mouth === 4) {
      r(mx, my, 6, 1, lip);
      r(mx + 2, my + 1, 3, 1, '#d58e98');
    }
    if (a.mouth === 5) r(mx + 1, my, 4, 1, lip);
    if (a.expression === 1) {
      oval(26, 62, 10, 4, blush);
      oval(62, 62, 10, 4, blush);
      r(43, 64, 1, 1, skinShade);
    }
    if (a.expression === 2) r(side ? 71 : 49, 62, 1, 1, skinShade);
    if (a.expression === 3)
      for (const bx of [28, 64]) {
        r(bx, 62, 1, 4, '#dca09c');
        r(bx + 3, 62, 1, 4, '#dca09c');
      }
    if (a.accessory === 1) {
      const rim = blend(hair, '#e6cbb2', 0.48);
      for (const ex of eyes) oval(ex - 2, eyeY - 1, 14, 14, rim, true);
      if (!side) r(43, eyeY + 4, 10, 0.5, rim);
    }
    if (a.accessory === 2) star(side ? 70 : 67, 59, '#f6d997');
    if (a.accessory === 3) for (const bx of side ? [48] : [26, 64]) oval(bx, 61, 9, 5, '#e6aaa7');
    if (a.accessory === 4)
      for (const bx of side ? [49] : [27, 65]) {
        r(bx, 62, 1, 1, '#ba8a73');
        r(bx + 3, 63, 1, 1, '#ba8a73');
        r(bx + 1, 65, 1, 1, '#ba8a73');
      }
    if (a.accessory === 5) {
      round(side ? 47 : 26, 61, 9, 4, 1, '#ead7b1');
      r(side ? 51 : 30, 62, 1, 2, '#bca484');
    }
    if (a.accessory === 6) heart(side ? 47 : 65, 60, '#dc909f');
  }
  // Round hardhat / beret / cap; pattern dots follow the curved crown.
  if (a.helmetStyle !== 1) {
    const hat = a.helmetColor,
      shade = blend(hat, '#8a8c7a', 0.22),
      light = blend(hat, '#fffaf0', 0.42);
    const hy = a.helmetStyle === 2 ? 10 : a.helmetStyle === 0 ? 4 : 8,
      hh = a.helmetStyle === 2 ? 29 : a.helmetStyle === 0 ? 39 : 35;
    oval(14, hy, 68, hh, shade);
    oval(16, hy, 64, hh - 2, hat);
    oval(23, hy + 3, 37, 5, light);
    for (let y = hy + 6; y < hy + hh - 3; y += 7)
      for (let xx = 22; xx < 76; xx += 9) {
        if (((xx - 48) / 29) ** 2 + ((y - (hy + hh / 2)) / (hh / 2 - 2)) ** 2 > 0.83) continue;
        const col = blend(trim, hat, 0.25);
        if (a.helmetPattern === 2) star(xx, y, col);
        if (a.helmetPattern === 3) oval(xx, y, 3, 3, col);
        if (a.helmetPattern === 4 && (Math.floor(xx / 9) + Math.floor(y / 7)) % 2 === 0)
          r(xx, y, 5, 4, col);
      }
    if (a.helmetPattern === 1) {
      r(45, hy + 2, 5, hh - 5, trim);
      r(51, hy + 4, 1, hh - 7, light);
    }
    if (a.helmetPattern === 5) {
      for (const [dx, dy] of [
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2],
      ])
        oval(64 + dx, hy + 16 + dy, 4, 4, trim);
      oval(65, hy + 17, 2, 2, '#f8d58b');
    }
    if (a.helmetStyle === 0) {
      round(11, 39, 74, 6, 3, shade);
      round(11, 38, 74, 5, 2, light);
      r(22, 43, 52, 1, shade);
      r(45, hy + 2, 3, 23, light);
    }
    if (a.helmetStyle === 0) {
      c.strokeStyle = blend(hat, '#b5b7a4', 0.28);
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(25, 35);
      c.bezierCurveTo(21, 19, 33, 9, 42, 8);
      c.stroke();
      r(24, 39, 0.5, 2, light);
      r(72, 39, 0.5, 2, shade);
    }
    if (a.helmetStyle === 2) {
      round(22, 36, 52, 6, 3, shade);
      round(46, 7, 5, 6, 2, shade);
    }
    if (a.helmetStyle === 3) {
      round(21, 36, 54, 6, 3, shade);
      round(side ? 58 : 29, 39, side ? 29 : 42, 5, 2, hat);
    }
  }
  // Remove fractional edge coverage after rasterizing curves onto the fine native grid.
  const pixels = c.getImageData(0, 0, CHARACTER_WIDTH, CHARACTER_HEIGHT);
  for (let at = 3; at < pixels.data.length; at += 4)
    pixels.data[at] = pixels.data[at] >= 128 ? 255 : 0;
  c.putImageData(pixels, 0, 0);
  return canvas;
}
