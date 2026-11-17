import { spriteCharacterCanvas } from './spriteCharacter';
import { upgradeSprite } from '../../shared/sprite-appearance';
import type { SpriteMotion } from './spriteTypes';
import type { Appearance } from '../../shared/types';
import { normalizeAppearance } from '../../shared/appearance';
import { PixelArt } from './pixelArt';
import { playerHair } from './playerHair';
import { playerClothes } from './playerClothes';
import { playerFace, playerFaceAccessory } from './playerFace';
import { playerHeadwear } from './playerHeadwear';
export type Direction = 'down' | 'up' | 'left' | 'right';
export const CHARACTER_WIDTH = 120;
export const CHARACTER_HEIGHT = 160;
export const CHARACTER_DENSITY = 2;
export const CHARACTER_SCALE = 0.46;
export const CHARACTER_ART_VERSION = 'sprite-assets-v2-balanced-face';
export const characterOrigin = (a: Appearance, direction: Direction = 'down') =>
  a.sprite?.version === 1
    ? { x: 0.5, y: 1 }
    : { x: (direction === 'left' ? 50 : 70) / 120, y: 156 / 160 };
/** True 120×160 raster art; display/world dimensions remain unchanged. */
export function characterCanvas(
  input: Appearance,
  direction: Direction = 'down',
  frame = 0,
  seated = false,
  motion: SpriteMotion = {},
) {
  if (input.sprite?.version !== 1)
    return spriteCharacterCanvas(upgradeSprite(input), direction, frame, seated, motion);
  return legacyCharacterCanvas(input, direction, frame, seated);
}
/** Archived v1 renderer, used only for explicit compatibility mode and before comparisons. */
export function legacyCharacterCanvas(
  input: Appearance,
  direction: Direction = 'down',
  frame = 0,
  seated = false,
) {
  const a = normalizeAppearance(input),
    p = new PixelArt(CHARACTER_WIDTH, CHARACTER_HEIGHT, CHARACTER_DENSITY);
  const back = direction === 'up',
    side = direction === 'left' || direction === 'right',
    step = frame === 1 ? -1 : frame === 2 ? 1 : 0,
    bob = frame ? -0.5 : 0;
  playerHair(p, a, back, false, bob);
  playerClothes(p, a, back, step, seated);
  if (!back) playerFace(p, a, side, bob);
  playerHair(p, a, back, true, bob);
  if (!back) playerFaceAccessory(p, a, bob);
  playerHeadwear(p, a, back, bob);
  return p.canvas(direction === 'left');
}
