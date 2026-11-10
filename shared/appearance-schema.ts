import { z } from 'zod';
import { appearanceOptions } from './appearance';

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const index = (key: keyof typeof appearanceOptions) =>
  z
    .number()
    .int()
    .min(0)
    .max(appearanceOptions[key].length - 1);
export const appearanceSchema = z.object({
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
