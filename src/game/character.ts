import type { Appearance } from '../../shared/types';
import { normalizeAppearance } from '../../shared/appearance';
import { PixelArt, shade } from './pixelArt';
import { playerHair } from './playerHair';
import { playerClothes } from './playerClothes';
export type Direction = 'down' | 'up' | 'left' | 'right';
// Native pixels, not a high-resolution drawing shrunk by CSS. Preserve the world footprint.
export const CHARACTER_WIDTH = 60;
export const CHARACTER_HEIGHT = 80;
export const CHARACTER_SCALE = 0.92;
export function characterCanvas(
  input: Appearance,
  direction: Direction = 'down',
  frame = 0,
  seated = false,
) {
  const a = normalizeAppearance(input),
    p = new PixelArt(CHARACTER_WIDTH, CHARACTER_HEIGHT),
    back = direction === 'up',
    side = direction === 'right' || direction === 'left',
    step = frame === 1 ? -1 : frame === 2 ? 1 : 0,
    bob = frame ? -1 : 0;
  const ink = '#262333',
    white = '#fff1da',
    skin = a.skin,
    shadow = shade(skin, '#aa6c66', 0.25),
    blush = shade(skin, '#ee879d', 0.48),
    lip = '#b5657d';
  playerHair(p, a, back, false, bob);
  playerClothes(p, a, back, step, seated);
  if (!back) {
    // The face sits directly on the collar. A slightly asymmetric silhouette keeps both eyes visible.
    p.layer((q) => {
      q.oval(14, 38 + bob, 5, 8, skin);
      q.oval(43, 38 + bob, 5, 8, skin);
      q.poly(
        [
          [18, 30 + bob],
          [39, 29 + bob],
          [44, 34 + bob],
          [46, 43 + bob],
          [44, 49 + bob],
          [40, 53 + bob],
          [24, 55 + bob],
          [18, 52 + bob],
          [15, 47 + bob],
          [15, 36 + bob],
        ],
        skin,
      );
      q.rect(17, 46 + bob, 2, 4, shadow);
      q.rect(22, 53 + bob, 17, 1, shadow);
    });
    p.rect(18, 49 + bob, 5, 2, blush);
    p.rect(39, 49 + bob, 5, 2, blush);
  }
  playerHair(p, a, back, true, bob);
  if (!back) {
    const iris = shade(a.eyes, '#fbefc2', 0.42);
    for (const [i, x] of (side ? [23, 36] : [20, 35]).entries()) {
      const wink = a.expression === 5 && i === 1,
        y = 42 + bob + (a.eyeShape === 3 ? 2 : 0),
        w = side && i === 0 ? 6 : 8;
      if (a.eyeShape === 1 || wink) {
        p.line(
          [
            [x, y + 2],
            [x + 2, y],
            [x + 4, y],
            [x + w - 1, y + 2],
          ],
          ink,
        );
      } else {
        const h = [7, 7, 8, 4, 8, 7, 6, 8, 5, 7][a.eyeShape] ?? 6;
        p.rect(x, y, w, 1, ink);
        p.rect(x - 1, y + 1, 1, 1, ink);
        p.rect(x + w, y, 1, 1, ink);
        p.rect(x, y + 1, w, h - 1, white);
        p.rect(x + 1, y + 1, Math.min(6, w - 1), h - 1, a.eyes);
        p.rect(x + 3, y + 2, 2, Math.max(1, h - 3), ink);
        p.rect(x + 1, y + h - 2, Math.min(6, w - 1), 1, iris);
        p.rect(x + 2, y + 1, 1, 2, white);
        p.rect(x + 5, y + h - 3, 1, 1, white);
        if (a.eyeShape === 4) p.rect(x + 1, y + 3, 1, 1, white);
        if (a.eyeShape === 5 || a.eyeShape === 9) {
          p.rect(i === 0 ? x - 2 : x + w, y - 1, 2, 1, ink);
          p.rect(x, y - 1, w, 1, ink);
        }
        if (a.eyeShape === 6) p.rect(x + 1, y - 1, w - 2, 1, ink);
        if (a.eyeShape === 8) p.rect(x, y, w, 2, ink);
        if (a.eyeShape === 9) p.rect(x + 1, y + h, w - 2, 1, ink);
        if (a.eyeShape === 7) p.rect(x, y + 2, 1, 4, a.eyes);
      }
      const by = 39 + bob - (a.expression === 2 ? 1 : 0),
        brow = shade(a.hair, skin, 0.25);
      p.rect(x + 1, by, 5, a.brows === 4 ? 2 : 1, brow);
      if (a.brows === 0) p.rect(x, by + 1, 1, 1, brow);
      if (a.brows === 1) p.rect(x + 4, by - 1, 2, 1, brow);
      if (a.brows === 2) {
        p.rect(x + 1, by - 1, 3, 1, brow);
        p.rect(x + 5, by + 1, 1, 1, brow);
      }
      if (a.expression === 4) p.rect(x + (i ? 0 : 4), by + 1, 2, 1, brow);
    }
    const my = 52 + bob;
    if (a.mouth === 0) {
      p.rect(29, my, 2, 1, lip);
      p.rect(31, my - 1, 1, 1, lip);
    }
    if (a.mouth === 1) {
      p.rect(28, my - 1, 5, 2, lip);
      p.rect(29, my - 1, 3, 1, white);
    }
    if (a.mouth === 2) {
      p.rect(30, my - 1, 2, 2, lip);
      p.rect(30, my - 1, 1, 1, shadow);
    }
    if (a.mouth === 3) {
      p.rect(28, my - 1, 1, 1, lip);
      p.rect(29, my, 1, 1, lip);
      p.rect(30, my - 1, 1, 1, lip);
      p.rect(31, my, 1, 1, lip);
      p.rect(32, my - 1, 1, 1, lip);
    }
    if (a.mouth === 4) {
      p.rect(29, my - 1, 4, 1, lip);
      p.rect(30, my, 2, 1, blush);
    }
    if (a.mouth === 5) p.rect(30, my, 3, 1, lip);
    if (a.expression === 1) {
      p.rect(18, 48 + bob, 5, 2, blush);
      p.rect(39, 48 + bob, 5, 2, blush);
    }
    if (a.expression === 2) {
      p.rect(30, my - 2, 2, 3, lip);
      p.rect(31, my - 1, 1, 1, shadow);
    }
    if (a.expression === 3) {
      for (const x of [19, 40]) {
        p.rect(x, 48 + bob, 1, 3, lip);
        p.rect(x + 2, 48 + bob, 1, 3, lip);
      }
    }
    if (a.accessory === 1) {
      for (const [x, w] of [
        [19, 10],
        [33, 12],
      ]) {
        p.line(
          [
            [x + 1, 41 + bob],
            [x + w - 2, 41 + bob],
            [x + w - 1, 42 + bob],
            [x + w - 1, 49 + bob],
            [x + 1, 49 + bob],
            [x, 48 + bob],
            [x, 42 + bob],
            [x + 1, 41 + bob],
          ],
          ink,
        );
      }
      p.rect(29, 44 + bob, 4, 1, ink);
    }
    if (a.accessory === 2) {
      p.rect(42, 48 + bob, 1, 5, a.accentColor);
      p.rect(40, 50 + bob, 5, 1, a.accentColor);
    }
    if (a.accessory === 3) {
      p.oval(17, 48 + bob, 7, 4, blush);
      p.oval(38, 48 + bob, 7, 4, blush);
    }
    if (a.accessory === 4)
      for (const x of [19, 40]) {
        p.rect(x, 49 + bob, 1, 1, shadow);
        p.rect(x + 2, 48 + bob, 1, 1, shadow);
        p.rect(x + 3, 50 + bob, 1, 1, shadow);
      }
    if (a.accessory === 5) {
      p.rect(17, 49 + bob, 7, 3, a.accentColor);
      p.rect(20, 49 + bob, 1, 3, shadow);
    }
    if (a.accessory === 6) {
      p.rect(40, 48 + bob, 2, 1, lip);
      p.rect(43, 48 + bob, 2, 1, lip);
      p.rect(40, 49 + bob, 5, 1, lip);
      p.rect(41, 50 + bob, 3, 1, lip);
      p.rect(42, 51 + bob, 1, 1, lip);
    }
    if (a.accessory === 7) {
      p.line(
        [
          [46, 46 + bob],
          [48, 46 + bob],
          [48, 51 + bob],
          [46, 51 + bob],
          [45, 50 + bob],
          [45, 47 + bob],
        ],
        '#b8c9df',
      );
    }
    if (a.accessory === 8) {
      p.poly(
        [
          [23, 49 + bob],
          [39, 49 + bob],
          [37, 54 + bob],
          [27, 54 + bob],
        ],
        '#e7f0ec',
      );
      p.rect(25, 51 + bob, 12, 1, '#acc5cb');
    }
    if (a.accessory === 9) {
      p.rect(45, 42 + bob, 3, 5, ink);
      p.line(
        [
          [46, 46 + bob],
          [46, 51 + bob],
          [39, 51 + bob],
        ],
        ink,
      );
      p.rect(38, 50 + bob, 2, 2, ink);
    }
  }
  const hat = a.helmetStyle,
    color = a.helmetColor,
    dark = shade(color, '#262333', 0.3),
    light = shade(color, '#fff1da', 0.4),
    trim = a.accentColor;
  if (hat !== 1) {
    p.layer((q) => {
      if ([0, 2, 3, 6, 7, 8, 9, 10].includes(hat)) {
        q.poly(
          [
            [10, 31 + bob],
            [11, 24 + bob],
            [15, 18 + bob],
            [22, 15 + bob],
            [35, 14 + bob],
            [43, 17 + bob],
            [48, 23 + bob],
            [49, 32 + bob],
          ],
          color,
        );
        q.poly(
          [
            [14, 26 + bob],
            [17, 20 + bob],
            [25, 17 + bob],
            [36, 17 + bob],
            [40, 19 + bob],
            [24, 19 + bob],
            [19, 23 + bob],
          ],
          light,
        );
        q.rect(44, 25 + bob, 4, 7, dark);
        q.rect(11, 31 + bob, 38, 3, dark);
        if (hat === 0 || hat === 6) {
          q.rect(8, 32 + bob, 44, 3, color);
          q.rect(9, 32 + bob, 41, 1, light);
          q.rect(29, 17 + bob, 2, 14, light);
        }
        if (hat === 2) {
          q.rect(11, 28 + bob, 37, 4, color);
          q.rect(28, 12 + bob, 3, 3, dark);
        }
        if (hat === 3) {
          if (!back) q.rect(31, 33 + bob, 23, 3, color);
          else q.rect(26, 31 + bob, 8, 2, light);
        }
        if (hat === 7 || hat === 8) {
          q.rect(13, 28 + bob, 34, 4, ink);
          if (!back) q.rect(24, 32 + bob, 25, 3, ink);
          if (back) q.rect(26, 29 + bob, 9, 1, light);
          else if (hat === 7) {
            q.rect(25, 27 + bob, 15, 1, trim);
            q.rect(28, 28 + bob, 9, 1, trim);
            q.rect(31, 26 + bob, 3, 4, trim);
          } else {
            q.poly(
              [
                [30, 25 + bob],
                [35, 25 + bob],
                [36, 28 + bob],
                [33, 31 + bob],
                [29, 28 + bob],
              ],
              trim,
            );
            q.rect(32, 27 + bob, 2, 1, light);
          }
        }
        if (hat === 9) {
          q.rect(11, 29 + bob, 38, 5, light);
          for (let x = 15; x < 47; x += 5) q.rect(x, 30 + bob, 1, 3, dark);
          q.oval(25, 9 + bob, 9, 7, color);
        }
        if (hat === 10) {
          q.rect(11, 30 + bob, 3, 19, color);
          q.rect(46, 30 + bob, 3, 20, color);
          q.rect(13, 51 + bob, 33, 4, color);
          q.rect(13, 33 + bob, 2, 14, '#8fbbd1');
          q.rect(45, 34 + bob, 1, 12, '#8fbbd1');
          if (back) {
            q.rect(14, 33 + bob, 32, 19, color);
            q.rect(17, 35 + bob, 4, 13, light);
            q.rect(38, 36 + bob, 5, 14, dark);
            q.rect(26, 41 + bob, 9, 5, dark);
            q.rect(28, 42 + bob, 5, 1, light);
          }
        }
        if (hat === 6 && !back) {
          q.rect(22, 22 + bob, 16, 2, trim);
          q.rect(25, 24 + bob, 10, 4, trim);
        }
      } else if (hat === 4) {
        q.oval(10, 17 + bob, 16, 16, color);
        q.oval(21, 12 + bob, 18, 20, color);
        q.oval(34, 17 + bob, 16, 16, color);
        q.rect(14, 27 + bob, 32, 9, color);
        q.rect(15, 33 + bob, 30, 3, light);
        q.rect(26, 19 + bob, 2, 9, light);
      } else if (hat === 5) {
        q.poly(
          [
            [14, 25 + bob],
            [19, 20 + bob],
            [39, 20 + bob],
            [46, 25 + bob],
            [43, 34 + bob],
            [16, 34 + bob],
          ],
          color,
        );
        q.rect(18, 31 + bob, 25, 3, light);
        if (!back) {
          q.rect(28, 25 + bob, 6, 2, trim);
          q.rect(30, 23 + bob, 2, 6, trim);
        } else q.rect(26, 30 + bob, 9, 1, dark);
      } else if (hat === 11) {
        q.poly(
          [
            [29, 20 + bob],
            [17, 14 + bob],
            [14, 16 + bob],
            [14, 25 + bob],
            [18, 28 + bob],
            [29, 23 + bob],
            [41, 29 + bob],
            [46, 25 + bob],
            [45, 15 + bob],
            [42, 14 + bob],
            [31, 20 + bob],
          ],
          color,
        );
        q.rect(28, 20 + bob, 4, 5, dark);
        q.rect(18, 17 + bob, 6, 2, light);
      } else if (hat === 12) {
        for (const [x, y] of [
          [40, 23],
          [44, 26],
          [42, 31],
          [37, 29],
          [36, 24],
        ])
          q.oval(x, y + bob, 5, 5, color);
        q.rect(40, 27 + bob, 3, 3, trim);
      } else if (hat === 13) {
        q.line(
          [
            [11, 35 + bob],
            [12, 25 + bob],
            [17, 18 + bob],
            [24, 15 + bob],
            [36, 15 + bob],
            [44, 20 + bob],
            [48, 27 + bob],
            [49, 37 + bob],
          ],
          color,
        );
        q.rect(9, 34 + bob, 5, 12, color);
        q.rect(47, 34 + bob, 5, 12, color);
        q.rect(10, 36 + bob, 2, 8, trim);
        q.rect(48, 36 + bob, 2, 8, trim);
      } else if (hat === 14) {
        q.poly(
          [
            [17, 23 + bob],
            [22, 18 + bob],
            [37, 18 + bob],
            [43, 24 + bob],
            [44, 31 + bob],
            [15, 31 + bob],
          ],
          color,
        );
        q.rect(16, 28 + bob, 28, 3, trim);
        q.poly(
          [
            [8, 32 + bob],
            [15, 30 + bob],
            [44, 30 + bob],
            [52, 33 + bob],
            [50, 36 + bob],
            [12, 36 + bob],
          ],
          color,
        );
        q.rect(12, 33 + bob, 36, 1, light);
      }
    });
    // Patterns live inside the crown, never across a face or outside the silhouette.
    if ([0, 2, 3, 6, 7, 8, 9].includes(hat)) {
      if (a.helmetPattern === 1) p.rect(28, 18 + bob, 3, 12, trim);
      if (a.helmetPattern === 2) {
        p.rect(35, 22 + bob, 1, 5, trim);
        p.rect(33, 24 + bob, 5, 1, trim);
      }
      if (a.helmetPattern === 3)
        for (const [x, y] of [
          [20, 23],
          [28, 27],
          [37, 21],
          [42, 27],
        ])
          p.rect(x, y + bob, 2, 2, trim);
      if (a.helmetPattern === 4)
        for (const x of [21, 27, 33, 39]) {
          p.rect(x, 22 + bob, 3, 2, trim);
          p.rect(x + 2, 27 + bob, 3, 2, trim);
        }
      if (a.helmetPattern === 5) {
        p.rect(38, 23 + bob, 5, 3, trim);
        p.rect(39, 22 + bob, 3, 5, trim);
        p.rect(40, 24 + bob, 1, 1, white);
      }
    }
  }
  return p.canvas(direction === 'left');
}
