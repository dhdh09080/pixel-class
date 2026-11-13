import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
  Palette,
  ShieldCheck,
} from 'lucide-react';
import type { Config } from './Auth';
import { defaultAppearance, type Appearance } from '../shared/types';
import { defaultSchoolSettings } from '../shared/school';
import { appearancePresets, professionPresets } from '../shared/appearance';
import { Avatar, Field, Modal } from './components';
import { CharacterEditor } from './CharacterEditor';
import { InlineNotice } from './ui';
import { api, ApiError } from './api';
import './enrollment-auth.css';

type Mode = 'login' | 'register' | 'recover';
const looks: { label: string; appearance: Appearance }[] = [
  { label: '네이비 워커', appearance: defaultAppearance },
  { label: '동글 안경', appearance: { ...defaultAppearance, hairstyle: 1, accessory: 1 } },
  { label: '포레스트', appearance: { ...defaultAppearance, ...appearancePresets[3].changes } },
  { label: '라벤더', appearance: { ...defaultAppearance, ...appearancePresets[5].changes } },
  {
    label: '개발자',
    appearance: { ...defaultAppearance, hairstyle: 6, ...professionPresets[2].changes },
  },
  {
    label: '의사',
    appearance: {
      ...defaultAppearance,
      hairstyle: 3,
      skin: '#c88b63',
      ...professionPresets[3].changes,
    },
  },
];

export function EnrollmentAuth({
  config,
  onSuccess,
  embedded = false,
}: {
  config: Config;
  onSuccess: () => void;
  embedded?: boolean;
}) {
  const resetKey = new URLSearchParams(location.search).get('reset') || '';
  const [mode, setMode] = useState<Mode>(
    resetKey
      ? 'recover'
      : new URLSearchParams(location.search).has('register')
        ? 'register'
        : 'login',
  );
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [name, setName] = useState(''),
    [appearance, setAppearance] = useState<Appearance>(defaultAppearance);
  const [key, setKey] = useState(resetKey),
    [showPassword, setShowPassword] = useState(false);
  const [customize, setCustomize] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [feedback, setFeedback] = useState(''),
    [mismatch, setMismatch] = useState(false);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const requestBusy = useRef(false),
    title = useRef<HTMLHeadingElement>(null);
  const previousView = useRef(mode + ':' + step);
  const registering = mode === 'register',
    character = registering && step === 2;
  const school = config.schoolName || defaultSchoolSettings.name;
  useEffect(() => {
    const view = mode + ':' + step;
    if (view === previousView.current) return;
    previousView.current = view;
    title.current?.focus({ preventScroll: true });
    if (title.current && title.current.getBoundingClientRect().top < 0)
      title.current.scrollIntoView({ block: 'start' });
  }, [mode, step]);
  useEffect(() => {
    if (mismatch) confirmationInput.current?.focus();
  }, [mismatch]);
  function switchMode(next: Mode) {
    if (requestBusy.current || next === mode) return;
    setMode(next);
    setStep(1);
    setError('');
    setFeedback('');
    setMismatch(false);
    setShowPassword(false);
    // Credentials stay in memory while moving between signup steps, never in browser storage.
    setPassword('');
    setConfirmation('');
    history.replaceState(
      null,
      '',
      location.pathname +
        (next === 'register' ? '?register=1' : next === 'login' ? '?login=1' : ''),
    );
  }
  async function submit() {
    if (requestBusy.current) return;
    setError('');
    setFeedback('');
    if ((registering && step === 1) || mode === 'recover') {
      if (password !== confirmation) {
        setMismatch(true);
        return;
      }
      setMismatch(false);
    }
    if (registering && step === 1) {
      setStep(2);
      return;
    }
    if (registering && !name.trim()) {
      setError('교실에서 사용할 이름을 입력해 주세요.');
      return;
    }
    requestBusy.current = true;
    setBusy(true);
    try {
      const body = registering
        ? { email, password, name, appearance }
        : mode === 'recover'
          ? { key, password }
          : { email, password };
      const result = await api<{ status?: string }>('/enrollment/' + mode, 'POST', body);
      if (mode === 'recover') {
        setMode('login');
        setStep(1);
        setPassword('');
        setConfirmation('');
        setKey('');
        history.replaceState(null, '', location.pathname + '?login=1');
        setFeedback('새 비밀번호를 저장했어요. 이제 로그인해 주세요.');
        return;
      }
      sessionStorage.removeItem('pixel-signed-out');
      setPassword('');
      setConfirmation('');
      if (result.status && !['PENDING', 'REJECTED'].includes(result.status)) {
        location.assign('/');
        return;
      }
      if (location.pathname !== '/join') {
        location.assign('/join');
        return;
      }
      history.replaceState(null, '', '/join');
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
      if (registering && e instanceof ApiError && e.status === 409) setStep(1);
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  }
  const heading =
    mode === 'recover'
      ? '비밀번호를 다시 설정해요'
      : character
        ? '교실에서 만날 나의 모습'
        : registering
          ? '먼저 계정을 만들어요'
          : '교실에 로그인해요';
  return (
    <div className={'enrollment-auth' + (embedded ? ' is-embedded' : '')}>
      <aside className="enrollment-story" aria-label="학교 소개">
        <div className="enrollment-wordmark">
          <span aria-hidden="true">
            <GraduationCap size={22} />
          </span>
          <strong>{school}</strong>
        </div>
        <div className="enrollment-story-copy">
          <p className="signup-kicker">작은 교실, 커다란 가능성</p>
          <h2>
            나의 아이디어가
            <br />
            자라는 교실.
          </h2>
          <p>
            나만의 캐릭터로 만나고,
            <br />
            함께 배우며 AI 서비스를 만들어요.
          </p>
        </div>
        <div className="enrollment-story-scene" aria-hidden="true">
          <span className="enrollment-scene-spark spark-one">✦</span>
          <span className="enrollment-scene-spark spark-two">✧</span>
          <div className="enrollment-scene-board">
            <span>오늘의 한 걸음</span>
            <strong>{character ? '나답게, 함께 시작하기' : '상상을 나의 서비스로'}</strong>
            <i />
          </div>
          <div className="enrollment-scene-avatars">
            <Avatar
              appearance={character ? appearance : looks[0].appearance}
              size={160}
              decorative
            />
            <Avatar appearance={looks[3].appearance} size={112} decorative />
          </div>
          <span className="enrollment-scene-floor" />
        </div>
        <p className="enrollment-story-foot">
          <ShieldCheck size={15} /> 선생님의 승인 후 함께하는 우리 학교
        </p>
      </aside>
      <section className="enrollment-form-pane" aria-labelledby="enrollment-auth-title">
        <div className="enrollment-mode-switch" role="group" aria-label="계정 메뉴">
          <button
            type="button"
            aria-pressed={mode === 'login'}
            onClick={() => switchMode('login')}
            disabled={busy}
          >
            로그인
          </button>
          <button
            type="button"
            aria-pressed={registering}
            onClick={() => switchMode('register')}
            disabled={busy}
          >
            회원가입 신청
          </button>
        </div>
        {registering && (
          <ol className="signup-steps" aria-label="회원가입 단계">
            <li
              aria-current={step === 1 ? 'step' : undefined}
              className={step === 2 ? 'is-done' : ''}
            >
              <span>{step === 2 ? <Check size={13} /> : '1'}</span>계정 만들기
            </li>
            <li aria-current={step === 2 ? 'step' : undefined}>
              <span>2</span>캐릭터 선택
            </li>
          </ol>
        )}
        <header className="enrollment-form-heading">
          {!registering && (
            <p className="signup-kicker">
              {registering
                ? '회원가입 · ' + step + ' / 2'
                : mode === 'recover'
                  ? '계정 복구'
                  : '다시 만나 반가워요'}
            </p>
          )}
          <h1 id="enrollment-auth-title" ref={title} tabIndex={-1}>
            {heading}
          </h1>
          <p>
            {character
              ? '이름과 마음에 드는 스타일을 골라 주세요. 모습은 나중에도 바꿀 수 있어요.'
              : registering
                ? '이메일과 비밀번호부터 정해 볼까요? 다음 화면에서 캐릭터를 골라요.'
                : mode === 'recover'
                  ? '선생님이 발급한 복구 링크로 새 비밀번호를 설정하세요.'
                  : '가입한 계정으로 로그인하고, 나의 프로젝트를 이어 가세요.'}
          </p>
        </header>
        <div className="enrollment-form-stage" key={mode + ':' + step}>
          {feedback && (
            <InlineNotice kind="success" title="비밀번호 변경 완료">
              {feedback}
            </InlineNotice>
          )}
          {error && (
            <InlineNotice
              kind="error"
              title={registering ? '신청 정보를 확인해 주세요' : '다시 확인해 주세요'}
            >
              {error}
            </InlineNotice>
          )}
          {registering && config.acceptingApplications === false && (
            <InlineNotice title="학교를 준비하고 있어요">
              가입 신청은 선생님이 학교를 개설한 뒤 가능해요.
            </InlineNotice>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            aria-label={heading}
          >
            <fieldset className="enrollment-fields" disabled={busy}>
              {character ? (
                <>
                  <div className="signup-identity">
                    <div className="signup-preview">
                      <Avatar appearance={appearance} size={76} />
                    </div>
                    <Field label="이름" hint={'가입 계정 · ' + email}>
                      <input
                        name="name"
                        autoComplete="nickname"
                        value={name}
                        maxLength={24}
                        required
                        placeholder="나를 어떻게 부르면 좋을까요?"
                        onChange={(event) => setName(event.target.value)}
                      />
                    </Field>
                  </div>
                  <fieldset className="signup-looks">
                    <legend>마음에 드는 스타일을 골라요</legend>
                    <div className="signup-look-grid">
                      {looks.map((look, index) => {
                        const selected =
                          JSON.stringify(appearance) === JSON.stringify(look.appearance);
                        return (
                          <button
                            key={look.label}
                            type="button"
                            aria-label={'캐릭터 스타일 ' + (index + 1)}
                            aria-pressed={selected}
                            onClick={() => setAppearance(look.appearance)}
                          >
                            <Avatar appearance={look.appearance} size={50} decorative />
                            <span>{look.label}</span>
                            {selected && (
                              <i aria-hidden="true">
                                <Check size={12} />
                              </i>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <button
                    className="signup-customize"
                    type="button"
                    onClick={() => setCustomize(true)}
                  >
                    <Palette size={16} />
                    <span>더 자세히 꾸미기</span>
                    <ArrowRight size={15} />
                  </button>
                </>
              ) : (
                <>
                  {mode === 'recover' ? (
                    <Field
                      label="비밀번호 복구 KEY"
                      hint="복구 링크는 30분 동안 한 번 사용할 수 있어요."
                    >
                      <input
                        name="recoveryKey"
                        value={key}
                        onChange={(event) => setKey(event.target.value)}
                        required
                        type="password"
                        autoComplete="off"
                        maxLength={64}
                      />
                    </Field>
                  ) : (
                    <Field label="이메일">
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        maxLength={200}
                        required
                        placeholder="name@example.com"
                      />
                    </Field>
                  )}
                  <Field
                    label="비밀번호"
                    hint={mode === 'login' ? undefined : '10자 이상으로 만들어 주세요.'}
                  >
                    <div className="signup-password">
                      <input
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setMismatch(false);
                        }}
                        minLength={10}
                        maxLength={128}
                        required
                        placeholder={
                          mode === 'login' ? '비밀번호를 입력해 주세요' : '10자 이상의 비밀번호'
                        }
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </Field>
                  {mode !== 'login' && (
                    <Field
                      label="비밀번호 확인"
                      error={mismatch ? '비밀번호가 서로 달라요. 다시 확인해 주세요.' : undefined}
                    >
                      <input
                        ref={confirmationInput}
                        name="passwordConfirmation"
                        type="password"
                        autoComplete="new-password"
                        value={confirmation}
                        onChange={(event) => {
                          setConfirmation(event.target.value);
                          setMismatch(false);
                        }}
                        minLength={10}
                        maxLength={128}
                        required
                        placeholder="비밀번호를 한 번 더 입력해 주세요"
                      />
                    </Field>
                  )}
                </>
              )}
            </fieldset>
            {mode === 'login' && (
              <button
                className="signup-recovery-link"
                type="button"
                disabled={busy}
                onClick={() => switchMode('recover')}
              >
                비밀번호를 잊으셨나요?
              </button>
            )}
            <div className="signup-actions">
              {character && (
                <button
                  type="button"
                  className="signup-back"
                  disabled={busy}
                  onClick={() => {
                    setStep(1);
                    setError('');
                  }}
                >
                  <ArrowLeft size={16} />
                  이전 단계
                </button>
              )}
              <button
                className="signup-primary"
                type="submit"
                disabled={busy || (registering && config.acceptingApplications === false)}
              >
                {busy
                  ? registering
                    ? '신청을 보내는 중…'
                    : '확인하는 중…'
                  : character
                    ? '가입 신청 보내기'
                    : registering
                      ? '다음: 캐릭터 선택'
                      : mode === 'recover'
                        ? '새 비밀번호 저장'
                        : '로그인하고 교실로'}
                <ArrowRight size={17} />
              </button>
            </div>
          </form>
          <p className="signup-next-note">
            {registering
              ? character
                ? '신청 후에는 선생님의 승인과 반 배정을 기다려 주세요.'
                : '이 단계에서는 계정이 생성되지 않아요.'
              : mode === 'recover'
                ? '복구 링크가 없다면 선생님에게 본인 확인 후 요청해 주세요.'
                : '처음 오셨나요? 위의 회원가입 신청으로 시작해 보세요.'}
          </p>
          {mode === 'recover' && (
            <button
              className="signup-recovery-link"
              type="button"
              disabled={busy}
              onClick={() => switchMode('login')}
            >
              <ArrowLeft size={14} />
              로그인으로 돌아가기
            </button>
          )}
        </div>
      </section>
      {customize && (
        <div className="enrollment-studio">
          <Modal
            title="캐릭터 세부 꾸미기"
            subtitle="여기서는 외모만 선택해요. 가입 신청은 다음에 완료합니다."
            wide
            onClose={() => setCustomize(false)}
          >
            <CharacterEditor
              member={{
                id: '',
                schoolId: '',
                role: 'STUDENT',
                status: 'PENDING',
                name,
                appearance,
                help: false,
                workStatus: 'IDLE',
                deskId: null,
              }}
              onCancel={() => setCustomize(false)}
              onSave={(nextName, nextAppearance) => {
                setName(nextName);
                setAppearance(nextAppearance);
                setCustomize(false);
              }}
            />
          </Modal>
        </div>
      )}
    </div>
  );
}
