import { useState } from 'react';
import { ArrowRight, ArrowLeft, KeyRound, GraduationCap, ShieldCheck } from 'lucide-react';
import { defaultAppearance, type Appearance } from '../shared/types';
import { api } from './api';
import { InlineNotice } from './ui';
import { Field, Avatar } from './components';
import { CharacterEditor } from './CharacterEditor';
import { EnrollmentAuth } from './EnrollmentAuth';
export type Config = {
  demo: boolean;
  bootstrap: boolean;
  aiConfigured: boolean;
  approvalRegistrationEnabled?: boolean;
  acceptingApplications?: boolean;
  schoolName?: string;
};
type AuthProps = {
  config: Config;
  onSuccess: () => void;
  onToast: (s: string) => void;
  embedded?: boolean;
};
export function Auth(props: AuthProps) {
  return props.config.approvalRegistrationEnabled && !props.config.bootstrap ? (
    <EnrollmentAuth {...props} />
  ) : (
    <LegacyAuth {...props} />
  );
}
function LegacyAuth({
  config,
  onSuccess,
  onToast,
  embedded = false,
}: {
  config: Config;
  onSuccess: () => void;
  onToast: (s: string) => void;
  embedded?: boolean;
}) {
  const approval = !!config.approvalRegistrationEnabled;
  const publicEntry = location.pathname === '/join';
  const queryKey = new URLSearchParams(location.search).get('invite') || '';
  const resetKey = new URLSearchParams(location.search).get('reset') || '';
  const [mode, setMode] = useState(
      resetKey
        ? 'recover'
        : config.bootstrap
          ? 'bootstrap'
          : publicEntry && !new URLSearchParams(location.search).has('login')
            ? 'register'
            : queryKey
              ? 'register'
              : 'login',
    ),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [key, setKey] = useState(resetKey || queryKey),
    [name, setName] = useState(''),
    [appearance, setAppearance] = useState<Appearance>(defaultAppearance),
    [customize, setCustomize] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (busy) return;
    setError('');
    if (approval && mode === 'register' && password !== confirmation) {
      setError('비밀번호가 서로 달라요. 다시 확인해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const enrollment = approval && ['register', 'login', 'recover'].includes(mode);
      const result = await api<{ status?: string }>(
        enrollment ? '/enrollment/' + mode : mode === 'recover' ? '/account/recover' : '/' + mode,
        'POST',
        enrollment && mode === 'register'
          ? { email, password, name, appearance }
          : enrollment && mode === 'login'
            ? { email, password }
            : { email, password, key, name, appearance },
      );
      history.replaceState(null, '', location.pathname);
      if (mode === 'recover') {
        setMode('login');
        setPassword('');
        setKey('');
        onToast('비밀번호를 재설정했어요. 새 비밀번호로 로그인해 주세요.');
        return;
      }
      sessionStorage.removeItem('pixel-signed-out');
      if (
        approval &&
        !publicEntry &&
        result.status &&
        ['PENDING', 'REJECTED'].includes(result.status)
      ) {
        location.assign('/join');
        return;
      }
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
      onToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`auth-shell ${embedded ? 'embedded' : ''}`}>
      <div className="auth-brand">
        <div className="auth-terminal">
          <div className="auth-terminal-bar">
            <span aria-hidden="true">&gt;_</span> pixel-class / workspace
          </div>
          <div className="auth-terminal-body">
            <p className="auth-kicker">AI LEARNING WORKSPACE</p>
            <strong>PIXEL CLASS</strong>
            <p className="auth-team">{config.schoolName || '성동자이리버뷰 안전보건팀'}</p>
            <div className="auth-pixel-people" aria-hidden="true">
              <Avatar appearance={defaultAppearance} size={112} />
              <Avatar
                appearance={{ ...defaultAppearance, hairstyle: 1, hair: '#925b32', accessory: 1 }}
                size={112}
              />
            </div>
            <p className="auth-terminal-status">
              <i /> PROJECTS · SUBMISSIONS · FEEDBACK
            </p>
          </div>
        </div>
      </div>
      <div className="auth-content">
        {customize ? (
          <>
            <button className="text-button" onClick={() => setCustomize(false)}>
              <ArrowLeft size={15} />
              입학 정보로 돌아가기
            </button>
            <CharacterEditor
              onSave={(n, a) => {
                setName(n);
                setAppearance(a);
                setCustomize(false);
              }}
              member={{
                id: '',
                name,
                appearance,
                role: 'STUDENT',
                status: 'INVITED',
                schoolId: '',
                help: false,
                deskId: null,
                workStatus: 'IDLE',
              }}
            />
          </>
        ) : (
          <>
            <p className="eyebrow">
              {config.demo
                ? 'LOCAL WORKSPACE'
                : approval
                  ? 'WELCOME TO OUR SCHOOL'
                  : '02 / 02 · ACCOUNT'}
            </p>
            <h1>
              {mode === 'bootstrap'
                ? '우리 학교를 시작해요'
                : mode === 'recover'
                  ? '비밀번호를 다시 설정해요'
                  : mode === 'register'
                    ? approval
                      ? '회원가입을 신청해요'
                      : '새로운 시작을 환영해요'
                    : '다시 만나 반가워요'}
            </h1>
            <p className="muted">
              {mode === 'bootstrap'
                ? '서버에 설정한 부트스트랩 KEY로 최초 MASTER를 등록해요.'
                : mode === 'recover'
                  ? '선생님이 발급한 30분 유효 복구 KEY를 사용해요. 재설정하면 다른 기기는 로그아웃됩니다.'
                  : mode === 'register'
                    ? approval
                      ? '코드 없이 가입하고, 선생님의 승인과 반 배정을 기다려 주세요.'
                      : 'MASTER에게 받은 초대 KEY로 입학해 보세요.'
                    : approval
                      ? '가입한 계정으로 로그인해 승인 상태와 내 반을 확인하세요.'
                      : '교실 계정으로 로그인하세요. 선생님 계정은 접속 안내 파일에 있어요.'}
            </p>
            <div className="filter-tabs">
              <button
                className={mode === 'login' ? 'selected' : ''}
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
              >
                로그인
              </button>
              <button
                className={mode === 'recover' ? 'selected' : ''}
                onClick={() => {
                  setMode('recover');
                  setKey(resetKey);
                  setError('');
                }}
              >
                비밀번호 복구
              </button>
              <button
                className={mode === 'register' ? 'selected' : ''}
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
              >
                {approval ? '회원가입 신청' : '초대받아 입학'}
              </button>
              {config.bootstrap && (
                <button
                  className={mode === 'bootstrap' ? 'selected' : ''}
                  onClick={() => {
                    setMode('bootstrap');
                    setError('');
                  }}
                >
                  MASTER 등록
                </button>
              )}
            </div>
            {mode === 'register' && (
              <ol className="admission-steps" aria-label="입학 순서">
                <li>
                  <b>1</b>
                  {approval ? '계정 만들기' : '초대 KEY 확인'}
                </li>
                <li>
                  <b>2</b>
                  {approval ? '내 모습 선택' : '계정과 내 모습'}
                </li>
                <li>
                  <b>3</b>
                  {approval ? '승인 · 반 배정' : '교실 입장'}
                </li>
              </ol>
            )}
            {error && (
              <InlineNotice kind="error" title="입장 정보를 확인해 주세요">
                {error}
              </InlineNotice>
            )}
            <form
              className="project-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {mode === 'recover' && (
                <Field label="비밀번호 복구 KEY">
                  <input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    required
                    type="password"
                    autoComplete="off"
                    maxLength={64}
                  />
                  <small>선생님에게 본인 확인 후 복구 링크를 요청해 주세요.</small>
                </Field>
              )}
              {['register', 'bootstrap'].includes(mode) && (
                <>
                  {(mode === 'bootstrap' || !approval) && (
                    <Field label={mode === 'bootstrap' ? '부트스트랩 KEY' : '입학 초대 KEY'}>
                      <input
                        required
                        type="password"
                        autoComplete="off"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder="MASTER에게 받은 KEY"
                      />
                    </Field>
                  )}
                  <Field label="이름">
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={24}
                      placeholder="교실에서 사용할 이름"
                    />
                  </Field>
                </>
              )}
              {mode !== 'recover' && (
                <Field label="이메일">
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </Field>
              )}
              <Field
                label="비밀번호"
                hint={mode === 'login' ? undefined : '10자 이상으로 입력해 주세요.'}
              >
                <input
                  required
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={10}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                />
              </Field>
              {approval && mode === 'register' && (
                <Field label="비밀번호 확인">
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={128}
                    required
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </Field>
              )}
              {mode === 'register' && (
                <fieldset className="character-presets">
                  <legend>캐릭터 스타일 선택</legend>
                  {[
                    { ...defaultAppearance },
                    { ...defaultAppearance, hairstyle: 1, accessory: 1 },
                    { ...defaultAppearance, hairstyle: 2, hair: '#925b32', skin: '#c88b63' },
                    { ...defaultAppearance, hairstyle: 1, hair: '#57362f', accessory: 2 },
                  ].map((preset, i) => (
                    <button
                      type="button"
                      key={i}
                      className="character-preset"
                      aria-label={`캐릭터 스타일 ${i + 1}`}
                      aria-pressed={JSON.stringify(appearance) === JSON.stringify(preset)}
                      onClick={() => setAppearance(preset)}
                    >
                      <Avatar appearance={preset} size={64} />
                      <span>스타일 {i + 1}</span>
                    </button>
                  ))}
                </fieldset>
              )}
              {mode === 'register' && (
                <button
                  type="button"
                  className="character-select"
                  onClick={() => setCustomize(true)}
                >
                  <Avatar appearance={appearance} size={65} />
                  <span>
                    <strong>나의 캐릭터 꾸미기</strong>
                    <small>흰색 안전모 아래, 나만의 모습</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              )}
              <button
                className="button primary"
                disabled={busy || (mode === 'register' && config.acceptingApplications === false)}
              >
                {busy
                  ? '교실 문을 여는 중…'
                  : mode === 'login'
                    ? '교실 입장하기'
                    : mode === 'recover'
                      ? '새 비밀번호 저장'
                      : mode === 'register'
                        ? approval
                          ? '가입 신청하기'
                          : '입학하고 교실 입장하기'
                        : 'MASTER로 학교 시작하기'}
                <ArrowRight size={17} />
              </button>
            </form>
            {config.demo && (
              <div className="demo-login">
                <span>먼저 둘러보고 싶다면</span>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void api('/demo', 'POST', { role: 'STUDENT' })
                      .then(onSuccess)
                      .catch((e) => onToast(e.message))
                  }
                >
                  <GraduationCap size={16} />
                  학생 데모 입장
                </button>
                <p>
                  <ShieldCheck size={13} /> 로컬 체험용 학교 · 실제 교육 데이터와 분리
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
