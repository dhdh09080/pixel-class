import { useState } from 'react';
import {
  Save,
  Check,
  ChevronLeft,
  ChevronRight,
  UserRound,
  Scissors,
  Smile,
  HardHat,
  Shirt,
  Sparkles,
} from 'lucide-react';
import { defaultAppearance, type Appearance, type Member } from '../shared/types';
import { appearanceOptions, appearanceColors, normalizeAppearance } from '../shared/appearance';
import { type Direction } from './game/character';
import { Button } from './ui';
import { Avatar, Field } from './components';
const categories = [
  { key: 'hair', label: '헤어', icon: Scissors },
  { key: 'face', label: '얼굴', icon: Smile },
  { key: 'body', label: '체형', icon: UserRound },
  { key: 'hat', label: '모자', icon: HardHat },
  { key: 'clothes', label: '의상', icon: Shirt },
] as const;
type Category = (typeof categories)[number]['key'];
type ChoiceKey = keyof typeof appearanceOptions;
type ColorKey = keyof typeof appearanceColors;
const titles: Record<ChoiceKey, string> = {
  body: '체형',
  hairstyle: '헤어스타일',
  eyeShape: '눈 모양',
  brows: '눈썹',
  expression: '표정',
  mouth: '입 모양',
  accessory: '얼굴 장식',
  helmetStyle: '모자 종류',
  helmetPattern: '모자 패턴',
  outfit: '의상 종류',
};
const colorTitles: Record<ColorKey, string> = {
  skin: '피부색',
  hair: '머리카락',
  eyes: '눈 색상',
  helmetColor: '모자 색상',
  outfitColor: '의상 색상',
  accentColor: '포인트 색상',
};
const directions: Direction[] = ['down', 'right', 'up', 'left'];

export function CharacterEditor({
  member,
  onSave,
  busy = false,
  onCancel,
}: {
  member?: Member;
  onSave: (name: string, appearance: Appearance) => void;
  busy?: boolean;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(member?.name || '');
  const [a, setA] = useState(() => normalizeAppearance(member?.appearance || defaultAppearance));
  const [category, setCategory] = useState<Category>('hair');
  const [rotation, setRotation] = useState(0);
  const choose = <K extends keyof Appearance>(key: K, value: Appearance[K]) =>
    setA((previous) => ({ ...previous, [key]: value }));
  const colors = (field: ColorKey) => (
    <fieldset className="studio-color-group" disabled={busy}>
      <legend>{colorTitles[field]}</legend>
      <div className="studio-swatches">
        {appearanceColors[field].map((color) => (
          <button
            type="button"
            key={color}
            style={{ '--swatch': color } as React.CSSProperties}
            onClick={() => choose(field, color)}
            aria-label={`${colorTitles[field]} ${color}`}
            aria-pressed={a[field] === color}
          >
            {a[field] === color && <Check size={17} />}
          </button>
        ))}
      </div>
    </fieldset>
  );
  const options = (field: ChoiceKey, face = false) => (
    <fieldset className="studio-option-group" disabled={busy}>
      <legend>
        {titles[field]}
        <span>{appearanceOptions[field].length}가지</span>
      </legend>
      <div className={`studio-choice-grid ${face ? 'face-choices' : ''}`}>
        {appearanceOptions[field].map((label, index) => {
          const sample = {
            ...a,
            [field]: index,
            ...(field === 'hairstyle' ? { helmetStyle: 1 } : {}),
            ...(field === 'helmetPattern' && a.helmetStyle === 1 ? { helmetStyle: 0 } : {}),
          };
          return (
            <button
              type="button"
              className={`studio-choice ${a[field] === index ? 'is-selected' : ''}`}
              key={label}
              aria-label={`${titles[field]}: ${label}`}
              aria-pressed={a[field] === index}
              onClick={() => choose(field, index)}
            >
              <span className="studio-choice-art">
                <Avatar appearance={sample} size={face ? 152 : 100} decorative />
              </span>
              <span>{label}</span>
              {a[field] === index && (
                <i aria-hidden="true">
                  <Check size={11} />
                </i>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
  return (
    <form
      className="character-editor character-studio"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSave(name, a);
      }}
    >
      <aside className="character-preview">
        <p className="studio-eyebrow">
          <Sparkles size={13} /> MY LITTLE IDENTITY
        </p>
        <span className="preview-name">{name || '나의 이름'}</span>
        <Avatar appearance={a} size={288} direction={directions[rotation]} />
        <div className="studio-stage" aria-hidden="true" />
        <div className="studio-rotate">
          <button
            type="button"
            aria-label="캐릭터 왼쪽으로 돌리기"
            onClick={() => setRotation((rotation + 3) % 4)}
          >
            <ChevronLeft size={17} />
          </button>
          <span>{['정면', '오른쪽', '뒷모습', '왼쪽'][rotation]}</span>
          <button
            type="button"
            aria-label="캐릭터 오른쪽으로 돌리기"
            onClick={() => setRotation((rotation + 1) % 4)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <Field label="이름">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            required
            placeholder="교실에서 사용할 이름"
            disabled={busy}
          />
        </Field>
        <p className="studio-preview-note">
          작은 픽셀 하나까지, 나답게.
          <br />
          선택한 모습이 교실에도 그대로 저장돼요.
        </p>
      </aside>
      <section className="studio-workbench" aria-label="캐릭터 스타일 선택">
        <div className="studio-heading">
          <div>
            <p className="studio-eyebrow">CHARACTER STUDIO</p>
            <h3>오늘은 어떤 모습일까요?</h3>
          </div>
          <span className="studio-live">
            <i /> 실시간 미리보기
          </span>
        </div>
        <div className="studio-categories" role="group" aria-label="꾸미기 카테고리">
          {categories.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="studio-selections" key={category}>
          {category === 'hair' && (
            <>
              {options('hairstyle')}
              {colors('hair')}
              {a.helmetStyle !== 1 && (
                <button
                  type="button"
                  className="studio-hint"
                  onClick={() => choose('helmetStyle', 1)}
                >
                  <HardHat size={16} /> 모자를 벗고 헤어스타일 자세히 보기{' '}
                  <ChevronRight size={15} />
                </button>
              )}
            </>
          )}
          {category === 'face' && (
            <>
              {options('eyeShape', true)}
              {colors('eyes')}
              {options('brows', true)}
              {options('expression', true)}
              {options('mouth', true)}
              {options('accessory', true)}
            </>
          )}
          {category === 'body' && (
            <>
              {options('body')}
              {colors('skin')}
              <p className="studio-help">체형이 달라도 교실의 이동 속도와 책상 사용은 같아요.</p>
            </>
          )}
          {category === 'hat' && (
            <>
              {options('helmetStyle')}
              {colors('helmetColor')}
              {options('helmetPattern')}
              {colors('accentColor')}
            </>
          )}
          {category === 'clothes' && (
            <>
              {options('outfit')}
              {colors('outfitColor')}
              {colors('accentColor')}
              <p className="studio-help">
                티셔츠부터 드레스까지. 색상과 포인트를 조합해 나만의 옷장을 만들어 보세요.
              </p>
            </>
          )}
        </div>
        <div className="form-actions studio-actions">
          <span>저장 전까지 기존 모습은 유지돼요</span>
          {onCancel && (
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              취소
            </Button>
          )}
          <Button type="submit" variant="primary" busy={busy}>
            <Save size={16} />
            {busy ? '저장 중…' : '이 모습으로 저장하기'}
          </Button>
        </div>
      </section>
    </form>
  );
}
