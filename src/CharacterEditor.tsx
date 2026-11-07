import { useState } from 'react';
import { Save, Sparkles, ShieldCheck } from 'lucide-react';
import { defaultAppearance, type Appearance, type Member } from '../shared/types';
import { Avatar, Field } from './components';
export function CharacterEditor({
  member,
  onSave,
  busy = false,
}: {
  member?: Member;
  onSave: (name: string, appearance: Appearance) => void;
  busy?: boolean;
}) {
  const [name, setName] = useState(member?.name || '');
  const [a, setA] = useState<Appearance>(member?.appearance || defaultAppearance);
  const choose = <K extends keyof Appearance>(key: K, value: Appearance[K]) =>
    setA((p) => ({ ...p, [key]: value }));
  return (
    <div className="character-editor">
      <div className="character-preview">
        <span className="preview-name">{name || '나의 이름'}</span>
        <Avatar appearance={a} size={224} />
        <div className="avatar-ground" />
        <span className="preview-label">
          <Sparkles size={14} /> 교실 속, 나의 모습
        </span>
        <p>
          나만의 캐릭터와 함께
          <br />
          새로운 가능성을 만들어 가요.
        </p>
        <span className="uniform-note">
          <ShieldCheck size={15} /> 안전모와 작업복은 함께 입어요
        </span>
      </div>
      <form
        className="character-options"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name, a);
        }}
      >
        <Field label="이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            required
            placeholder="교실에서 사용할 이름"
          />
        </Field>
        <div className="field">
          <span>피부색</span>
          <div className="swatches">
            {['#f8dbc4', '#f1c6a1', '#dca57b', '#c88b63', '#9b674b', '#734b38'].map((c) => (
              <button
                type="button"
                key={c}
                className={a.skin === c ? 'selected' : ''}
                style={{ backgroundColor: c }}
                onClick={() => choose('skin', c)}
                aria-label={`피부색 ${c}`}
                aria-pressed={a.skin === c}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <span>머리카락 색상</span>
          <div className="swatches">
            {['#292a36', '#44372d', '#57362f', '#925b32', '#be965e', '#8f7b9e'].map((c) => (
              <button
                type="button"
                key={c}
                className={a.hair === c ? 'selected' : ''}
                style={{ backgroundColor: c }}
                onClick={() => choose('hair', c)}
                aria-label={`머리카락 ${c}`}
                aria-pressed={a.hair === c}
              />
            ))}
          </div>
        </div>
        <div className="form-grid">
          {(
            [
              { key: 'body', label: '체형', options: ['기본', '슬림', '통통'] },
              {
                key: 'hairstyle',
                label: '헤어스타일',
                options: ['자연스러운 앞머리', '긴 머리', '짧은 앞머리'],
              },
              { key: 'eyeShape', label: '눈 모양', options: ['동그란 눈', '웃는 눈', '또렷한 눈'] },
              { key: 'brows', label: '눈썹', options: ['편안하게', '살짝 올리기', '높이 올리기'] },
              { key: 'expression', label: '표정', options: ['차분하게', '활짝 웃기', '놀라기'] },
              { key: 'mouth', label: '입 모양', options: ['작은 미소', '밝은 미소', '동그란 입'] },
              {
                key: 'accessory',
                label: '얼굴 장식',
                options: ['없음', '동그란 안경', '반짝 스티커'],
              },
            ] as const
          ).map((f) => (
            <Field key={f.key} label={f.label}>
              <select value={a[f.key]} onChange={(e) => choose(f.key, Number(e.target.value))}>
                {f.options.map((o, i) => (
                  <option key={o} value={i}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field label="눈 색상">
            <select value={a.eyes} onChange={(e) => choose('eyes', e.target.value)}>
              <option value="#34364a">짙은 남색</option>
              <option value="#62432c">갈색</option>
              <option value="#44664b">초록색</option>
            </select>
          </Field>
        </div>
        <button className="button primary" type="submit" disabled={busy}>
          <Save size={16} />
          {busy ? '저장 중…' : '이 모습으로 저장하기'}
        </button>
      </form>
    </div>
  );
}
