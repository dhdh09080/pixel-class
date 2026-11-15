export type SpriteMaterial =
  | 'transparent'
  | 'fixed'
  | 'skin'
  | 'blush'
  | 'hair'
  | 'eyes'
  | 'brow'
  | 'outfit'
  | 'accent'
  | 'hat';
export type SpriteInk = { hex: string; material: SpriteMaterial; tone: number };
export type SpriteAsset = {
  width: number;
  height: number;
  palette: SpriteInk[];
  rle: string;
  sha256: string;
  splitX?: number;
};
export type SpriteMotion = { state?: 'idle' | 'walk' | 'sit' | 'blink'; phase?: number };
