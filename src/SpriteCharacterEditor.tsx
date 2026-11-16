import { useState } from 'react';
import {
  Check,
  Eye,
  ChevronLeft,
  ChevronRight,
  HardHat,
  Scissors,
  Shirt,
  Smile,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { Appearance } from '../shared/types';
import { appearanceColors, appearanceOptions } from '../shared/appearance';
import {
  spriteChoices,
  spriteSamples,
  upgradeSprite,
  type SpriteAppearance,
} from '../shared/sprite-appearance';
import { Avatar, Field } from './components';
import { Button } from './ui';
import type { Direction } from './game/character';
const categories = [
  { key: 'hair', label: '헤어', icon: Scissors },
  { key: 'face', label: '얼굴', icon: Smile },
  { key: 'body', label: '체형', icon: UserRound },
  { key: 'hat', label: '모자', icon: HardHat },
  { key: 'clothes', label: '의상', icon: Shirt },
] as const;
const labels: Record<keyof typeof spriteChoices, string> = {
  faceShape: '얼굴형',
  hairStyle: '헤어스타일',
  eyeStyle: '눈매',
  outfitStyle: '의상',
  browStyle: '눈썹',
  mouthStyle: '입 모양',
  accessoryStyle: '액세서리',
  eyeSize: '눈 크기',
  eyeSpacing: '눈 간격',
};
const colorLabels = {
  skin: '피부색',
  hair: '머리카락',
  eyes: '눈 색상',
  outfitColor: '의상 색상',
  accentColor: '포인트 색상',
  helmetColor: '안전모 색상',
} as const;
export function SpriteCharacterEditor({
  initialName,
  initialAppearance,
  onSave,
  onCancel,
  onLegacy,
  busy = false,
}: {
  initialName: string;
  initialAppearance: Appearance;
  onSave: (name: string, a: Appearance) => void;
  onCancel?: () => void;
  onLegacy: (name: string, a: Appearance) => void;
  busy?: boolean;
}) {
  const [name, setName] = useState(initialName),
    [a, setA] = useState(() => upgradeSprite(initialAppearance));
  const [category, setCategory] = useState<(typeof categories)[number]['key']>('hair'),
    [direction, setDirection] = useState(0),
    [blink, setBlink] = useState(false);
  const choose = <K extends keyof SpriteAppearance>(key: K, value: SpriteAppearance[K]) =>
    setA((prev) => ({ ...prev, sprite: { ...prev.sprite, [key]: value } }));
  const colors = (key: keyof typeof colorLabels) => (
    <fieldset className="studio-color-group" disabled={busy}>
      <legend>{colorLabels[key]}</legend>
      <div className="studio-swatches">
        {appearanceColors[key].map((color) => (
          <button
            type="button"
            key={color}
            style={{ '--swatch': color } as React.CSSProperties}
            aria-label={`${colorLabels[key]} ${color}`}
            aria-pressed={a[key] === color}
            onClick={() => setA((prev) => ({ ...prev, [key]: color }))}
          >
            {a[key] === color && <Check size={17} />}
          </button>
        ))}
      </div>
    </fieldset>
  );
  const options = (key: keyof typeof spriteChoices, face = false) => (
    <fieldset className="studio-option-group" disabled={busy}>
      <legend>
        {labels[key]}
        <span>{spriteChoices[key].length}가지</span>
      </legend>
      <div className={`studio-choice-grid ${face ? 'face-choices' : ''}`}>
        {spriteChoices[key].map((label, index) => {
          const sample = {
            ...a,
            sprite: {
              ...a.sprite,
              [key]: index,
              ...(key === 'hairStyle' ? { headwear: 'none' as const } : {}),
            },
          };
          return (
            <button
              type="button"
              key={label}
              className={`studio-choice ${a.sprite[key] === index ? 'is-selected' : ''}`}
              aria-label={`${labels[key]}: ${label}`}
              aria-pressed={a.sprite[key] === index}
              onClick={() => choose(key, index)}
            >
              <span className="studio-choice-art">
                <Avatar appearance={sample} size={face ? 152 : 100} decorative />
              </span>
              <span>{label}</span>
              {a.sprite[key] === index && (
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
  const directions: Direction[] = ['down', 'right', 'up', 'left'];
  return (
    <form
      className="character-editor character-studio sprite-studio"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSave(name, a);
      }}
    >
      <aside className="character-preview">
        <p className="studio-eyebrow">
          <Sparkles size={13} /> MY PIXEL IDENTITY
        </p>
        <span className="preview-name">{name || '나의 이름'}</span>
        <Avatar
          appearance={a}
          size={288}
          direction={directions[direction]}
          motion={{ state: blink ? 'blink' : 'idle' }}
        />
        <div className="studio-stage" aria-hidden="true" />
        <div className="studio-rotate">
          <button
            type="button"
            aria-label="캐릭터 왼쪽으로 돌리기"
            onClick={() => setDirection((direction + 3) % 4)}
          >
            <ChevronLeft size={17} />
          </button>
          <span>{['정면', '오른쪽', '뒷모습', '왼쪽'][direction]}</span>
          <button
            type="button"
            aria-label="캐릭터 오른쪽으로 돌리기"
            onClick={() => setDirection((direction + 1) % 4)}
          >
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            className="sprite-blink-button"
            aria-label="눈 깜빡임 보기"
            title="눈 깜빡임 보기"
            aria-pressed={blink}
            onClick={() => setBlink(!blink)}
          >
            <Eye size={16} />
          </button>
        </div>
        <Field label="이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            required
            disabled={busy}
          />
        </Field>
        <p className="studio-preview-note">
          고른 모습은 저장 후 교실에 반영돼요.
          <br />
          얼굴과 헤어, 옷을 자유롭게 조합하세요.
        </p>
      </aside>
      <section className="studio-workbench" aria-label="캐릭터 스타일 선택">
        <div className="studio-heading">
          <div>
            <p className="studio-eyebrow">CHARACTER STUDIO</p>
            <h3>나만의 픽셀 캐릭터</h3>
          </div>
          <span className="studio-live">
            <i />
            실시간 미리보기
          </span>
        </div>
        <div className="sprite-studio-mode">
          <a href="/character-art" target="_blank" rel="noreferrer">
            8종 아트·전후 비교 보기
          </a>
          <button type="button" onClick={() => onLegacy(name, a)} disabled={busy}>
            이전 캐릭터 스타일
          </button>
        </div>
        <div className="studio-categories" role="group" aria-label="꾸미기 카테고리">
          {categories.map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              key={key}
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
              <fieldset className="studio-option-group" disabled={busy}>
                <legend>
                  추천 코디<span>피부색·체형은 유지해요</span>
                </legend>
                <div className="studio-presets">
                  {spriteSamples.map(({ name: label, skin: _skin, ...sample }) => {
                    const value = { ...a, ...sample };
                    return (
                      <button
                        type="button"
                        className="studio-preset"
                        key={label}
                        aria-label={`새 스타일 프리셋: ${label}`}
                        onClick={() => setA(value)}
                      >
                        <Avatar appearance={value} size={100} decorative />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              {options('hairStyle')}
              {colors('hair')}
              {a.sprite.headwear !== 'none' && (
                <button
                  type="button"
                  className="studio-hint"
                  onClick={() => choose('headwear', 'none')}
                >
                  <HardHat size={16} />
                  안전모를 벗고 헤어 보기
                  <ChevronRight size={15} />
                </button>
              )}
            </>
          )}
          {category === 'face' && (
            <>
              {options('faceShape', true)}
              {options('eyeStyle', true)}
              {colors('eyes')}
              {options('eyeSize', true)}
              {options('eyeSpacing', true)}
              {options('browStyle', true)}
              {options('mouthStyle', true)}
              <fieldset className="studio-option-group" disabled={busy}>
                <legend>표정</legend>
                <div className="studio-choice-grid face-choices">
                  {appearanceOptions.expression.map((label, index) => (
                    <button
                      type="button"
                      className={`studio-choice ${a.expression === index ? 'is-selected' : ''}`}
                      key={label}
                      aria-label={`표정: ${label}`}
                      aria-pressed={a.expression === index}
                      onClick={() => setA((prev) => ({ ...prev, expression: index }))}
                    >
                      <span className="studio-choice-art">
                        <Avatar appearance={{ ...a, expression: index }} size={152} decorative />
                      </span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              {options('accessoryStyle', true)}
            </>
          )}
          {category === 'body' && (
            <>
              {colors('skin')}
              <fieldset className="studio-option-group" disabled={busy}>
                <legend>체형</legend>
                <div className="studio-choice-grid">
                  {appearanceOptions.body.map((label, index) => (
                    <button
                      type="button"
                      className={`studio-choice ${a.body === index ? 'is-selected' : ''}`}
                      aria-label={`체형: ${label}`}
                      aria-pressed={a.body === index}
                      key={label}
                      onClick={() => setA((prev) => ({ ...prev, body: index }))}
                    >
                      <span className="studio-choice-art">
                        <Avatar appearance={{ ...a, body: index }} size={100} decorative />
                      </span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className="studio-help">어떤 체형을 골라도 이동 속도와 책상 사용은 같아요.</p>
            </>
          )}
          {category === 'hat' && (
            <>
              <fieldset className="studio-option-group" disabled={busy}>
                <legend>안전모</legend>
                <div className="sprite-hat-toggle">
                  {(['none', 'hardhat'] as const).map((v, index) => (
                    <button
                      type="button"
                      className="studio-choice"
                      key={v}
                      aria-label={index ? '안전모 쓰기' : '안전모 벗기'}
                      aria-pressed={a.sprite.headwear === v}
                      onClick={() => choose('headwear', v)}
                    >
                      <Avatar
                        appearance={{ ...a, sprite: { ...a.sprite, headwear: v } }}
                        size={120}
                        decorative
                      />
                      <span>{index ? '안전모 쓰기' : '안전모 벗기'}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              {a.sprite.headwear === 'hardhat' && colors('helmetColor')}
              <p className="studio-help">모자 아래 앞머리와 옆머리는 헤어에 맞춰 유지돼요.</p>
            </>
          )}
          {category === 'clothes' && (
            <>
              {options('outfitStyle')}
              {colors('outfitColor')}
              {colors('accentColor')}
              <p className="studio-help">모든 코디는 성별 제한 없이 조합할 수 있어요.</p>
            </>
          )}
        </div>
        <div className="form-actions studio-actions">
          <span>저장 전까지 기존 정보는 유지돼요</span>
          {onCancel && (
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              취소
            </Button>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? '저장 중…' : '이 모습으로 저장하기'}
          </Button>
        </div>
      </section>
    </form>
  );
}
