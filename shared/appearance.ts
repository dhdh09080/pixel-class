import { defaultAppearance, type Appearance } from './types';

export const appearanceOptions = {
  body: ['균형 체형', '슬림 체형', '포근한 체형', '긴 팔다리'],
  hairstyle: [
    '내추럴 레이어',
    '실키 롱',
    '숏 크롭',
    '웨이브 단발',
    '포니테일',
    '트윈 번',
    '사이드 파트',
    '소프트 컬',
    '양갈래 브레이드',
    '보이시 픽시',
  ],
  eyeShape: ['동그란 눈', '웃는 눈', '또렷한 눈', '나른한 눈', '반짝이는 눈', '고양이 눈'],
  brows: ['편안한 눈썹', '올라간 눈썹', '아치 눈썹', '일자 눈썹', '도톰한 눈썹'],
  expression: ['차분한 표정', '행복한 표정', '놀란 표정', '수줍은 표정', '집중한 표정', '윙크'],
  mouth: ['작은 미소', '활짝 미소', '동그란 입', '고양이 입', '입술 미소', '새침한 입'],
  accessory: [
    '장식 없음',
    '라운드 안경',
    '반짝 스티커',
    '둥근 볼터치',
    '주근깨',
    '반창고',
    '하트 스티커',
  ],
  helmetStyle: ['안전모', '모자 벗기', '베레모', '볼캡'],
  helmetPattern: ['무지', '센터 스트라이프', '별 패턴', '도트 패턴', '체크 패턴', '꽃 포인트'],
  outfit: [
    '워크 재킷',
    '티셔츠와 데님',
    '테일러드 정장',
    '리본 드레스',
    '포근한 후디',
    '니트 카디건',
    '멜빵 팬츠',
    '트렌치 코트',
  ],
} as const;
export const appearanceColors = {
  skin: ['#f8dbc4', '#f1c6a1', '#dca57b', '#c88b63', '#9b674b', '#734b38'],
  hair: ['#292a36', '#44372d', '#57362f', '#925b32', '#be965e', '#8f7b9e', '#d8c8aa', '#627f82'],
  eyes: ['#34364a', '#62432c', '#44664b', '#497da4', '#8c699c', '#af7850'],
  helmetColor: ['#f7f6ed', '#e5b653', '#d98e96', '#7eae9e', '#7b9ebc', '#a79bc7'],
  outfitColor: [
    '#334b70',
    '#4c6d60',
    '#a85e73',
    '#b87f53',
    '#7d74a4',
    '#ded4bd',
    '#404451',
    '#83a9af',
  ],
  accentColor: ['#e7d5a6', '#f6eee0', '#af7c91', '#92b0a0', '#7394bb', '#685678'],
} as const;
/** Legacy accounts gain rendering defaults without rewriting their saved records. */
export function normalizeAppearance(value: Appearance): Required<Appearance> {
  return {
    ...defaultAppearance,
    ...value,
    helmetStyle: value.helmetStyle ?? 0,
    helmetColor: value.helmetColor ?? '#f7f6ed',
    helmetPattern: value.helmetPattern ?? 0,
    outfit: value.outfit ?? 0,
    outfitColor: value.outfitColor ?? '#334b70',
    accentColor: value.accentColor ?? '#e7d5a6',
  };
}
