import type { Appearance } from '../../shared/types';
import { PixelArt, shade } from './pixelArt';
export function playerHeadwear(p: PixelArt, a: Required<Appearance>, back: boolean, bob: number) {
  const ink = '#403b48',
    white = '#fff8e9';
  const hat = a.helmetStyle,
    color = a.helmetColor,
    dark = shade(color, '#647078', 0.28),
    light = shade(color, '#fff1da', 0.4),
    trim = a.accentColor;
  if (hat !== 1) {
    p.layer((q) => {
      if (hat === 0 || hat === 6) {
        q.path(
          [
            ['M', 10, 31 + bob],
            ['C', 10.5, 10 + bob, 47.5, 10 + bob, 49, 31 + bob],
            ['L', 49, 32 + bob],
            ['L', 10, 32 + bob],
          ],
          color,
        );
        q.path(
          [
            ['M', 13, 27 + bob],
            ['C', 15, 20 + bob, 23, 16 + bob, 32, 17 + bob],
            ['C', 24, 18 + bob, 19, 22 + bob, 18, 27 + bob],
          ],
          light,
        );
        q.curve(
          [
            [29, 17 + bob],
            [27.5, 20 + bob],
            [28, 25 + bob],
            [28, 29 + bob],
          ],
          light,
        );
        q.oval(8, 30.5 + bob, 44, 4.5, dark);
        q.oval(8, 30 + bob, 44, 4, color);
        q.curve(
          [
            [10, 31 + bob],
            [23, 29.5 + bob],
            [37, 29.5 + bob],
            [50, 31 + bob],
          ],
          light,
        );
        if (hat === 6 && !back) {
          q.roundRect(23, 21 + bob, 14, 7, 1, trim);
          q.rect(26, 22 + bob, 8, 0.5, light);
        }
      } else if ([2, 3, 7, 8, 9, 10].includes(hat)) {
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
}
