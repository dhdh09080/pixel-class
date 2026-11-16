import type { Appearance } from './types';
import { normalizeAppearance } from './appearance';
export type SpriteAppearance = {
  version: 2;
  faceShape: number;
  hairStyle: number;
  eyeStyle: number;
  outfitStyle: number;
  browStyle: number;
  mouthStyle: number;
  accessoryStyle: number;
  eyeSize: number;
  eyeSpacing: number;
  headwear: 'none' | 'hardhat';
};
export const spriteChoices = {
  faceShape: ['부드러운 하트형', '차분한 소프트 스퀘어', '갸름한 다이아형', '포근한 볼형'],
  hairStyle: [
    '레이어드 메이커',
    '미드나잇 실키 롱',
    '허니 커브 단발',
    '에어리 웨이브',
    '카라멜 하이 포니',
    '테일러드 숏',
    '클라우드 컬',
    '로즈 트윈 브레이드',
  ],
  eyeStyle: [
    '맑은 아몬드 눈',
    '도도한 고양이 눈',
    '다정한 둥근 눈',
    '또렷한 집중 눈',
    '나른한 눈',
    '반짝이는 큰 눈',
    '장난스러운 눈',
    '행복한 웃는 눈',
    '수줍은 물방울 눈',
  ],
  outfitStyle: [
    '워크숍 오버롤',
    '포켓 워크 재킷',
    '허니 스쿨 카디건',
    '베리 바시티',
    '유틸리티 점프수트',
    '미드나잇 정장',
    '세이지 캐주얼',
    '리본 스쿨 유니폼',
  ],
  browStyle: ['편안한 눈썹', '부드러운 아치', '자신 있는 눈썹', '도톰한 눈썹'],
  mouthStyle: ['작은 미소', '활짝 웃기', '놀란 입', '고양이 미소'],
  accessoryStyle: [
    '장식 없음',
    '허니 라운드 안경',
    '작은 별 머리핀',
    '실버 링 귀걸이',
    '스튜디오 헤드셋',
    '베리 리본',
    '크림 마스크',
  ],
  eyeSize: ['작게', '기본', '크게'],
  eyeSpacing: ['조금 좁게', '기본', '조금 넓게'],
} as const;
export const defaultSprite: SpriteAppearance = {
  version: 2,
  faceShape: 0,
  hairStyle: 0,
  eyeStyle: 0,
  outfitStyle: 0,
  browStyle: 0,
  mouthStyle: 0,
  accessoryStyle: 0,
  eyeSize: 1,
  eyeSpacing: 1,
  headwear: 'hardhat',
};
const hairMigration = [0, 1, 5, 2, 4, 7, 5, 3, 7, 5, 4, 2, 2, 6, 5, 3, 7, 1];
const outfitMigration = [0, 3, 5, 7, 3, 2, 0, 2, 4, 1, 2, 1, 2, 2, 2, 2, 0, 5, 5, 6, 6, 4, 5, 6, 7];
/** Pure read-time migration: original legacy fields stay intact for a reversible rollout. */
export function upgradeSprite(appearance: Appearance): Appearance & { sprite: SpriteAppearance } {
  if (appearance.sprite?.version === 1 && appearance.sprite.previous)
    return { ...appearance, sprite: { ...appearance.sprite.previous } };
  if (appearance.sprite?.version === 2) return { ...appearance, sprite: { ...appearance.sprite } };
  return {
    ...normalizeAppearance(appearance),
    sprite: {
      ...defaultSprite,
      faceShape: [0, 2, 3, 1][appearance.body] ?? 0,
      hairStyle: hairMigration[appearance.hairstyle] ?? 0,
      outfitStyle: outfitMigration[appearance.outfit ?? 0] ?? 0,
      eyeStyle: [2, 7, 0, 4, 5, 1, 0, 5, 3, 6][appearance.eyeShape] ?? 0,
      browStyle: Math.min(appearance.brows, 3),
      mouthStyle: [0, 1, 2, 3, 0, 0][appearance.mouth] ?? 0,
      accessoryStyle: [0, 1, 2, 0, 0, 0, 2, 3, 6, 4][appearance.accessory] ?? 0,
      headwear: (appearance.helmetStyle ?? 0) === 0 ? 'hardhat' : 'none',
    },
  };
}
export const spriteSamples = [
  {
    name: '워크숍 메이커',
    skin: '#f1c6a1',
    hair: '#925b32',
    eyes: '#d69a31',
    outfitColor: '#334b70',
    accentColor: '#e2b344',
    sprite: { ...defaultSprite, eyeStyle: 5, mouthStyle: 1 },
  },
  {
    name: '미드나잇 롱',
    skin: '#f8dbc4',
    hair: '#292a36',
    eyes: '#2eac88',
    outfitColor: '#334b70',
    accentColor: '#e7d5a6',
    sprite: {
      ...defaultSprite,
      faceShape: 2,
      hairStyle: 1,
      eyeStyle: 0,
      outfitStyle: 1,
      headwear: 'none',
    },
  },
  {
    name: '허니 단발',
    skin: '#dca57b',
    hair: '#57362f',
    eyes: '#af7850',
    outfitColor: '#ded4bd',
    accentColor: '#e2b344',
    sprite: {
      ...defaultSprite,
      faceShape: 1,
      hairStyle: 2,
      eyeStyle: 2,
      outfitStyle: 2,
      accessoryStyle: 1,
      headwear: 'none',
    },
  },
  {
    name: '베리 바시티',
    skin: '#ffe9dc',
    hair: '#9c80d6',
    eyes: '#9754d1',
    outfitColor: '#a85e73',
    accentColor: '#e2b344',
    sprite: {
      ...defaultSprite,
      faceShape: 2,
      hairStyle: 3,
      eyeStyle: 1,
      outfitStyle: 3,
      mouthStyle: 1,
      headwear: 'none',
    },
  },
  {
    name: '카라멜 포니',
    skin: '#c88b63',
    hair: '#925b32',
    eyes: '#278bd4',
    outfitColor: '#334b70',
    accentColor: '#2f997b',
    sprite: {
      ...defaultSprite,
      faceShape: 3,
      hairStyle: 4,
      eyeStyle: 6,
      outfitStyle: 4,
      mouthStyle: 1,
      headwear: 'none',
    },
  },
  {
    name: '테일러드 숏',
    skin: '#f8dbc4',
    hair: '#292a36',
    eyes: '#737e99',
    outfitColor: '#404451',
    accentColor: '#f6eee0',
    sprite: {
      ...defaultSprite,
      faceShape: 1,
      hairStyle: 5,
      eyeStyle: 3,
      outfitStyle: 5,
      browStyle: 2,
      headwear: 'none',
    },
  },
  {
    name: '세이지 컬',
    skin: '#734b38',
    hair: '#d8c8aa',
    eyes: '#d69a31',
    outfitColor: '#83a9af',
    accentColor: '#e2b344',
    sprite: {
      ...defaultSprite,
      faceShape: 3,
      hairStyle: 6,
      eyeStyle: 8,
      outfitStyle: 6,
      headwear: 'none',
    },
  },
  {
    name: '로즈 트윈',
    skin: '#f1c6a1',
    hair: '#edc4d6',
    eyes: '#2eac88',
    outfitColor: '#4c6d60',
    accentColor: '#e2b344',
    sprite: {
      ...defaultSprite,
      faceShape: 0,
      hairStyle: 7,
      eyeStyle: 4,
      outfitStyle: 7,
      accessoryStyle: 2,
      mouthStyle: 1,
      headwear: 'none',
    },
  },
] satisfies {
  name: string;
  skin: string;
  hair: string;
  eyes: string;
  outfitColor: string;
  accentColor: string;
  sprite: SpriteAppearance;
}[];

/** Explicit v1 save keeps the last v2 design available for returning to the new art. */
export function archiveSpriteAppearance(appearance: Appearance): Appearance {
  const previous =
    appearance.sprite?.version === 2 ? appearance.sprite : appearance.sprite?.previous;
  return {
    ...appearance,
    sprite: { version: 1, ...(previous ? { previous: { ...previous } } : {}) },
  };
}
