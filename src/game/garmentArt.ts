import type { Appearance } from '../../shared/types';
import { tint } from './hairArt';
/** Fine material-specific stitching, pleats and tailored edges, never random texture noise. */
export function garmentArt(
  c: CanvasRenderingContext2D,
  a: Appearance,
  x: number,
  width: number,
  waist: number,
  back: boolean,
  step: number,
  seated: boolean,
) {
  const cloth = a.outfitColor || '#334b70',
    trim = a.accentColor || '#e7d5a6',
    dark = tint(cloth, '#292941', 0.32),
    shine = tint(cloth, '#fff1dd', 0.29),
    edge = tint(cloth, '#272739', 0.43),
    gold = tint(trim, '#8d6e48', 0.2);
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  };
  const line = (p: number[], col: string, w = 0.5) => {
    c.beginPath();
    c.moveTo(p[0], p[1]);
    c.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
    c.strokeStyle = col;
    c.lineWidth = w;
    c.stroke();
  };
  const button = (x: number, y: number) => {
    c.fillStyle = gold;
    c.beginPath();
    c.ellipse(x, y, 0.9, 0.9, 0, 0, Math.PI * 2);
    c.fill();
    r(x - 0.4, y - 0.5, 0.6, 0.5, '#fff2cf');
  };
  c.save();
  c.beginPath();
  c.roundRect(x + 1, 78, width - 2, waist - 78, 5);
  c.clip();
  line([x + 3, 82, x + 6, 86, x + 3, 92, x + 4, waist - 2], shine, 0.6);
  line([x + width - 4, 82, x + width - 6, 89, x + width - 4, 97, x + width - 5, waist], dark, 1.5);
  for (let y = 87; y < waist - 3; y += 2) r(x + 3, y, 0.5, 1, shine);
  if (!back) {
    if (a.outfit === 0) {
      for (const px of [x + 6, x + width - 13]) {
        line([px, 88, px + 2, 90, px + 5, 90, px + 7, 88], shine);
        for (let j = 0; j < 3; j++) r(px + 1 + j * 2, 93, 0.5, 0.5, shine);
        button(px + 3.5, 88.5);
      }
      for (let y = 84; y < waist; y += 5) r(47.5, y, 0.5, 0.5, '#dce4d7');
    }
    if (a.outfit === 1) {
      line([41, 79, 45, 83, 52, 83, 56, 79], shine, 0.6);
      line([39, 95, 43, 97, 44, 98, 46, 101], dark, 0.6);
    }
    if (a.outfit === 2 || a.outfit === 7) {
      line([39, 78, 40, 83, 44, 88, 46, 92], shine, 0.9);
      line([57, 78, 56, 83, 52, 88, 50, 92], shine, 0.9);
      line([39, 79, 41, 84, 43, 87, 44, 90], dark, 0.5);
      line([57, 79, 55, 84, 53, 87, 52, 90], dark, 0.5);
      r(47, 82, 0.5, 9, tint(trim, '#fff3db', 0.5));
      button(49, 97);
      r(55, 87, 5, 0.5, '#d9dfcf');
      if (a.outfit === 7) for (const px of [42, 54]) for (const yy of [86, 98, 104]) button(px, yy);
    }
    if (a.outfit === 3) {
      c.fillStyle = tint(trim, '#fff9e9', 0.6);
      c.beginPath();
      c.moveTo(40, 78);
      c.quadraticCurveTo(48, 85, 56, 78);
      c.lineTo(54, 81);
      c.quadraticCurveTo(48, 87, 42, 81);
      c.closePath();
      c.fill();
      for (let yy = 84; yy < 88; yy += 1.5) r(47.5, yy, 1, 0.5, gold);
      line([41, 86, 44, 88, 52, 88, 55, 86], edge, 0.7);
      for (let i = 0; i < 5; i++) {
        const px = x + 5 + (i * (width - 10)) / 4;
        line(
          [px, 90, px - 1, 95, px - 2, 100, px - 3, waist + 2],
          i % 2 ? shine : dark,
          i % 2 ? 0.55 : 1.1,
        );
      }
    }
    if (a.outfit === 4 || a.outfit === 5) {
      for (let y = 90; y < waist - 4; y += 3)
        for (const px of [x + 6, x + width - 7]) {
          line([px, y, px + 1, y + 0.5, px + 1, y + 1, px, y + 1.5], shine, 0.5);
        }
      for (let px = x + 4; px < x + width - 3; px += 2) r(px, waist - 2, 0.5, 1.5, shine);
    }
    if (a.outfit === 6) {
      for (const px of [37.5, 56.5]) {
        r(px, 79, 0.5, 6, shine);
        button(px + 1, 85);
      }
      line([43, 91, 44, 96, 51, 96, 53, 91], shine, 0.5);
      for (let j = 0; j < 4; j++) r(40 + j * 4, 100, 0.5, 0.5, shine);
    }
  }
  c.restore();
  if (a.outfit === 3) {
    const hem = waist + 2;
    line(
      [
        x + 1,
        hem - 1,
        x + width * 0.35,
        hem + 1,
        x + width * 0.65,
        hem + 1,
        x + width - 1,
        hem - 1,
      ],
      tint(trim, '#fff4dc', 0.35),
      0.6,
    );
    for (let px = x + 3; px < x + width - 2; px += 3) {
      c.fillStyle = tint(trim, '#fff8ed', 0.55);
      c.beginPath();
      c.arc(px, hem + 1, 1, 0, Math.PI);
      c.fill();
    }
    if (!back) {
      c.fillStyle = trim;
      c.strokeStyle = gold;
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(47, 82);
      c.bezierCurveTo(36, 75, 38, 86, 47, 83);
      c.bezierCurveTo(58, 87, 60, 75, 49, 82);
      c.closePath();
      c.fill();
      c.stroke();
      r(47, 80.5, 2, 3, '#f6e8c7');
      line([40, 80, 42, 79, 44, 81, 46, 82], tint(trim, '#fff9e8', 0.6), 0.5);
    }
  }
  // A few deliberate footwear details remain legible at game zoom.
  if (!back)
    for (const [lx, offset] of [
      [36, step],
      [51, -step],
    ]) {
      const foot = seated ? 112 : 121 + offset;
      r(lx, foot, 8, 0.5, tint(cloth, '#ece7d5', 0.45));
      if (a.outfit === 1 || a.outfit === 4)
        for (let j = 0; j < 3; j++) r(lx + 2 + j * 2, foot + 1, 1, 0.5, '#faf6e8');
    }
}
