import type { Appearance } from '../../shared/types';
import { PixelArt, shade, type PixelPoint } from './pixelArt';
type Path = Parameters<PixelArt['path']>[0];
/** Rounded silhouettes and grouped locks drawn at native density, not enlarged coarse tiles. */
export function playerHair(
  p: PixelArt,
  a: Required<Appearance>,
  back: boolean,
  front: boolean,
  bob: number,
) {
  const h = a.hairstyle,
    base = a.hair,
    dark = shade(base, '#26283d', 0.55),
    light = shade(base, '#e9d9cb', 0.28),
    shine = shade(base, '#fff3db', 0.46);
  const shape = (q: PixelArt, commands: Path, color: string) =>
    q.path(
      commands.map(
        ([op, ...v]) => [op, ...v.map((n, i) => (i % 2 ? n + bob : n))] as [string, ...number[]],
      ),
      color,
    );
  const curve = (q: PixelArt, points: readonly PixelPoint[], color: string) =>
    q.curve(
      points.map(([x, y]) => [x, y + bob] as PixelPoint),
      color,
    );
  const long = [1, 7, 15, 17].includes(h),
    bobbed = [0, 3, 11].includes(h),
    end = long ? 73 : h === 3 ? 59 : h === 11 ? 56 : 54;
  if (front) {
    if (back) return;
    p.layer((q) => {
      // The crown joins a style-specific lower contour; no shared fringe survives underneath it.
      const fringe: Path =
        h === 14
          ? [
              ['L', 47, 34],
              ['Q', 42, 30, 35, 30.5],
              ['Q', 30, 29, 25, 30.5],
              ['Q', 18, 30, 13, 34],
            ]
          : h === 11
            ? [
                ['L', 46, 39],
                ['Q', 41, 40, 36, 38.5],
                ['Q', 32, 40, 29, 39],
                ['Q', 24, 40, 20, 38.5],
                ['L', 14, 40],
              ]
            : h === 6 || h === 9
              ? [
                  ['C', 47, 39, 45, 41, 43, 38],
                  ['Q', 42, 33, 39, 29],
                  ['C', 36, 30, 33, 36, h === 9 ? 29 : 26, h === 9 ? 37 : 41],
                  ['Q', 29, 35, 30, 30],
                  ['C', 25, 32, 20, 38, 14, 39],
                ]
              : h === 2
                ? [
                    ['L', 46, 37],
                    ['Q', 42, 37, 40, 32],
                    ['Q', 38, 36, 35, 36],
                    ['L', 34, 32],
                    ['Q', 31, 35, 28, 36],
                    ['L', 27, 32],
                    ['Q', 23, 36, 20, 36],
                    ['L', 19, 33],
                    ['Q', 16, 37, 13, 37],
                  ]
                : h === 3 || h === 15
                  ? [
                      ['Q', 48, 44, 44, 41],
                      ['C', 40, 39, 36, 36, 34, 31],
                      ['Q', 33, 36, 35, 39],
                      ['C', 31, 38, 30, 34, 29.5, 30],
                      ['C', 26, 36, 20, 41, 14, 41],
                      ['Q', 15, 35, 12, 35],
                    ]
                  : h === 1 || h === 8 || h === 16 || h === 17
                    ? [
                        ['Q', 48, 44, 44, 40],
                        ['C', 42, 34, 39, 31, 36, 28],
                        ['C', 34, 32, 30, 37, 25, 39],
                        ['Q', 26, 34, 25, 32],
                        ['C', 22, 36, 18, 40, 14, 41],
                        ['Q', 15, 36, 12, 35],
                      ]
                    : [
                        ['C', 46.5, 42, 44.5, 43, 43, 39],
                        ['C', 42, 35, 41, 33, 40, 31],
                        ['C', 37, 34, 36, 37, 33, 38],
                        ['C', 32, 37, 32, 34, 31, 32],
                        ['C', 28, 35, 27, 37, 24, 38.5],
                        ['C', 23, 37, 23, 34, 22, 33],
                        ['C', 19, 36, 18, 40, 16, 41],
                        ['C', 13, 42, 12, 39, 11.5, 36],
                      ];
      shape(
        q,
        [
          ['M', 11.5, 36],
          ['C', 10.5, 24, 18, 16.5, 29.5, 16.5],
          ['C', 42, 16.5, 49.5, 25, 48, 38],
          ...fringe,
        ],
        base,
      );
      if (h === 13)
        for (const [x, y, w] of [
          [12, 27, 10],
          [17, 20, 12],
          [27, 18, 12],
          [37, 22, 11],
          [41, 30, 8],
        ])
          q.oval(x, y + bob, w, 10, base);
      if (h !== 14)
        shape(
          q,
          [
            ['M', 40, 21],
            ['C', 47, 26, 49, 32, 47, 38],
            ['Q', 45, 42, 43.5, 38],
            ['C', 46, 31, 43, 25, 40, 21],
          ],
          dark,
        );
      // Broad, curved highlight groups; a few one-native-pixel accents give volume without noise.
      shape(
        q,
        [
          ['M', 15.5, 27],
          ['C', 19, 20, 30, 17, 38, 22],
          ['C', 34, 22.5, 30, 21, 26, 23],
          ['C', 21, 23, 19, 25, 15.5, 27],
        ],
        light,
      );
      curve(
        q,
        [
          [18, 25],
          [22, 21],
          [28, 20],
          [32, 20.5],
        ],
        shine,
      );
      curve(
        q,
        [
          [40, 26],
          [43, 29],
          [43.5, 33],
          [44, 36],
        ],
        dark,
      );
      if (h === 6 || h === 9)
        curve(
          q,
          [
            [34, 22],
            [31, 26],
            [29, 31],
            [26, 35],
          ],
          light,
        );
      if (h === 11)
        curve(
          q,
          [
            [18, 29],
            [17, 33],
            [17, 35],
            [17, 37],
          ],
          light,
        );
      if (h === 14)
        for (const [x, y] of [
          [20, 27],
          [28, 25],
          [37, 28],
        ])
          q.rect(x, y + bob, 0.5, 1, dark);
    }, dark);
    return;
  }
  p.layer((q) => {
    if (long || bobbed) {
      shape(
        q,
        [
          ['M', 16, 25],
          ['C', 8, 34, 12, 47, 9.5, end - 7],
          ['C', 8, end + 1, 18, end + 3, 21, end - 5],
          ['C', 27, end - 2, 35, end - 3, 39, end - 4],
          ['C', 43, end + 4, 53, end + 1, 50, end - 7],
          ['C', 47, 46, 52, 34, 44, 25],
          ['C', 35, 16, 24, 17, 16, 25],
        ],
        dark,
      );
      shape(
        q,
        [
          ['M', 15, 31],
          ['C', 12, 43, 16, 50, 12, end - 6],
          ['C', 12, end, 18, end, 19, end - 7],
          ['C', 22, 48, 21, 35, 23, 29],
        ],
        base,
      );
      shape(
        q,
        [
          ['M', 39, 29],
          ['C', 42, 40, 40, 52, 45, end - 4],
          ['C', 52, end, 49, end - 9, 47, end - 15],
          ['C', 46, 45, 49, 35, 44, 29],
        ],
        base,
      );
      curve(
        q,
        [
          [15, 39],
          [12.5, 49],
          [17, 58],
          [14, end - 6],
        ],
        light,
      );
      curve(
        q,
        [
          [44, 36],
          [47, 46],
          [42, 57],
          [47, end - 7],
        ],
        light,
      );
      if (h === 7 || h === 15)
        for (const [x, y] of [
          [10, h === 15 ? 51 : 47],
          [11, h === 15 ? 63 : 58],
          [45, h === 15 ? 53 : 48],
          [46, h === 15 ? 64 : 59],
        ])
          q.oval(x, y + bob, 6, 11, base);
      if (h === 17)
        for (const [x, y] of [
          [9, 54],
          [11, 63],
          [46, 53],
          [47, 64],
        ])
          q.oval(x, y + bob, 5, 8, base);
    }
    if (h === 4 || h === 10) {
      shape(
        q,
        [
          ['M', 39, h === 10 ? 12 : 21],
          ['C', 51, 9, 57, 24, 51, 36],
          ['C', 45, 47, 55, 55, 51, 67],
          ['C', 49, 74, 45, 76, 43, 75],
          ['C', 48, 66, 43, 60, 43, 55],
          ['C', 39, 42, 48, 31, 41, 27],
          ['C', 38, 24, 36, 18, 39, h === 10 ? 12 : 21],
        ],
        base,
      );
      curve(
        q,
        [
          [47, 24],
          [55, 37],
          [41, 50],
          [49, 65],
        ],
        light,
      );
      q.roundRect(40, 23 + bob, 7, 3, 1, a.accentColor);
    }
    if (h === 5)
      for (const x of [7, 42]) {
        q.oval(x, 18 + bob, 13, 14, base);
        curve(
          q,
          [
            [x + 2, 24],
            [x + 2, 19],
            [x + 9, 20],
            [x + 10, 25],
          ],
          light,
        );
        q.roundRect(x + 4, 29 + bob, 7, 2, 1, a.accentColor);
      }
    if (h === 12) {
      q.oval(39, 43 + bob, 15, 13, base);
      q.ring(42, 45 + bob, 9, 8, light);
    }
    if (h === 8 || h === 16)
      for (const [x, side] of [
        [12, -1],
        [43, 1],
      ]) {
        q.oval(x - 1, 30 + bob, 8, 21, base);
        const bottom = h === 16 ? 73 : 68;
        for (let y = 44; y < bottom; y += 5) {
          q.oval(x + (y % 2), y + bob, 6, 8, base);
          curve(
            q,
            [
              [x + 1, y + 1],
              [x + 1, y + 3],
              [x + 5, y + 3],
              [x + 5, y + 5],
            ],
            light,
          );
        }
        q.roundRect(x - 1, bottom - 2 + bob, 9, 2, 1, a.accentColor);
        shape(
          q,
          [
            ['M', x, bottom],
            ['Q', x + 3, bottom + 8, x + 6, bottom],
            ['L', x + 4, bottom + 4],
          ],
          base,
        );
        if (h === 8) q.oval(x + side, 20 + bob, 8, 13, base);
      }
    if (h === 13)
      for (const [x, y] of [
        [10, 28],
        [11, 39],
        [43, 28],
        [44, 39],
      ])
        q.oval(x, y + bob, 8, 12, base);
    q.oval(11.5, 17 + bob, 37, h === 14 ? 29 : h === 2 || h === 9 ? 33 : 37, base);
    if (back) {
      // The complete rear head covers the face footprint down to the collar for all styles.
      q.oval(14, 27 + bob, 33, 28, base);
      q.rect(25, 49 + bob, 12, 6, base);
      curve(
        q,
        [
          [18, 32],
          [14, 42],
          [16, 48],
          [22, 51],
        ],
        light,
      );
      curve(
        q,
        [
          [39, 28],
          [46, 37],
          [44, 48],
          [38, 52],
        ],
        dark,
      );
      curve(
        q,
        [
          [21, 23],
          [27, 19],
          [35, 20],
          [39, 24],
        ],
        shine,
      );
    }
  }, dark);
}
