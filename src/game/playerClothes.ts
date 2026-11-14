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
    dark = shade(main, '#283147', 0.3),
    light = shade(main, '#fff3d5', 0.24),
    trim = a.accentColor,
    white = '#fff1da',
    ink = shade(main, '#29283c', 0.62),
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
      q.roundRect(x, 64, 5, foot - 64, 1, dress || shorts ? skin : dark);
      q.rect(x, 65, 1, Math.max(1, foot - 66), dress || shorts ? skinShadow : light);
      q.poly(
        [
          [x, foot],
          [x + 5, foot],
          [x + 6, foot + 1],
          [x + 5, foot + 2],
          [x - 1, foot + 2],
          [x - 1, foot + 1],
        ],
        ink,
      );
      q.rect(x, foot, 5, 1, a.outfit === 1 || a.outfit === 4 ? white : dark);
      q.rect(x + 1, foot + 1, 3, 1, shade(main, '#fff3d5', 0.16));
    }
  });
  p.layer((q) => {
    q.path(
      [
        ['M', left + 3, 55],
        ['L', right - 3, 55],
        ['Q', right + 1, 55.5, right + 1, 59],
        ['L', right, 66],
        ['L', left, 66],
        ['L', left - 1, 59],
        ['Q', left - 1, 55.5, left + 3, 55],
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
      q.path(
        [
          ['M', x + 1, y],
          ['Q', x + 4, y, x + 4, y + 2],
          ['L', x + 3.5, y + (short ? 5 : 8)],
          ['L', x + 0.5, y + (short ? 5 : 8)],
          ['Q', x - 0.5, y + 2, x + 1, y],
        ],
        main,
      );
      q.curve(
        [
          [x + 0.5, y + 1],
          [x, y + 2],
          [x + 0.5, y + 3],
          [x + 0.5, y + (short ? 4 : 6)],
        ],
        light,
      );
      const handY = y + (short ? 5 : 8);
      q.oval(x + 0.5, handY, 3.5, 3.5, skin);
      q.curve(
        [
          [x + 3, handY + 1],
          [x + 4, handY + 2],
          [x + 3, handY + 3],
          [x + 2, handY + 3],
        ],
        skinShadow,
      );
      q.rect(x + 1, handY + 1, 1, 1, shade(skin, '#fff1da', 0.2));
    }
    if (dress) {
      q.path(
        [
          ['M', left + 2, 62],
          ['L', right - 2, 62],
          ['Q', right, 65, right + 3, 70],
          ['Q', right, 72, right - 3, 71.5],
          ['L', left + 3, 71.5],
          ['Q', left, 72, left - 3, 70],
          ['Q', left, 65, left + 2, 62],
        ],
        main,
      );
      q.curve(
        [
          [left - 2, 70],
          [left + 4, 71],
          [right - 4, 71],
          [right + 2, 70],
        ],
        trim,
      );
      for (const [x, bend] of [
        [left + 4, -1],
        [29, 0],
        [right - 4, 1],
      ]) {
        q.curve(
          [
            [x, 64],
            [x + bend, 66],
            [x + bend, 68],
            [x + bend * 2, 69],
          ],
          bend > 0 ? dark : light,
        );
      }
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
