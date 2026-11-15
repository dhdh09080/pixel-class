import { z } from 'zod';
import { appearanceOptions } from './appearance';
import { spriteChoices } from './sprite-appearance';
const spriteIndex = (key: keyof typeof spriteChoices) =>
  z
    .number()
    .int()
    .min(0)
    .max(spriteChoices[key].length - 1);
export const spriteAppearanceSchema = z
  .object({
    version: z.literal(2),
    faceShape: spriteIndex('faceShape'),
    hairStyle: spriteIndex('hairStyle'),
    eyeStyle: spriteIndex('eyeStyle'),
    outfitStyle: spriteIndex('outfitStyle'),
    browStyle: spriteIndex('browStyle'),
    mouthStyle: spriteIndex('mouthStyle'),
    accessoryStyle: spriteIndex('accessoryStyle'),
    eyeSize: spriteIndex('eyeSize'),
    eyeSpacing: spriteIndex('eyeSpacing'),
    headwear: z.enum(['none', 'hardhat']),
  })
  .strict();

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const index = (key: keyof typeof appearanceOptions) =>
  z
    .number()
    .int()
    .min(0)
    .max(appearanceOptions[key].length - 1);
export const appearanceSchema = z.object({
  sprite: z
    .union([
      spriteAppearanceSchema,
      z.object({ version: z.literal(1), previous: spriteAppearanceSchema.optional() }).strict(),
    ])
    .optional(),
  skin: color,
  hair: color,
  eyes: color,
  body: index('body'),
  hairstyle: index('hairstyle'),
  eyeShape: index('eyeShape'),
  brows: index('brows'),
  mouth: index('mouth'),
  expression: index('expression'),
  accessory: index('accessory'),
  helmetStyle: index('helmetStyle').optional(),
  helmetColor: color.optional(),
  helmetPattern: index('helmetPattern').optional(),
  outfit: index('outfit').optional(),
  outfitColor: color.optional(),
  accentColor: color.optional(),
});
