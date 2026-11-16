import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Layers, Move, Sparkles } from 'lucide-react';
import { defaultAppearance, type Appearance } from '../shared/types';
import { spriteSamples, upgradeSprite } from '../shared/sprite-appearance';
import { Avatar } from './components';
import { legacyCharacterCanvas } from './game/character';
import { spriteLayerImages, spriteDiagnostics } from './game/spriteCharacter';
import type { SpriteMotion } from './game/spriteTypes';
import './character-art-lab.css';
const oldHair = [0, 1, 3, 7, 4, 6, 13, 8],
  oldClothes = [0, 0, 5, 1, 0, 2, 1, 3];
export function CharacterArtLab() {
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 720px)').matches);
  const [view, setView] = useState<'samples' | 'compare' | 'layers'>('samples'),
    [zoom, setZoom] = useState(2),
    [selected, setSelected] = useState(0),
    [motion, setMotion] = useState<'idle' | 'walk' | 'sit' | 'blink'>('idle'),
    [phase, setPhase] = useState(0),
    [anchors, setAnchors] = useState(false);
  useEffect(() => {
    const media = matchMedia('(max-width: 720px)');
    const change = () => {
      setCompact(media.matches);
      if (media.matches) setZoom((z) => (z === 4 ? 2 : z));
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    setPhase(0);
    if (motion !== 'walk' || reduced) return;
    const timer = setInterval(() => setPhase((n) => (n + 1) % 3), 260);
    return () => clearInterval(timer);
  }, [motion, reduced]);
  const samples = useMemo(
    () =>
      spriteSamples.map(({ name, ...look }, i) => ({
        name,
        appearance: upgradeSprite({ ...defaultAppearance, ...look }),
        before: legacyCharacterCanvas({
          ...defaultAppearance,
          ...look,
          hairstyle: oldHair[i],
          outfit: oldClothes[i],
          helmetStyle: i ? 1 : 0,
          sprite: { version: 1 },
        }).toDataURL(),
      })),
    [],
  );
  const layers = useMemo(
    () => spriteLayerImages(samples[selected].appearance),
    [selected, samples],
  );
  const diagnostics = useMemo(() => samples.map((s) => spriteDiagnostics(s.appearance)), [samples]);
  const render = (a: Appearance, size: number) => {
    const m: SpriteMotion = { state: motion, phase: reduced ? 0 : phase };
    return (
      <div className="art-avatar-stage" style={{ width: size * 0.75, height: size }}>
        <Avatar
          appearance={a}
          size={size}
          direction={motion === 'sit' ? 'up' : 'down'}
          motion={m}
          alignFoot={false}
        />
        {anchors && (
          <>
            <i className="art-guide art-foot" />
            <i className="art-guide art-eyes" />
          </>
        )}
      </div>
    );
  };
  return (
    <main className="character-art-room">
      <header className="art-room-header">
        <a href="/">
          <ArrowLeft size={17} />
          교실로 돌아가기
        </a>
        <span>PIXEL CLASS · CHARACTER ATELIER</span>
        <h1>작은 도트, 저마다의 이야기</h1>
        <p>
          독립된 픽셀 에셋을 조합한 8종의 캐릭터입니다. 원본·확대·이전 모습을 같은 조건에서 비교해
          보세요.
        </p>
      </header>
      <section className="art-room-toolbar" aria-label="아트 검토 도구">
        <div role="group" aria-label="보기 선택">
          {[
            { id: 'samples', label: '원본·확대', icon: Sparkles },
            { id: 'compare', label: '이전·새 모습', icon: Move },
            { id: 'layers', label: '부위별 에셋', icon: Layers },
          ].map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              aria-pressed={view === id}
              onClick={() => setView(id as typeof view)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="확대 배율">
          {[1, 2, 4].map((n) => (
            <button
              type="button"
              key={n}
              aria-pressed={zoom === n}
              onClick={() => setZoom(n)}
              disabled={n === 4 && compact}
            >
              {n}배
            </button>
          ))}
        </div>
        <div role="group" aria-label="동작 선택">
          {(
            [
              { id: 'idle', label: '기본 대기' },
              { id: 'walk', label: '걷기' },
              { id: 'sit', label: '앉기·뒷모습' },
              { id: 'blink', label: '눈 깜빡임' },
            ] as const
          ).map((v) => (
            <button
              type="button"
              key={v.id}
              aria-pressed={motion === v.id}
              onClick={() => setMotion(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={anchors} onClick={() => setAnchors(!anchors)}>
          기준점 보기
        </button>
      </section>
      {reduced && motion === 'walk' && (
        <p role="status" className="art-room-note">
          움직임 줄이기 설정에 따라 걷기 애니메이션을 멈췄습니다.
        </p>
      )}
      {view === 'layers' ? (
        <>
          <div className="art-sample-picker" role="group" aria-label="레이어 캐릭터 선택">
            {samples.map((s, i) => (
              <button
                type="button"
                key={s.name}
                aria-pressed={selected === i}
                onClick={() => setSelected(i)}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="art-layer-composite">
            {render(samples[selected].appearance, 160 * zoom)}
          </div>
          <section className="art-layer-grid">
            {layers.map((layer) => (
              <article key={layer.key}>
                <h2>{layer.label}</h2>
                <div>
                  <img
                    src={layer.src}
                    width={layer.width * 2}
                    height={layer.height * 2}
                    alt={`${layer.label} 픽셀 에셋`}
                  />
                </div>
                <p>
                  {layer.width}×{layer.height}px · 위치 {layer.x},{layer.y}
                </p>
              </article>
            ))}
          </section>
        </>
      ) : (
        <section
          className={`art-sample-grid ${view === 'compare' ? 'is-comparison' : ''} zoom-${zoom}`}
          aria-label="캐릭터 8종 갤러리"
        >
          {samples.map((s, i) => (
            <article key={s.name} className="art-sample-card">
              <header>
                <span>0{i + 1}</span>
                <h2>{s.name}</h2>
              </header>
              {view === 'compare' ? (
                <div className="art-comparison-pair">
                  <figure>
                    <figcaption>이전 코드 도형</figcaption>
                    <img
                      src={s.before}
                      width={120 * zoom}
                      height={160 * zoom}
                      alt={`${s.name} 이전 모습`}
                    />
                  </figure>
                  <figure>
                    <figcaption>새 스프라이트</figcaption>
                    {render(s.appearance, 160 * zoom)}
                  </figure>
                </div>
              ) : (
                <>
                  <div className="art-native">
                    <span>원본 120×160</span>
                    {render(s.appearance, 160)}
                  </div>
                  <div className="art-enlarged">
                    <span>정수 {zoom}배 확대</span>
                    {render(s.appearance, 160 * zoom)}
                  </div>
                </>
              )}
              <p className="art-card-validation">
                <Check size={13} />
                투명 배경 · 실제 레이어 합성
              </p>
            </article>
          ))}
        </section>
      )}
      <section className="art-room-footnote">
        <h2>아트 검증 기록</h2>
        <p>
          이 페이지는 완성 캐릭터 그림을 붙이는 대신 얼굴·눈·헤어 앞/옆/뒤·의상·장비를 실제 게임과
          같은 합성기로 그립니다. 옷깃과 발 기준점을 공유하며 눈 크기와 간격은 얼굴 안에서
          조절합니다.
        </p>
        <p>
          원본은 120×160px입니다. 확대는 nearest-neighbor로 표시하며 새 도트를 만들어 낸 것처럼
          보정하지 않습니다. 걷기·앉기는 공통 리그를 사용합니다. 손 흔들기 전용 프레임은 아직
          제작하지 않았습니다.
        </p>
        <div className="art-diagnostic-grid">
          {diagnostics.map((d, i) => (
            <div key={i}>
              <strong>{samples[i].name}</strong>
              <span>
                경계 픽셀 {d.edgePixels} · 반투명 {d.partialAlpha}
              </span>
              <span>
                표현 색 {d.colors} · 홍채 표시율 {d.irisVisible.join('/')}%
              </span>
            </div>
          ))}
        </div>
        <p>
          자동 검사는 정렬·투명도·데이터 호환성을 확인합니다. 캐릭터의 매력과 미적 완성도는 원본
          크기와 확대 모습을 함께 보고 판단해야 합니다.
        </p>
      </section>
    </main>
  );
}
