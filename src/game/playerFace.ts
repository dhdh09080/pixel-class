import type { Appearance } from '../../shared/types';
import { PixelArt, shade, type PixelPoint } from './pixelArt';
/** Face drawing uses half-logical-pixel features: one dot on the 120×160 source. */
export function playerFace(p: PixelArt, a: Required<Appearance>, side: boolean, bob: number) {
  const skin = a.skin,
    shadow = shade(skin, '#a66e73', 0.24),
    blush = shade(skin, '#ed97a4', 0.32),
    light = shade(skin, '#fff5e4', 0.18),
    rim = shade(skin, '#79545b', 0.42),
    ink = '#302a3d',
    white = '#fff9ed';
  p.layer((q) => {
    q.oval(13, 39 + bob, 5.5, 7, skin);
    q.oval(42.5, 39 + bob, 5.5, 7, skin);
    q.oval(14.5, 28 + bob, 32, 27, skin);
    q.curve(
      [
        [16, 44 + bob],
        [16, 49 + bob],
        [22, 53.5 + bob],
        [28, 54 + bob],
      ],
      shadow,
    );
    q.curve(
      [
        [33, 54 + bob],
        [38, 54 + bob],
        [43, 50 + bob],
        [44.5, 47 + bob],
      ],
      shadow,
    );
    q.oval(15, 41 + bob, 1.5, 3, shadow);
    q.oval(44, 41 + bob, 1.5, 3, shadow);
    q.oval(23, 32 + bob, 13, 8, light);
  }, rim);
  const cheekY = 49 + bob;
  p.oval(18, cheekY, 5, 2.5, blush);
  p.oval(39, cheekY, 5, 2.5, blush);
  const eyeDark = shade(a.eyes, ink, 0.34),
    eyeLight = shade(a.eyes, '#fff0d2', 0.38);
  for (const [i, x] of (side ? [22.5, 36] : [20, 35.5]).entries()) {
    const w = side && i === 0 ? 6.5 : 8.5,
      y = 42 + bob + (a.eyeShape === 3 ? 1 : 0),
      h = [6.5, 6, 7, 4.5, 7.5, 6, 6, 7, 5, 6.5][a.eyeShape] ?? 7;
    const wink = a.expression === 5 && i === 1;
    if (a.eyeShape === 1 || wink) {
      p.curve(
        [
          [x, y + 3],
          [x + 1, y],
          [x + w - 2, y],
          [x + w, y + 2.5],
        ],
        ink,
      );
      p.curve(
        [
          [x + 0.5, y + 3.5],
          [x + 2, y + 1],
          [x + w - 2, y + 1],
          [x + w - 0.5, y + 3],
        ],
        ink,
      );
    } else {
      // Almond whites and an oval iris replace the old nested rectangular blocks.
      p.path(
        [
          ['M', x, y + 2],
          ['C', x + 1, y - 0.5, x + w - 1, y - 0.5, x + w, y + 1.5],
          ['Q', x + w, y + h, x + w / 2, y + h],
          ['Q', x, y + h, x, y + 2],
        ],
        white,
      );
      const iw = w > 8 ? 6.5 : 5,
        ix = x + (w - iw) / 2;
      // Flat upper iris, softly rounded lower edge: the lid shapes the eye, not a circular ring.
      p.path(
        [
          ['M', ix, y + 0.5],
          ['L', ix + iw, y + 0.5],
          ['L', ix + iw, y + h - 2],
          ['Q', ix + iw / 2, y + h + 0.5, ix, y + h - 2],
        ],
        eyeDark,
      );
      p.path(
        [
          ['M', ix + 0.5, y + 1],
          ['L', ix + iw - 0.5, y + 1],
          ['L', ix + iw - 0.5, y + h - 2],
          ['Q', ix + iw / 2, y + h, ix + 0.5, y + h - 2],
        ],
        a.eyes,
      );
      p.oval(ix + 0.5, y + h - 2.5, iw - 1, 2, eyeLight);
      p.oval(ix + 2, y + 1, Math.max(1.5, iw - 4), Math.max(2, h - 3), ink);
      p.rect(ix + 1, y + 1, 1.5, 1.5, white);
      p.rect(ix + iw - 2, y + h - 2, 0.5, 0.5, white);
      const strongLash = [2, 4, 5, 9].includes(a.eyeShape),
        lift = a.eyeShape === 5 || a.eyeShape === 9 ? (i ? -0.5 : 0.5) : 0;
      p.path(
        [
          ['M', x - 0.5, y + 1.5 + lift],
          ['C', x + 1, y - 1, x + w - 1, y - 1, x + w + 0.5, y + 1.5 - lift],
          ['L', x + w - 0.5, y + (strongLash ? 1.5 : 1) - lift],
          ['C', x + w - 2, y + 0.5, x + 2, y + 0.5, x + 0.5, y + (strongLash ? 2 : 1.5) + lift],
        ],
        ink,
      );
      if (a.eyeShape === 4) {
        p.rect(ix + 2.5, y + 3, 0.5, 1.5, white);
        p.rect(ix + 2, y + 3.5, 1.5, 0.5, white);
      }
      if (a.eyeShape === 5 || a.eyeShape === 9)
        p.line(
          [
            [i ? x + w : x - 1.5, y],
            [i ? x + w + 1.5 : x - 0.5, y - 1],
          ],
          ink,
        );
      if (a.eyeShape === 6)
        p.curve(
          [
            [x + 0.5, y + h],
            [x + 2, y + h + 0.5],
            [x + w - 2, y + h + 0.5],
            [x + w - 0.5, y + h - 0.5],
          ],
          eyeDark,
        );
      if (a.eyeShape === 7) p.rect(ix + iw - 2, y + 1, 1, 1, white);
      if (a.eyeShape === 8)
        p.curve(
          [
            [x, y + 0.5],
            [x + 2, y - 0.5],
            [x + w - 1, y],
            [x + w, y + 1],
          ],
          ink,
        );
    }
    const by = 39.8 + bob - (a.expression === 2 ? 1 : 0),
      brow = shade(a.hair, skin, 0.45),
      lift = a.brows === 1 ? 1.2 : a.brows === 2 ? 0.8 : 0;
    const points: PixelPoint[] = [
      [x + 0.5, by + 0.5],
      [x + 2, by - lift],
      [x + w - 3, by - lift],
      [x + w - 1, by + (a.brows === 3 ? 0.5 : 0)],
    ];
    if (a.expression === 4) {
      points[0] = [x + 0.5, by + (i ? 1 : -0.5)];
      points[3] = [x + w - 1, by + (i ? -0.5 : 1)];
    }
    p.curve(points, brow);
    if (a.brows === 4)
      p.curve(
        points.map(([xx, yy]) => [xx, yy + 0.5] as PixelPoint),
        brow,
      );
  }
  const lip = shade(skin, '#a45c72', 0.6),
    my = 52.2 + bob;
  if (a.expression === 2 || a.mouth === 2) {
    p.oval(29.5, my - 1, 2, 2, lip);
    p.rect(30, my - 0.5, 0.5, 0.5, shadow);
  } else if (a.mouth === 1) {
    p.oval(28.5, my - 1, 4, 2.5, lip);
    p.rect(29, my - 0.5, 3, 0.5, white);
  } else if (a.mouth === 3)
    p.line(
      [
        [28.5, my],
        [29.5, my + 0.5],
        [30.5, my - 0.5],
        [31.5, my + 0.5],
        [32.5, my],
      ],
      lip,
    );
  else if (a.mouth === 4) {
    p.curve(
      [
        [29, my],
        [30, my + 0.5],
        [31, my + 0.5],
        [32, my],
      ],
      lip,
    );
    p.rect(30, my + 0.5, 1, 0.5, blush);
  } else if (a.mouth === 5)
    p.curve(
      [
        [29, my],
        [30, my - 0.5],
        [31.5, my],
        [32, my],
      ],
      lip,
    );
  else
    p.curve(
      [
        [29, my],
        [30, my + 1],
        [31, my + 1],
        [32, my - 0.5],
      ],
      lip,
    );
  if (a.expression === 1) {
    p.oval(17.5, 48.5 + bob, 6, 3, blush);
    p.oval(38.5, 48.5 + bob, 6, 3, blush);
    p.curve(
      [
        [28.5, my - 0.5],
        [30, my + 1.5],
        [31.5, my + 1.5],
        [33, my - 0.5],
      ],
      lip,
    );
  }
  if (a.expression === 3)
    for (const x of [19, 40])
      for (let n = 0; n < 3; n++)
        p.line(
          [
            [x + n, 48.5 + bob],
            [x + n - 0.5, 50 + bob],
          ],
          lip,
        );
}
export function playerFaceAccessory(p: PixelArt, a: Required<Appearance>, bob: number) {
  const rim = shade(a.hair, a.skin, 0.35),
    blush = shade(a.skin, '#ed97a4', 0.32),
    shadow = shade(a.skin, '#a66e73', 0.24),
    trim = a.accentColor;
  if (a.accessory === 1) {
    p.ring(18.5, 40.5 + bob, 12, 10.5, rim);
    p.ring(32.5, 40.5 + bob, 12, 10.5, rim);
    p.curve(
      [
        [30.5, 44 + bob],
        [31, 43.5 + bob],
        [32, 43.5 + bob],
        [32.5, 44 + bob],
      ],
      rim,
    );
    p.line(
      [
        [16, 43 + bob],
        [19, 43.5 + bob],
      ],
      rim,
    );
    p.line(
      [
        [44, 43.5 + bob],
        [46, 43 + bob],
      ],
      rim,
    );
  } else if (a.accessory === 2) {
    p.ring(43.5, 48 + bob, 2, 4, trim);
    p.rect(44, 48 + bob, 0.5, 0.5, '#fff9ed');
  } else if (a.accessory === 3) {
    p.oval(17, 48 + bob, 7, 3.5, blush);
    p.oval(38, 48 + bob, 7, 3.5, blush);
  } else if (a.accessory === 4)
    for (const x of [19, 40])
      for (const [dx, dy] of [
        [0, 1],
        [1.5, 0],
        [3, 1.5],
      ])
        p.rect(x + dx, 48 + bob + dy, 0.5, 0.5, shadow);
  else if (a.accessory === 5) {
    p.roundRect(17, 48.5 + bob, 7, 2.5, 1, trim);
    p.rect(19.5, 49 + bob, 0.5, 1.5, shadow);
  } else if (a.accessory === 6)
    p.path(
      [
        ['M', 40, 49 + bob],
        ['C', 38, 46 + bob, 41, 46 + bob, 42, 48 + bob],
        ['C', 44, 46 + bob, 47, 47 + bob, 42, 52 + bob],
      ],
      shade(a.skin, '#a45c72', 0.6),
    );
  else if (a.accessory === 7) {
    p.ring(45, 47 + bob, 3.5, 5, '#b8c9df');
    p.rect(46, 47.5 + bob, 0.5, 1, '#fff9ed');
  } else if (a.accessory === 8) {
    p.path(
      [
        ['M', 23, 49 + bob],
        ['Q', 31, 47.5 + bob, 39, 49 + bob],
        ['Q', 38, 54 + bob, 31, 55 + bob],
        ['Q', 24, 54 + bob, 23, 49 + bob],
      ],
      '#e7f0ec',
    );
    p.curve(
      [
        [25, 50 + bob],
        [29, 51 + bob],
        [34, 51 + bob],
        [37, 50 + bob],
      ],
      '#acc5cb',
    );
  } else if (a.accessory === 9) {
    p.roundRect(45, 42 + bob, 3, 5, 1, rim);
    p.curve(
      [
        [46, 46 + bob],
        [47, 51 + bob],
        [43, 52 + bob],
        [39, 51 + bob],
      ],
      rim,
    );
    p.oval(38, 50 + bob, 2, 1.5, rim);
  }
}
