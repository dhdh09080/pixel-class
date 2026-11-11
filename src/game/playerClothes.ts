import type { Appearance } from '../../shared/types';
import { PixelArt, shade } from './pixelArt';
export function playerClothes(
  p: PixelArt,
  a: Required<Appearance>,
  back: boolean,
  step: number,
  seated: boolean,
) {
  const main = a.outfitColor,
    dark = shade(main, '#202339', 0.4),
    light = shade(main, '#fff3d5', 0.24),
    trim = a.accentColor,
    white = '#fff1da',
    ink = '#262333',
    skin = a.skin,
    skinShadow = shade(skin, '#aa6c66', 0.25);
  const dress = [3, 24].includes(a.outfit),
    coat = [7, 10, 12].includes(a.outfit),
    shorts = a.outfit === 23;
  const spread = [0, -1, 2, -2][a.body] || 0,
    left = 21 - spread,
    right = 39 + spread;
  // Legs and feet are anchored to the same native baseline for every occupation.
  p.layer((q) => {
    for (const [x, move] of [
      [23, step],
      [33, -step],
    ]) {
      const foot = seated ? 70 : 76 + move;
      q.rect(x, 64, 5, foot - 64, dress || shorts ? skin : dark);
      q.rect(x, 65, 1, Math.max(1, foot - 66), dress || shorts ? skinShadow : light);
      q.rect(x - 1, foot, 7, 2, ink);
      q.rect(x, foot, 5, 1, a.outfit === 1 || a.outfit === 4 ? white : dark);
    }
  });
  p.layer((q) => {
    q.poly(
      [
        [left + 2, 55],
        [right - 2, 55],
        [right + 1, 58],
        [right, 66],
        [left, 66],
        [left - 1, 58],
      ],
      main,
    );
    q.rect(left, 58, 2, 7, light);
    q.rect(right - 2, 58, 2, 7, dark);
    for (const [x, move] of [
      [left - 3, -step],
      [right, step],
    ]) {
      const y = 57 + (seated ? 0 : move),
        short = [1, 3, 11, 24].includes(a.outfit);
      q.rect(x, y, 4, short ? 5 : 8, main);
      q.rect(x, y, 1, short ? 4 : 7, light);
      q.rect(x, y + (short ? 5 : 8), 4, 3, skin);
      q.rect(x + 3, y + (short ? 5 : 8), 1, 2, skinShadow);
    }
    if (dress) {
      q.poly(
        [
          [left + 2, 62],
          [right - 2, 62],
          [right + 3, 70],
          [right + 2, 71],
          [left - 2, 71],
          [left - 3, 70],
        ],
        main,
      );
      q.rect(left - 1, 69, right - left + 2, 1, trim);
      q.rect(left + 3, 64, 1, 5, light);
      q.rect(right - 4, 65, 1, 4, dark);
    }
    if (coat) {
      q.rect(left, 62, right - left, 8, main);
      q.rect(left + 1, 63, 2, 6, light);
      q.rect(right - 3, 63, 2, 6, dark);
    }
    if (back) {
      q.rect(29, 57, 1, 7, dark);
      q.rect(left + 3, 56, right - left - 6, 1, light);
      if (a.outfit === 16) {
        q.rect(left, 60, right - left, 1, trim);
        q.rect(left, 64, right - left, 1, trim);
      }
      return;
    }
    const collar = () => {
      q.rect(25, 55, 10, 1, white);
      q.poly(
        [
          [25, 56],
          [29, 59],
          [30, 56],
          [31, 59],
          [35, 56],
        ],
        white,
      );
    };
    const buttons = (x: number, from = 59, to = 66) => {
      for (let y = from; y < to; y += 3) q.rect(x, y, 1, 1, trim);
    };
    const pocket = (x: number, y = 61) => {
      q.rect(x, y, 4, 3, dark);
      q.rect(x, y, 4, 1, trim);
    };
    const apron = () => {
      q.rect(24, 57, 2, 8, trim);
      q.rect(34, 57, 2, 8, trim);
      q.rect(24, 60, 12, 10, dark);
      q.rect(25, 60, 10, 9, main);
      q.rect(27, 63, 6, 3, trim);
    };
    const badge = (x = 33, y = 59) => {
      q.rect(x, y, 3, 4, white);
      q.rect(x + 1, y + 1, 1, 1, trim);
    };
    if (a.outfit === 0) {
      q.rect(left, 57, right - left, 1, trim);
      q.rect(29, 58, 1, 8, dark);
      pocket(23);
      pocket(33);
    } else if (a.outfit === 1) {
      q.rect(26, 55, 8, 1, trim);
      q.rect(28, 60, 4, 1, trim);
      q.rect(29, 59, 2, 3, trim);
    } else if (a.outfit === 2 || a.outfit === 22) {
      collar();
      q.poly(
        [
          [24, 56],
          [29, 64],
          [26, 63],
          [23, 59],
        ],
        light,
      );
      q.poly(
        [
          [36, 56],
          [31, 64],
          [34, 63],
          [37, 59],
        ],
        light,
      );
      q.rect(29, 57, 2, 5, trim);
      buttons(30, 64, 66);
      if (a.outfit === 22) {
        q.rect(25, 60, 3, 6, dark);
        q.rect(33, 60, 3, 6, dark);
      }
    } else if (a.outfit === 3) {
      collar();
      q.poly(
        [
          [29, 58],
          [25, 57],
          [25, 60],
          [29, 59],
          [34, 61],
          [35, 57],
          [31, 58],
        ],
        trim,
      );
      q.rect(29, 58, 2, 2, white);
    } else if (a.outfit === 4 || a.outfit === 9) {
      q.poly(
        [
          [24, 55],
          [26, 60],
          [30, 62],
          [34, 60],
          [36, 55],
          [34, 56],
          [30, 59],
          [26, 56],
        ],
        light,
      );
      q.rect(26, 59, 1, 4, trim);
      q.rect(33, 59, 1, 4, trim);
      pocket(28, 63);
      if (a.outfit === 9) badge(34, 60);
    } else if (a.outfit === 5) {
      collar();
      q.rect(29, 58, 2, 8, dark);
      buttons(30);
      pocket(23, 63);
      pocket(33, 63);
    } else if (a.outfit === 6 || a.outfit === 8 || a.outfit === 14 || a.outfit === 20) {
      apron();
      if (a.outfit === 8) {
        q.rect(22, 64, 16, 1, trim);
        q.rect(36, 62, 2, 4, white);
      }
      if (a.outfit === 14) q.rect(28, 64, 3, 1, white);
      if (a.outfit === 20) {
        q.rect(26, 64, 1, 2, light);
        q.rect(28, 63, 1, 3, light);
        q.rect(30, 64, 1, 2, light);
      }
    } else if (a.outfit === 7) {
      collar();
      q.rect(left, 62, right - left, 1, trim);
      q.rect(29, 62, 3, 2, dark);
      q.rect(30, 62, 1, 1, trim);
      buttons(26, 59, 69);
      buttons(34, 59, 69);
    } else if (a.outfit === 10 || a.outfit === 12) {
      q.rect(27, 56, 6, 11, trim);
      q.poly(
        [
          [24, 55],
          [28, 60],
          [26, 62],
          [24, 59],
        ],
        white,
      );
      q.poly(
        [
          [36, 55],
          [32, 60],
          [34, 62],
          [36, 59],
        ],
        white,
      );
      q.rect(29, 61, 2, 8, dark);
      badge(34, 61);
      if (a.outfit === 10) {
        q.line(
          [
            [25, 56],
            [25, 60],
            [27, 62],
            [29, 61],
          ],
          ink,
        );
        q.rect(28, 61, 2, 2, trim);
      } else {
        q.rect(22, 64, 4, 2, trim);
      }
    } else if (a.outfit === 11) {
      q.poly(
        [
          [25, 55],
          [30, 60],
          [35, 55],
          [33, 55],
          [30, 57],
          [27, 55],
        ],
        white,
      );
      pocket(32, 61);
      q.rect(23, 64, 3, 1, light);
    } else if (a.outfit === 13) {
      collar();
      q.rect(24, 58, 12, 12, light);
      buttons(27, 59, 67);
      buttons(33, 59, 67);
      q.rect(24, 66, 12, 1, trim);
    } else if (a.outfit === 15) {
      collar();
      q.rect(30, 58, 1, 5, trim);
      q.rect(23, 61, 4, 5, trim);
      q.rect(24, 62, 2, 1, white);
      q.rect(34, 61, 3, 1, trim);
    } else if (a.outfit === 16) {
      q.rect(left, 59, right - left, 2, trim);
      q.rect(left, 64, right - left, 2, trim);
      q.rect(29, 56, 2, 10, dark);
      q.rect(left - 3, 61, 4, 1, trim);
      q.rect(right, 61, 4, 1, trim);
    } else if (a.outfit === 17 || a.outfit === 18) {
      collar();
      q.rect(29, 57, 2, 5, ink);
      q.rect(left + 1, 55, 4, 1, trim);
      q.rect(right - 5, 55, 4, 1, trim);
      q.rect(left, 65, right - left, 1, ink);
      buttons(30, 62, 65);
      if (a.outfit === 17) {
        q.rect(24, 60, 4, 1, trim);
        q.rect(left - 3, 62, 4, 1, trim);
        q.rect(right, 62, 4, 1, trim);
      } else {
        q.poly(
          [
            [33, 60],
            [36, 60],
            [36, 63],
            [34, 64],
            [33, 62],
          ],
          trim,
        );
      }
    } else if (a.outfit === 19) {
      apron();
      q.rect(26, 62, 2, 2, trim);
      q.rect(31, 65, 2, 2, white);
      q.rect(33, 62, 1, 3, light);
    } else if (a.outfit === 21) {
      q.rect(left, 56, right - left, 2, light);
      q.rect(26, 59, 8, 6, dark);
      q.rect(27, 60, 3, 2, trim);
      q.rect(31, 60, 2, 1, white);
      q.rect(31, 63, 2, 1, trim);
      q.rect(left - 3, 62, 4, 1, dark);
      q.rect(right, 62, 4, 1, dark);
    } else if (a.outfit === 23) {
      q.rect(29, 56, 1, 10, white);
      q.rect(left + 1, 56, 2, 4, trim);
      q.rect(right - 3, 56, 2, 4, trim);
      q.rect(left, 64, right - left, 2, dark);
    } else if (a.outfit === 24) {
      q.poly(
        [
          [24, 55],
          [27, 57],
          [30, 56],
          [33, 57],
          [36, 55],
          [35, 60],
          [25, 60],
        ],
        main,
      );
      q.rect(22, 61, 16, 1, '#3159ce');
      q.rect(21, 63, 18, 1, trim);
      q.rect(28, 62, 4, 3, trim);
      q.rect(29, 63, 2, 1, ink);
      q.poly(
        [
          [24, 65],
          [20, 68],
          [18, 72],
          [24, 71],
          [27, 67],
        ],
        '#3159ce',
      );
      q.poly(
        [
          [35, 65],
          [39, 68],
          [42, 72],
          [36, 71],
          [32, 67],
        ],
        '#3159ce',
      );
      q.rect(23, 67, 2, 2, light);
      q.rect(34, 67, 2, 2, light);
    }
  });
}
