import { type Appearance } from '../../shared/types';
import { normalizeAppearance } from '../../shared/appearance';
export type Direction = 'down' | 'up' | 'left' | 'right';
export const CHARACTER_WIDTH = 96;
export const CHARACTER_HEIGHT = 128;
export const CHARACTER_SCALE = 0.575;
const blend = (hex: string, target: string, ratio: number) => {
  const channel = (i: number) =>
    Math.round(
      parseInt(hex.slice(i, i + 2), 16) * (1 - ratio) +
        parseInt(target.slice(i, i + 2), 16) * ratio,
    )
      .toString(16)
      .padStart(2, '0');
  return '#' + channel(1) + channel(3) + channel(5);
};

/** Original layered pixel art. The 96×128 source uses real 1px details, never a scaled 48px image. */
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
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const p = (points: number[][], color: string) => {
    c.fillStyle = color;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  };
  const pixelOval = (x: number, y: number, w: number, h: number, color: string) => {
    const sx = Math.min(4, Math.floor(w / 3)),
      sy = Math.min(5, Math.floor(h / 3));
    r(x + sx, y, w - sx * 2, h, color);
    r(x + Math.floor(sx / 2), y + 1, w - Math.floor(sx / 2) * 2, h - 2, color);
    r(x, y + sy, w, h - sy * 2, color);
  };
  const outline = '#343344',
    skinShade = blend(a.skin, '#a45c58', 0.25),
    skinLight = blend(a.skin, '#fff8e8', 0.18);
  const hairShade = blend(a.hair, '#211d32', 0.4),
    hairLight = blend(a.hair, '#f9d9b1', 0.24);
  const cloth = a.outfitColor,
    clothDark = blend(cloth, '#22263c', 0.38),
    clothLight = blend(cloth, '#fff5df', 0.22),
    trim = a.accentColor;
  const side = direction === 'left' || direction === 'right',
    back = direction === 'up';
  const step = frame === 1 ? -3 : frame === 2 ? 3 : 0;
  const bob = frame === 0 ? 0 : -1;
  if (direction === 'left') {
    c.translate(96, 0);
    c.scale(-1, 1);
  }
  c.translate(0, bob);
  const width = [36, 32, 42, 34][a.body] ?? 36,
    x = 48 - width / 2;
  const waist = seated ? 99 : a.body === 3 ? 99 : 103;
  // Long hair is behind the shoulders and never covers the eyes or UI nameplate.
  if ([1, 3, 8].includes(a.hairstyle)) {
    p(
      [
        [23, 29],
        [73, 29],
        [76, 60],
        [73, 82],
        [77, 94],
        [64, 96],
        [59, 76],
        [36, 76],
        [32, 95],
        [19, 92],
        [23, 70],
      ],
      hairShade,
    );
    for (const hx of [24, 28, 66, 70]) r(hx, 43, 2, 40, a.hair);
  }
  if (a.hairstyle === 4) {
    p(
      [
        [66, 24],
        [79, 26],
        [85, 35],
        [84, 56],
        [78, 76],
        [68, 84],
        [71, 66],
        [74, 40],
        [65, 36],
      ],
      hairShade,
    );
    r(77, 37, 2, 24, hairLight);
    r(70, 29, 9, 5, trim);
    r(73, 28, 3, 7, blend(trim, '#ffffff', 0.3));
  }
  if (a.hairstyle === 5)
    for (const hx of [14, 67]) {
      pixelOval(hx, 20, 16, 18, hairShade);
      r(hx + 4, 22, 7, 2, hairLight);
      r(hx + 2, 35, 12, 3, trim);
    }
  // Shoes, stockings and articulated walking frames share the same foot anchor.
  const legY = seated ? 103 : waist;
  const shoe =
    a.outfit === 3 ? '#674754' : a.outfit === 1 || a.outfit === 4 ? '#e8e4d9' : '#293143';
  for (const [lx, offset] of [
    [35, step],
    [51, -step],
  ]) {
    const footY = seated ? 113 : 120 + offset;
    r(lx - 1, legY, 13, footY - legY + 2, outline);
    r(
      lx,
      legY,
      10,
      footY - legY,
      a.outfit === 3
        ? skinLight
        : a.outfit === 2 || a.outfit === 6 || a.outfit === 7
          ? clothDark
          : '#435a78',
    );
    r(lx + 1, legY + 2, 2, Math.max(1, footY - legY - 3), a.outfit === 3 ? '#f2eadd' : '#607b97');
    r(lx - 3, footY, 16, 5, outline);
    r(lx - 2, footY, 14, 3, shoe);
    r(lx - 1, footY, 8, 1, blend(shoe, '#fff7e5', 0.38));
    if (a.outfit === 1 || a.outfit === 4) {
      r(lx + 3, footY + 1, 5, 1, '#a5a9b2');
      r(lx - 2, footY + 3, 14, 1, '#f8f5e9');
    }
  }
  // Rounded shoulder silhouette; clothing silhouettes are distinct, not recolored uniforms.
  const hem = a.outfit === 3 || a.outfit === 7 ? waist + 4 : waist;
  p(
    [
      [x + 7, 74],
      [x + width - 7, 74],
      [x + width - 3, 78],
      [x + width, 87],
      [x + width - 1, hem],
      [x + 1, hem],
      [x, 87],
      [x + 3, 78],
    ],
    clothDark,
  );
  p(
    [
      [x + 7, 76],
      [x + width - 7, 76],
      [x + width - 2, 85],
      [x + width - 3, hem - 2],
      [x + 3, hem - 2],
      [x + 2, 85],
    ],
    cloth,
  );
  r(x + 5, 80, 2, hem - 84, clothLight);
  r(x + width - 5, 83, 2, hem - 86, clothDark);
  r(43, 69, 10, 9, skinShade);
  r(44, 69, 8, 7, skinLight);
  // Small hands and sleeve cuffs move in opposition to the feet.
  for (const [ax, shift] of [
    [x - 6, -step],
    [x + width - 1, step],
  ]) {
    const ay = seated ? 84 : 79 + shift;
    const short = a.outfit === 1 || a.outfit === 3;
    pixelOval(ax, ay, 8, short ? 12 : 20, clothDark);
    r(ax + 1, ay + 2, 5, short ? 8 : 16, clothLight);
    r(ax + 1, ay + (short ? 9 : 16), 6, 2, trim);
    pixelOval(ax + 1, ay + (short ? 12 : 19), 7, short ? 13 : 7, skinShade);
    r(ax + 2, ay + (short ? 12 : 19), 4, short ? 10 : 5, skinLight);
    r(ax + 5, ay + (short ? 19 : 22), 1, 2, skinShade);
  }
  if (a.outfit === 0) {
    r(46, 77, 3, waist - 78, clothDark);
    r(49, 78, 1, waist - 80, clothLight);
    for (const px of [x + 9, x + width - 16]) {
      r(px, 86, 9, 8, clothDark);
      r(px, 86, 9, 2, trim);
      r(px + 2, 89, 5, 1, clothLight);
    }
    r(x + 3, 80, width - 6, 2, '#9eb1bc');
    r(45, 77, 5, 3, trim);
  } else if (a.outfit === 1) {
    p(
      [
        [40, 76],
        [48, 81],
        [56, 76],
        [53, 84],
        [43, 84],
      ],
      clothDark,
    );
    r(42, 78, 12, 2, trim);
    r(45, 88, 6, 5, trim);
    r(46, 87, 4, 7, trim);
    r(x + 3, waist - 3, width - 6, 2, clothDark);
  } else if (a.outfit === 2) {
    p(
      [
        [40, 75],
        [48, 95],
        [56, 75],
      ],
      '#faf1df',
    );
    p(
      [
        [38, 76],
        [46, 92],
        [40, 91],
        [35, 83],
      ],
      clothLight,
    );
    p(
      [
        [57, 76],
        [50, 92],
        [57, 91],
        [61, 83],
      ],
      clothLight,
    );
    p(
      [
        [46, 79],
        [50, 79],
        [51, 91],
        [48, 94],
        [45, 91],
      ],
      trim,
    );
    r(48, 97, 2, 2, trim);
    r(57, 86, 6, 2, trim);
  } else if (a.outfit === 3) {
    p(
      [
        [x + 7, 88],
        [x + width - 7, 88],
        [x + width + 4, hem],
        [x + width + 2, hem + 2],
        [x - 2, hem + 2],
        [x - 4, hem],
      ],
      clothDark,
    );
    p(
      [
        [x + 8, 89],
        [x + width - 8, 89],
        [x + width + 1, hem - 1],
        [x - 1, hem - 1],
      ],
      cloth,
    );
    for (let px = x + 5; px < x + width - 1; px += 7) r(px, 94, 2, hem - 96, clothLight);
    r(x + 5, 87, width - 10, 3, trim);
    r(x - 1, hem - 2, width + 2, 2, trim);
    p(
      [
        [39, 78],
        [47, 81],
        [39, 84],
      ],
      trim,
    );
    p(
      [
        [57, 78],
        [49, 81],
        [57, 84],
      ],
      trim,
    );
    r(47, 80, 3, 3, '#f8ecce');
  } else if (a.outfit === 4) {
    p(
      [
        [35, 76],
        [40, 86],
        [48, 89],
        [56, 86],
        [61, 76],
        [55, 75],
        [48, 82],
        [41, 75],
      ],
      clothLight,
    );
    r(42, 84, 1, 9, trim);
    r(53, 84, 1, 9, trim);
    r(39, 95, 18, 5, clothDark);
    r(40, 95, 16, 1, clothLight);
    r(x + 4, waist - 3, width - 8, 2, trim);
  } else if (a.outfit === 5) {
    p(
      [
        [40, 76],
        [48, 86],
        [56, 76],
        [53, 102],
        [43, 102],
      ],
      trim,
    );
    r(47, 85, 2, waist - 86, clothDark);
    for (let y = 88; y < waist - 1; y += 5) r(48, y, 2, 2, '#eee0bb');
    for (const px of [x + 6, x + width - 12]) {
      r(px, 93, 6, 5, clothDark);
      r(px, 93, 6, 1, clothLight);
    }
  } else if (a.outfit === 6) {
    r(x + 4, 77, width - 8, 10, trim);
    r(36, 76, 4, 18, clothDark);
    r(56, 76, 4, 18, clothDark);
    r(38, 86, 20, 15, clothLight);
    r(39, 87, 18, 13, cloth);
    r(43, 90, 10, 6, clothDark);
    r(44, 90, 8, 1, trim);
    r(37, 84, 2, 2, '#e8cf8b');
    r(57, 84, 2, 2, '#e8cf8b');
  } else {
    p(
      [
        [39, 75],
        [47, 90],
        [40, 87],
        [34, 82],
      ],
      clothLight,
    );
    p(
      [
        [57, 75],
        [49, 90],
        [57, 87],
        [62, 82],
      ],
      clothLight,
    );
    r(x + 3, 91, width - 6, 3, trim);
    r(46, 90, 5, 5, clothDark);
    r(47, 91, 3, 3, trim);
    for (const px of [42, 53]) for (const y of [84, 98, 103]) r(px, y, 2, 2, clothDark);
  }
  if (back) {
    r(x + 4, 78, width - 8, waist - 80, cloth);
    if (a.outfit === 4) {
      pixelOval(36, 76, 24, 13, clothDark);
      r(40, 78, 16, 2, clothLight);
    }
    if (a.outfit === 6) {
      r(38, 77, 3, 23, clothDark);
      r(55, 77, 3, 23, clothDark);
    }
    if (a.outfit === 3)
      for (let px = x + 7; px < x + width - 2; px += 6) r(px, 94, 1, waist - 95, clothLight);
    r(45, 78, 2, 18, clothDark);
    r(x + 7, 80, width - 14, 1, clothLight);
  }
  // Stepped face, 1px contour and reflected light give a softer high-density silhouette.
  pixelOval(22, 22, 52, 48, hairShade);
  if (a.hairstyle === 7)
    for (const [hx, hy] of [
      [18, 28],
      [22, 20],
      [32, 16],
      [52, 16],
      [66, 20],
      [72, 30],
    ])
      pixelOval(hx, hy, 12, 14, a.hair);
  pixelOval(26, 36, 44, 35, skinShade);
  pixelOval(28, 36, 40, 33, skinLight);
  r(34, 68, 28, 3, skinShade);
  r(37, 69, 22, 2, skinLight);
  for (const ex of [23, 68]) {
    pixelOval(ex, 49, 6, 12, skinShade);
    r(ex + 2, 52, 2, 5, a.skin);
  }
  if (back) {
    pixelOval(24, 30, 48, 41, a.hair);
    for (const hx of [30, 39, 53, 64]) {
      r(hx, 34, 1, 27, hairLight);
      r(hx + 2, 42, 1, 23, hairShade);
    }
    r(36, 69, 24, 2, hairShade);
  } else {
    // Front bangs are distinct for every style; eyes remain readable under every hat.
    const bangY = a.helmetStyle === 0 ? 37 : 29;
    p(
      [
        [27, 25],
        [65, 25],
        [69, 39],
        [65, 45],
        [61, 40],
        [57, 44],
        [53, 37],
        [48, 43],
        [42, 36],
        [36, 43],
        [31, 39],
        [27, 46],
      ],
      a.hair,
    );
    if ([0, 6, 9].includes(a.hairstyle))
      p(
        [
          [27, bangY - 3],
          [65, bangY - 7],
          [65, bangY],
          [55, bangY + 7],
          [52, bangY + 2],
          [44, bangY + 10],
          [42, bangY + 3],
          [32, bangY + 8],
        ],
        hairShade,
      );
    if (a.hairstyle === 6) {
      p(
        [
          [28, 28],
          [63, 25],
          [66, 33],
          [49, 44],
          [46, 39],
          [33, 46],
        ],
        a.hair,
      );
      r(36, 32, 17, 1, hairLight);
      r(34, 34, 13, 1, hairLight);
    }
    if (a.hairstyle === 9) {
      p(
        [
          [25, 32],
          [30, 23],
          [37, 27],
          [42, 19],
          [49, 26],
          [57, 21],
          [63, 28],
          [69, 26],
          [66, 39],
          [57, 36],
          [53, 42],
          [45, 35],
          [37, 42],
          [32, 36],
        ],
        a.hair,
      );
      r(42, 26, 2, 7, hairLight);
      r(57, 28, 2, 6, hairLight);
    }
    if (a.hairstyle === 2) {
      r(29, bangY, 37, 5, a.hair);
      for (const hx of [32, 41, 54, 61]) r(hx, bangY + 4, 4, 4, a.hair);
    }
    if ([1, 3, 8].includes(a.hairstyle))
      for (const hx of [26, 65]) {
        r(hx, 39, 5, a.hairstyle === 1 ? 40 : 28, a.hair);
        r(hx + 1, 43, 1, 21, hairLight);
      }
    if (a.hairstyle === 3)
      for (const [hx, hy] of [
        [23, 49],
        [66, 49],
        [25, 62],
        [65, 65],
      ])
        pixelOval(hx, hy, 7, 10, a.hair);
    if (a.hairstyle === 8)
      for (const hx of [25, 66])
        for (let y = 64; y < 92; y += 5) {
          r(hx + (y % 2), y, 5, 5, hairShade);
          r(hx + 1, y, 3, 3, hairLight);
        }
    for (const [hx, hy] of [
      [32, 31],
      [39, 28],
      [54, 29],
      [61, 34],
    ])
      r(hx, hy, 2, 6, hairLight);
    const eye = (ex: number, wink: boolean) => {
      if (a.eyeShape === 1 || wink) {
        p(
          [
            [ex, 54],
            [ex + 3, 51],
            [ex + 7, 51],
            [ex + 10, 54],
            [ex + 9, 56],
            [ex + 6, 53],
            [ex + 3, 53],
            [ex + 1, 56],
          ],
          outline,
        );
        return;
      }
      const eh = a.eyeShape === 3 ? 8 : a.eyeShape === 2 ? 12 : 11;
      const ey = a.eyeShape === 3 ? 52 : 49;
      r(ex + 1, ey, 8, eh, outline);
      r(ex, ey + 2, 10, eh - 4, outline);
      r(ex + 2, ey + 2, 6, eh - 3, a.eyes);
      r(ex + 2, ey + eh - 4, 6, 2, blend(a.eyes, '#fff2cc', 0.42));
      r(ex + 4, ey + 3, 3, eh - 5, '#29273b');
      r(ex + 2, ey + 1, 3, 3, '#fffaf1');
      r(ex + 6, ey + 6, 1, 2, '#fffaf1');
      r(ex - 1, ey, 11, 1, outline);
      if (a.eyeShape === 5) {
        r(ex - 2, ey - 1, 4, 2, outline);
        r(ex + 8, ey - 1, 3, 2, outline);
      }
      if (a.eyeShape === 4) {
        r(ex + 4, ey + 1, 1, 5, '#fff');
        r(ex + 2, ey + 3, 5, 1, '#fff');
      }
    };
    const eyes = side ? [57] : [33, 53];
    eyes.forEach((ex, i) => eye(ex, a.expression === 5 && i === 1));
    eyes.forEach((ex, i) => {
      const by = a.brows === 1 || a.expression === 2 ? 44 : 46;
      if (a.brows === 2)
        p(
          [
            [ex, by + 1],
            [ex + 3, by - 1],
            [ex + 7, by - 1],
            [ex + 10, by + 1],
            [ex + 9, by + 2],
            [ex + 2, by + 1],
          ],
          hairShade,
        );
      else {
        r(ex + 1, by, 8, a.brows === 4 ? 3 : a.brows === 3 ? 1 : 2, hairShade);
        if (a.expression === 4 || a.brows === 1) r(ex + (i ? 0 : 6), by + 1, 4, 2, hairShade);
      }
    });
    const blush = blend(a.skin, '#e78892', 0.44);
    for (const bx of side ? [48] : [30, 61]) {
      r(bx, 61, 6, 2, blush);
      r(bx + 1, 60, 4, 1, blend(a.skin, blush, 0.6));
    }
    r(side ? 70 : 47, 58, 2, 3, skinShade);
    r(side ? 69 : 46, 58, 1, 1, '#fff0da');
    const mx = side ? 61 : 43,
      my = 65;
    const mouth = a.mouth;
    if (mouth === 1) {
      r(mx, my, 10, 3, '#995a66');
      r(mx + 1, my, 8, 1, '#fff7e9');
      r(mx + 3, my + 2, 5, 1, '#df94a0');
    } else if (mouth === 2) {
      r(mx + 3, my - 1, 4, 5, '#995a66');
      r(mx + 4, my, 2, 2, '#6f4255');
    } else if (mouth === 3) {
      r(mx, my, 2, 1, '#995a66');
      r(mx + 2, my + 1, 2, 1, '#995a66');
      r(mx + 4, my, 2, 1, '#995a66');
      r(mx + 6, my + 1, 2, 1, '#995a66');
      r(mx + 8, my, 2, 1, '#995a66');
    } else if (mouth === 4) {
      r(mx + 1, my, 8, 2, '#bb6e7c');
      r(mx + 3, my - 1, 4, 1, '#d88a94');
    } else if (mouth === 5) {
      r(mx + 2, my, 6, 1, '#995a66');
      r(mx + 6, my - 1, 2, 1, '#995a66');
    } else {
      r(mx + 1, my, 8, 1, '#a96870');
      r(mx + 3, my + 1, 4, 1, '#a96870');
    }
    if (a.expression === 1) {
      r(30, 62, 6, 2, blush);
      r(61, 62, 6, 2, blush);
      r(32, 47, 5, 1, skinLight);
    }
    if (a.expression === 3)
      for (const bx of [30, 61]) for (let dx = 0; dx < 5; dx += 2) r(bx + dx, 60, 1, 4, '#d88b94');
    if (a.accessory === 1) {
      for (const ex of eyes) {
        r(ex - 2, 48, 14, 1, '#7e6e70');
        r(ex - 3, 50, 1, 10, '#7e6e70');
        r(ex + 12, 50, 1, 10, '#7e6e70');
        r(ex - 1, 61, 12, 1, '#7e6e70');
      }
      if (!side) r(45, 52, 6, 1, '#7e6e70');
    }
    if (a.accessory === 2) {
      r(66, 57, 1, 7, '#fff2b6');
      r(63, 60, 7, 1, '#fff2b6');
    }
    if (a.accessory === 3)
      for (const bx of [30, 61]) {
        r(bx, 59, 6, 4, '#eaa2a1');
        r(bx + 1, 59, 4, 1, '#f4c1b7');
      }
    if (a.accessory === 4)
      for (const [fx, fy] of [
        [32, 60],
        [36, 62],
        [40, 61],
        [59, 61],
        [63, 62],
        [66, 60],
      ])
        r(fx, fy, 1, 1, '#ad7868');
    if (a.accessory === 5) {
      r(61, 59, 9, 4, '#e1bd8a');
      r(65, 59, 1, 4, '#fff0ce');
      r(63, 60, 1, 1, '#af8c65');
      r(67, 61, 1, 1, '#af8c65');
    }
    if (a.accessory === 6) {
      r(62, 58, 2, 2, '#c57888');
      r(65, 58, 2, 2, '#c57888');
      r(63, 60, 3, 2, '#c57888');
      r(64, 62, 1, 1, '#c57888');
    }
  }
  // Headwear has its own color, shading and clipped pixel pattern layer.
  if (a.helmetStyle !== 1) {
    const hat = a.helmetColor,
      shade = blend(hat, '#465269', 0.3),
      light = blend(hat, '#fffaf0', 0.4);
    c.save();
    c.beginPath();
    c.moveTo(20, 25);
    c.lineTo(25, 15);
    c.lineTo(35, 9);
    c.lineTo(61, 9);
    c.lineTo(71, 15);
    c.lineTo(76, 25);
    c.lineTo(76, 38);
    c.lineTo(20, 38);
    c.closePath();
    c.clip();
    r(18, 7, 60, 34, shade);
    r(22, 10, 49, 25, hat);
    r(29, 13, 3, 18, light);
    r(34, 11, 22, 2, light);
    r(70, 23, 4, 14, shade);
    if (a.helmetStyle === 0) {
      r(44, 8, 8, 29, light);
      r(44, 8, 1, 29, '#fffdf2');
      for (const hx of [26, 65]) {
        r(hx, 25, 5, 2, shade);
        r(hx, 29, 5, 1, shade);
      }
    }
    if (a.helmetStyle === 2) {
      r(18, 7, 60, 6, shade);
      r(20, 15, 8, 15, light);
    }
    if (a.helmetStyle === 3) {
      r(47, 12, 1, 25, shade);
      r(50, 14, 1, 20, light);
    }
    if (a.helmetPattern === 1) {
      r(39, 9, 4, 30, trim);
      r(54, 9, 4, 30, trim);
    }
    if (a.helmetPattern === 2)
      for (const [sx, sy] of [
        [32, 24],
        [60, 29],
        [53, 17],
      ]) {
        r(sx, sy - 3, 1, 7, trim);
        r(sx - 3, sy, 7, 1, trim);
        r(sx - 1, sy - 1, 3, 3, trim);
      }
    if (a.helmetPattern === 3)
      for (let hy = 16; hy < 35; hy += 7)
        for (let hx = 27; hx < 73; hx += 8) r(hx + (hy % 2 ? 0 : 3), hy, 2, 2, trim);
    if (a.helmetPattern === 4)
      for (let hy = 12; hy < 37; hy += 5)
        for (let hx = 23; hx < 76; hx += 5)
          if (((hx - 23 + hy - 12) / 5) % 2 === 0) r(hx, hy, 5, 5, trim);
    if (a.helmetPattern === 5) {
      r(59, 24, 9, 3, trim);
      r(62, 21, 3, 9, trim);
      r(62, 24, 3, 3, '#f5ca6a');
    }
    c.restore();
    if (a.helmetStyle === 0) {
      r(17, 36, 62, 5, shade);
      r(16, 34, 64, 5, light);
      r(22, 34, 52, 1, '#fffdf5');
      r(25, 40, 46, 1, shade);
    }
    if (a.helmetStyle === 2) {
      r(25, 36, 48, 5, shade);
      r(31, 35, 35, 2, hat);
      r(46, 6, 6, 4, shade);
    }
    if (a.helmetStyle === 3) {
      r(24, 35, 47, 4, shade);
      r(side ? 59 : 29, 38, side ? 25 : 38, 4, hat);
      r(side ? 61 : 31, 41, side ? 22 : 34, 1, shade);
    }
  }
  return canvas;
}
