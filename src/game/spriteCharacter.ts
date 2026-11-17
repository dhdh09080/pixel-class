import type { Appearance } from '../../shared/types';
import { defaultSprite, upgradeSprite } from '../../shared/sprite-appearance';
import { SPRITE_ASSETS } from './sprite-assets/generated';
import type { SpriteAsset, SpriteInk, SpriteMotion } from './spriteTypes';
import { shade } from './pixelArt';
import rig from './sprite-assets/rig.json';
import type { Direction } from './character';
const W = 120,
  H = 160;
const decoded = new WeakMap<SpriteAsset, Uint8Array>();
function indexes(asset: SpriteAsset) {
  let result = decoded.get(asset);
  if (result) return result;
  result = new Uint8Array(asset.width * asset.height);
  const binary = atob(asset.rle);
  let at = 0;
  for (let i = 0; i < binary.length; i += 3) {
    const count = binary.charCodeAt(i) + (binary.charCodeAt(i + 1) << 8);
    result.fill(binary.charCodeAt(i + 2), at, at + count);
    at += count;
  }
  if (at !== result.length) throw Error('Invalid compiled sprite length');
  decoded.set(asset, result);
  return result;
}
const paletteCache = new WeakMap<SpriteAsset, Map<string, number[]>>();
const lipPigments = new Map<string, string>();
function mouthPigment(skin: string) {
  const cached = lipPigments.get(skin);
  if (cached) return cached;
  const luminance = (hex: string) =>
    [1, 3, 5]
      .map((i) => {
        const n = parseInt(hex.slice(i, i + 2), 16) / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
  const skinLight = luminance(skin);
  const contrast = (hex: string) => {
    const lipLight = luminance(hex);
    return (Math.max(skinLight, lipLight) + 0.05) / (Math.min(skinLight, lipLight) + 0.05);
  };
  const dark = '#79444a',
    light = '#efb2aa';
  const pigment = contrast(dark) >= contrast(light) ? dark : light;
  if (lipPigments.size >= 16) lipPigments.delete(lipPigments.keys().next().value!);
  lipPigments.set(skin, pigment);
  return pigment;
}
function paletteFor(asset: SpriteAsset, a: Appearance) {
  let cache = paletteCache.get(asset);
  if (!cache) {
    cache = new Map();
    paletteCache.set(asset, cache);
  }
  const key = [a.skin, a.hair, a.eyes, a.outfitColor, a.accentColor, a.helmetColor].join(':');
  let value = cache.get(key);
  if (!value) {
    value = asset.palette.map((ink) => inkColor(ink, a));
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(key, value);
  }
  return value;
}
function inkColor(ink: SpriteInk, a: Appearance) {
  if (ink.material === 'transparent') return 0;
  let hex = ink.hex;
  const bases = {
    skin: a.skin,
    hair: a.hair,
    eyes: a.eyes,
    brow: a.hair,
    outfit: a.outfitColor ?? '#334b70',
    accent: a.accentColor ?? '#e7d5a6',
    hat: a.helmetColor ?? '#f7f6ed',
    blush: shade(a.skin, '#ef7897', 0.12 + (parseInt(a.skin.slice(1, 3), 16) / 255) * 0.24),
  };
  if (ink.material !== 'fixed') {
    const base = ink.material === 'mouth' ? mouthPigment(a.skin) : bases[ink.material],
      n = ink.tone;
    const rgb = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
    const warm = rgb[0] > rgb[2] * 1.12;
    const light = ink.material === 'hair' ? (warm ? '#ffe0ab' : '#bacfff') : '#fff3df';
    hex =
      n === 0
        ? shade(base, '#211b30', 0.82)
        : n === 1
          ? shade(base, '#35273d', ink.material === 'skin' ? 0.42 : 0.58)
          : n === 2
            ? shade(base, '#3d3346', ink.material === 'skin' ? 0.15 : 0.32)
            : n === 3
              ? base
              : n === 4
                ? shade(base, light, ink.material === 'skin' ? 0.12 : 0.22)
                : shade(base, light, ink.material === 'skin' ? 0.24 : 0.45);
    if (ink.material === 'brow') hex = shade(base, '#322333', 0.65 - n * 0.06);
  }
  return (
    (0xff000000 |
      (parseInt(hex.slice(5, 7), 16) << 16) |
      (parseInt(hex.slice(3, 5), 16) << 8) |
      parseInt(hex.slice(1, 3), 16)) >>>
    0
  );
}
export const SPRITE_RIG = rig;
/** PNG/indexed-layer compositor. No ellipse, polygon or vector art is drawn at runtime. */
export function spriteCharacterCanvas(
  a: Appearance,
  direction: Direction = 'down',
  frame = 0,
  seated = false,
  motion: SpriteMotion = {},
) {
  seated ||= motion.state === 'sit';
  const s = { ...defaultSprite, ...a.sprite },
    back = direction === 'up',
    side = direction === 'left' || direction === 'right';
  const phase = motion.phase ?? frame,
    bob = phase && !seated ? -1 : 0,
    blink = motion.state === 'blink';
  const pixels = new Uint32Array(W * H);
  const stamp = (
    key: string,
    x: number,
    y: number,
    opt: {
      scale?: number;
      scaleX?: number;
      bodyCut?: number;
      clip?: (x: number, y: number) => boolean;
      leg?: boolean;
      flipY?: boolean;
      only?: 'left' | 'right';
    } = {},
  ) => {
    const asset = SPRITE_ASSETS[key];
    if (!asset) throw Error('Missing sprite asset ' + key);
    const src = indexes(asset),
      palette = paletteFor(asset, a),
      scale = opt.scale ?? 1;
    const scaleX = opt.scaleX ?? scale;
    const w = Math.max(1, Math.round(asset.width * scaleX)),
      h = Math.max(1, Math.round(asset.height * scale));
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const split = Math.round((asset.splitX ?? asset.width / 2) * scale);
        if ((opt.only === 'left' && xx >= split) || (opt.only === 'right' && xx < split)) continue;
        let py = yy;
        const bodyCut = Math.round(h * (opt.bodyCut ?? 0.58)),
          sourceCut = Math.round(h * 0.58);
        if (opt.leg && yy < bodyCut) py = Math.floor((yy / bodyCut) * sourceCut);
        if (opt.leg && yy >= bodyCut) {
          const cut = bodyCut,
            delta = seated
              ? -12
              : phase === 1
                ? xx < w / 2
                  ? 2
                  : -2
                : phase === 2
                  ? xx < w / 2
                    ? -2
                    : 2
                  : 0;
          const destH = h - cut + delta;
          if (yy >= cut + destH) continue;
          py = sourceCut + Math.floor(((yy - cut) / destH) * (h - sourceCut));
        }
        const sourceY = Math.min(asset.height - 1, Math.floor(py / scale));
        const at =
          src[
            (opt.flipY ? asset.height - 1 - sourceY : sourceY) * asset.width +
              Math.min(asset.width - 1, Math.floor(xx / scaleX))
          ];
        const dx = Math.round(x) + xx,
          dy = Math.round(y) + yy;
        if (!at || dx < 0 || dy < 0 || dx >= W || dy >= H || (opt.clip && !opt.clip(dx, dy)))
          continue;
        pixels[dy * W + dx] = palette[at];
      }
  };
  const { x: hx, y: hy } = rig.hair[s.hairStyle];
  const bodyKey = (back ? 'body-back-' : 'body-front-') + s.outfitStyle,
    body = SPRITE_ASSETS[bodyKey];
  const face = SPRITE_ASSETS['face-' + s.faceShape],
    fx = rig.faces[s.faceShape].x,
    fy = rig.chinY - face.height;
  const hat = s.headwear === 'hardhat';
  if (!back) stamp('hair-rear-' + s.hairStyle, hx, hy + bob);
  const bodyScale = [1, 0.92, 1.1, 0.96][a.body] ?? 1;
  stamp(bodyKey, Math.round(70 - (body.width * bodyScale) / 2), 82, {
    leg: true,
    scaleX: bodyScale,
    bodyCut: a.body === 3 ? 0.49 : a.body === 2 ? 0.63 : 0.58,
  });
  if (back) {
    const rear = SPRITE_ASSETS['hair-back-' + s.hairStyle];
    stamp('hair-back-' + s.hairStyle, Math.round(60 - rear.width / 2), hy + bob);
  } else {
    stamp('face-' + s.faceShape, fx, fy + bob);
    const eyeStyle =
      blink || a.expression === 1
        ? 7
        : a.expression === 2
          ? 5
          : a.expression === 3
            ? 8
            : a.expression === 4
              ? 3
              : s.eyeStyle;
    const eyes = SPRITE_ASSETS['eyes-' + eyeStyle],
      scale = [0.9, 1, 1.1][s.eyeSize];
    const eyeY = rig.faces[s.faceShape].eyeY + bob + (a.expression === 2 ? -1 : 0);
    const eyeW = Math.round(eyes.width * scale),
      eyeX = rig.eyeX + (side ? 1 : 0) - Math.round((eyeW - rig.eyePairWidth) / 2),
      gap = (s.eyeSpacing - 1) * rig.eyeGapStep;
    stamp('eyes-' + eyeStyle, eyeX - gap, eyeY + (eyeStyle === 7 ? 4 : 0), { scale, only: 'left' });
    const rightEye = a.expression === 5 ? 7 : eyeStyle;
    stamp('eyes-' + rightEye, eyeX + gap, eyeY + (rightEye === 7 ? 4 : 0), {
      scale,
      only: 'right',
    });
    const browStyle = a.expression === 3 ? 1 : s.browStyle,
      brows = SPRITE_ASSETS['brows-' + browStyle];
    stamp('brows-' + browStyle, eyeX + 1, eyeY - brows.height - 2);
    const mouth =
        a.expression === 1 ? 1 : a.expression === 2 ? 2 : a.expression === 3 ? 0 : s.mouthStyle,
      m = SPRITE_ASSETS['mouth-' + mouth];
    stamp('mouth-' + mouth, rig.mouth[0] - Math.round(m.width / 2), rig.mouth[1] + bob, {
      flipY: a.expression === 3,
    });
    stamp((hat ? 'hair-fringe-worn-' : 'hair-fringe-') + s.hairStyle, hx, hy + bob);
    stamp((hat ? 'hair-side-worn-' : 'hair-side-') + s.hairStyle, hx, hy + bob);
    const acc = s.accessoryStyle;
    if (acc === 1) stamp('equipment-2', rig.glasses[0] + (side ? 1 : 0), rig.glasses[1] + bob);
    if (acc === 2) stamp('equipment-3', 34, 42 + bob);
    if (acc === 3) {
      stamp('earring-0', 30, 73 + bob);
      stamp('earring-1', 88, 72 + bob);
    }
    if (acc === 4) stamp('equipment-5', 17, 20 + bob);
    if (acc === 5) stamp('equipment-6', 27, 30 + bob);
    if (acc === 6) stamp('equipment-7', 45, 72 + bob);
  }
  if (hat) stamp(back ? 'equipment-1' : 'equipment-0', 10, 3 + bob);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const image = new ImageData(W, H),
    out = new Uint32Array(image.data.buffer);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      out[y * W + x] = pixels[y * W + (direction === 'left' ? W - 1 - x : x)];
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  return canvas;
}

/** Inspection uses the same decoded PNG palette data as classroom rendering. */
export function spriteLayerImages(input: Appearance) {
  const a = upgradeSprite(input),
    s = a.sprite;
  const keys = [
    ['뒷머리', 'hair-rear-' + s.hairStyle, rig.hair[s.hairStyle].x, rig.hair[s.hairStyle].y],
    [
      '의상',
      'body-front-' + s.outfitStyle,
      70 - Math.round(SPRITE_ASSETS['body-front-' + s.outfitStyle].width / 2),
      82,
    ],
    [
      '얼굴',
      'face-' + s.faceShape,
      rig.faces[s.faceShape].x,
      rig.chinY - SPRITE_ASSETS['face-' + s.faceShape].height,
    ],
    ['눈매', 'eyes-' + s.eyeStyle, rig.eyeX, rig.faces[s.faceShape].eyeY],
    ['옆머리', 'hair-side-' + s.hairStyle, rig.hair[s.hairStyle].x, rig.hair[s.hairStyle].y],
    ['앞머리', 'hair-fringe-' + s.hairStyle, rig.hair[s.hairStyle].x, rig.hair[s.hairStyle].y],
    [
      '뒷모습 헤어',
      'hair-back-' + s.hairStyle,
      60 - SPRITE_ASSETS['hair-back-' + s.hairStyle].width / 2,
      rig.hair[s.hairStyle].y,
    ],
    ['안전모', 'equipment-0', 10, 3],
  ] as const;
  return keys.map(([label, key, x, y]) => {
    const asset = SPRITE_ASSETS[key],
      src = indexes(asset),
      palette = paletteFor(asset, a);
    const canvas = document.createElement('canvas');
    canvas.width = asset.width;
    canvas.height = asset.height;
    const image = new ImageData(asset.width, asset.height),
      pixels = new Uint32Array(image.data.buffer);
    for (let i = 0; i < src.length; i++) pixels[i] = palette[src[i]];
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    return { label, key, x, y, width: asset.width, height: asset.height, src: canvas.toDataURL() };
  });
}
export function spriteDiagnostics(input: Appearance) {
  const a = upgradeSprite(input),
    s = a.sprite,
    canvas = spriteCharacterCanvas(a),
    image = canvas.getContext('2d')!.getImageData(0, 0, W, H),
    out = new Uint32Array(image.data.buffer);
  const colors = new Set<number>();
  let edgePixels = 0,
    partialAlpha = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const at = y * W + x,
        alpha = image.data[at * 4 + 3];
      if (alpha > 0 && alpha < 255) partialAlpha++;
      if (alpha) {
        colors.add(out[at]);
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edgePixels++;
      }
    }
  const eye = SPRITE_ASSETS['eyes-' + s.eyeStyle],
    data = indexes(eye),
    split = eye.splitX ?? eye.width / 2,
    scale = [0.9, 1, 1.1][s.eyeSize];
  const eyeX = rig.eyeX - Math.round((Math.round(eye.width * scale) - rig.eyePairWidth) / 2),
    eyeY = rig.faces[s.faceShape].eyeY;
  const total = [0, 0],
    visible = [0, 0];
  let irisOutsideFace = 0;
  const bottom = [0, 0];
  const face = SPRITE_ASSETS['face-' + s.faceShape],
    facePixels = indexes(face),
    fx = rig.faces[s.faceShape].x,
    fy = rig.chinY - face.height;
  for (let y = 0; y < eye.height; y++)
    for (let x = 0; x < eye.width; x++) {
      const index = data[y * eye.width + x],
        side = x < split ? 0 : 1;
      if (!index) continue;
      bottom[side] = Math.max(bottom[side], y);
      if (eye.palette[index].material !== 'eyes') continue;
      const dx =
          eyeX + Math.round(x * scale) + (side ? 1 : -1) * (s.eyeSpacing - 1) * rig.eyeGapStep,
        dy = eyeY + Math.round(y * scale);
      total[side]++;
      if (out[dy * W + dx] === inkColor(eye.palette[index], a)) visible[side]++;
      if (
        dx < fx ||
        dy < fy ||
        dx >= fx + face.width ||
        dy >= fy + face.height ||
        !facePixels[(dy - fy) * face.width + dx - fx]
      )
        irisOutsideFace++;
    }
  return {
    edgePixels,
    partialAlpha,
    colors: colors.size,
    irisVisible: total.map((n, i) => (n ? Math.round((visible[i] / n) * 100) : 100)),
    irisOutsideFace,
    eyeBaselineDifference: Math.abs(bottom[0] - bottom[1]),
  };
}
